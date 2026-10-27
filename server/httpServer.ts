import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { GameSessionManager, SessionError } from "./gameSession.ts";
import type { Direction } from "../src/game/snakeEngine.ts";
import { createShopAdvisor, type ShopAdvisor } from "./ai/shopAdvice.ts";
import { AGENT_GOAL } from "../src/ai/shopAgent.ts";
import { createShopAgent, type ShopAgent } from "./agent/shopAgent.ts";
import { createGameCoach, type GameCoach } from "./ai/gameCoach.ts";
import { createAdmissionControl, type AdmissionControl } from "./security/admission.ts";
import { orphanedProviderWork } from "./security/providerWork.ts";
import { declaredLength, hasJsonContentType, isAllowedHost, isAllowedOrigin } from "./security/guards.ts";
import { SECURITY_LIMITS } from "./security/limits.ts";
import { createSecurityLog, newCorrelationId, type ReasonCode, type SecurityLog } from "./security/securityLog.ts";
import { BASE_HEADERS, serveStatic } from "./security/staticFiles.ts";

export type HttpServerOptions = {
  admission?: AdmissionControl;
  securityLog?: SecurityLog;
  /** Directory of the production build. When set, this server also serves the client from the same origin. */
  staticRoot?: string;
  allowedOrigins?: readonly string[];
};

type Security = { admission: AdmissionControl; log: SecurityLog; allowedOrigins: readonly string[]; staticRoot?: string };

type ApiError = { error: { code: string; message: string } };

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason?: ReasonCode;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, reason?: ReasonCode, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendJson(response: ServerResponse, status: number, value: unknown, extra: Record<string, string> = {}): void {
  response.writeHead(status, { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
  response.end(JSON.stringify(value));
}

/** Stop reasons that mean the model proposed something the application refused. */
const SECURITY_STOPS = new Set(["unknown_tool", "invalid_tool_arguments", "invalid_model_proposal", "tool_failed", "tool_call_limit", "repeated_action"]);

const tooLarge = () => new HttpError(413, "payload_too_large", "Request body is too large.", "BODY_TOO_LARGE");

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = declaredLength(request);
  if (declared !== null && declared > SECURITY_LIMITS.maxBodyBytes) throw tooLarge();
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > SECURITY_LIMITS.maxBodyBytes) throw tooLarge();
    chunks.push(buffer);
  }
  if (length === 0) return {};
  if (!hasJsonContentType(request)) {
    throw new HttpError(415, "unsupported_media_type", "Request body must be application/json.", "UNSUPPORTED_MEDIA_TYPE");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.", "INVALID_REQUEST");
  }
}

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "right" || value === "down" || value === "left";
}

function asHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof SessionError) {
    return new HttpError(error.code === "game_not_found" ? 404 : 409, error.code, error.message);
  }
  return new HttpError(500, "internal_error", "The server could not complete the request.");
}

async function withAdmission<T>(security: Security, correlationId: string, work: () => Promise<T>): Promise<T> {
  const admission = security.admission.tryAcquire();
  if (!admission.ok) {
    const capacity = admission.reason === "CAPACITY_EXCEEDED";
    throw new HttpError(capacity ? 503 : 429, capacity ? "server_busy" : "rate_limited",
      capacity ? "The server is busy. Try again shortly." : "Too many requests. Try again later.", admission.reason, admission.retryAfterSeconds);
  }
  try {
    return await work();
  } finally {
    admission.release();
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, manager: GameSessionManager, advisor: ShopAdvisor, agent: ShopAgent, coach: GameCoach, security: Security): Promise<void> {
  const correlationId = newCorrelationId();
  try {
    if (!isAllowedHost(request)) throw new HttpError(403, "host_not_allowed", "Host is not allowed.", "HOST_NOT_ALLOWED");
    if (!isAllowedOrigin(request, security.allowedOrigins, Boolean(security.staticRoot))) throw new HttpError(403, "origin_not_allowed", "Origin is not allowed.", "ORIGIN_NOT_ALLOWED");
    const url = new URL(request.url ?? "/", "http://localhost");
    if (security.staticRoot && request.method === "GET" && !url.pathname.startsWith("/api/")) {
      if (await serveStatic(security.staticRoot, url.pathname, response)) return;
    }
    const path = url.pathname.split("/").filter(Boolean);
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/games") {
      const body = await readJson(request);
      if (!isRecord(body) || Object.keys(body).some((key) => key !== "config")) {
        throw new HttpError(400, "invalid_request", "Expected an object with an optional config field.");
      }
      const game = manager.create(body.config);
      sendJson(response, 201, { game });
      return;
    }
    if (path[0] !== "api" || path[1] !== "games" || !path[2] || path.length > 4) {
      throw new HttpError(404, "route_not_found", "API route was not found.");
    }
    const gameId = path[2];
    if (request.method === "GET" && path.length === 3) {
      sendJson(response, 200, { game: manager.get(gameId) });
      return;
    }
    if (request.method === "POST" && path.length === 4) {
      const action = path[3];
      if (action === "shop-advice") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 0) {
          throw new HttpError(400, "invalid_request", "Shop advice does not accept request fields.", "INVALID_REQUEST");
        }
        const snapshot = manager.get(gameId);
        if (snapshot.state.status !== "paused") {
          throw new HttpError(409, "invalid_status", "Shop advice is available only while paused.");
        }
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const advice = await withAdmission(security, correlationId, () => advisor.advise(manager, gameId, controller.signal));
          if (!response.destroyed) sendJson(response, 200, { advice });
        } finally {
          response.removeListener("close", onClose);
        }
        return;
      }
      if (action === "shop-agent") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 1 || body.goal !== AGENT_GOAL) {
          throw new HttpError(400, "invalid_request", `Shop agent expects exactly {"goal":"${AGENT_GOAL}"}.`, "INVALID_REQUEST");
        }
        const snapshot = manager.get(gameId);
        if (snapshot.state.status !== "paused") {
          throw new HttpError(409, "invalid_status", "Shop agent is available only while paused.");
        }
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const run = await withAdmission(security, correlationId, () => agent.run(manager, gameId, controller.signal));
          if (run.status === "completed") {
            security.log({ event: "agent.run.finished", correlationId, reasonCode: "AGENT_RUN_COMPLETED", outcome: "allowed", steps: run.steps, executedToolCalls: run.toolCalls });
          } else if (SECURITY_STOPS.has(run.stopReason)) {
            security.log({ event: "agent.run.rejected", correlationId, reasonCode: "AGENT_RUN_REJECTED", outcome: "denied", stopReason: run.stopReason, steps: run.steps, executedToolCalls: run.toolCalls });
          } else {
            security.log({ event: "agent.run.finished", correlationId, reasonCode: "AGENT_RUN_STOPPED", outcome: "stopped", stopReason: run.stopReason, steps: run.steps, executedToolCalls: run.toolCalls });
          }
          if (!response.destroyed) sendJson(response, 200, { run });
        } finally {
          response.removeListener("close", onClose);
        }
        return;
      }
      if (action === "coach") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 0) {
          throw new HttpError(400, "invalid_request", "The AI coach does not accept request fields.", "INVALID_REQUEST");
        }
        manager.getCoachContext(gameId); // Validate resource/status before consuming an admission token.
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const result = await withAdmission(security, correlationId, () => coach.coach(manager, gameId, controller.signal));
          if (!response.destroyed) sendJson(response, 200, { coach: result });
        } finally {
          response.removeListener("close", onClose);
        }
        return;
      }
      if (action === "move") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 1 || !isDirection(body.direction)) {
          throw new HttpError(400, "invalid_move", "Expected a direction: up, right, down, or left.");
        }
        sendJson(response, 200, { game: manager.move(gameId, body.direction) });
        return;
      }
      if (action === "perks") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 1
          || (body.perk !== "extra_xp" && body.perk !== "extra_life" && body.perk !== "luck")) {
          throw new HttpError(400, "invalid_purchase", "Expected exactly one perk: extra_xp, extra_life, or luck.");
        }
        sendJson(response, 200, { game: manager.purchasePerk(gameId, body.perk) });
        return;
      }
      if (["pause", "resume", "restart"].includes(action)) {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 0) {
          throw new HttpError(400, "invalid_request", "This action does not accept request fields.");
        }
        const game = action === "pause" ? manager.pause(gameId)
          : action === "resume" ? manager.resume(gameId)
            : manager.restart(gameId);
        sendJson(response, 200, { game });
        return;
      }
    }
    throw new HttpError(404, "route_not_found", "API route was not found.");
  } catch (error) {
    const apiError = asHttpError(error);
    const body: ApiError = { error: { code: apiError.code, message: apiError.message } };
    if (apiError.reason) security.log({ event: "http.request.rejected", correlationId, reasonCode: apiError.reason, outcome: "denied", status: apiError.status });
    const extra: Record<string, string> = { "x-correlation-id": correlationId };
    if (apiError.retryAfterSeconds !== undefined) extra["retry-after"] = String(apiError.retryAfterSeconds);
    if (!response.destroyed) sendJson(response, apiError.status, body, extra);
  }
}

export function createGameHttpServer(
  manager: GameSessionManager = new GameSessionManager(),
  advisor: ShopAdvisor = createShopAdvisor(null),
  agent: ShopAgent = createShopAgent(null),
  coach: GameCoach = createGameCoach(null),
  options: HttpServerOptions = {},
): Server {
  for (const origin of options.allowedOrigins ?? []) {
    let parsed: URL | null = null;
    try { parsed = new URL(origin); } catch { /* rejected below */ }
    if (!parsed || parsed.origin !== origin || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      throw new Error("allowedOrigins entries must be exact http(s) origins such as http://localhost:5173 (not *, null or a URL with a path).");
    }
  }
  if (options.staticRoot !== undefined && options.staticRoot.trim() === "") throw new Error("staticRoot must name the build directory.");
  const security: Security = {
    admission: options.admission ?? createAdmissionControl(undefined, Date.now, orphanedProviderWork),
    log: options.securityLog ?? createSecurityLog(),
    allowedOrigins: options.allowedOrigins ?? [],
    staticRoot: options.staticRoot,
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response, manager, advisor, agent, coach, security);
  });
  const webSockets = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const rejectMalformed = () => {
      security.log({ event: "http.request.rejected", correlationId: newCorrelationId(), reasonCode: "INVALID_REQUEST", outcome: "denied", status: 400 });
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    };
    let url: URL;
    try { url = new URL(request.url ?? "/", "http://localhost"); } catch {
      rejectMalformed();
      return;
    }
    const match = /^\/api\/games\/([^/]+)\/events$/.exec(url.pathname);
    if (!isAllowedHost(request) || !isAllowedOrigin(request, security.allowedOrigins, Boolean(security.staticRoot))) {
      security.log({ event: "http.request.rejected", correlationId: newCorrelationId(), reasonCode: "ORIGIN_NOT_ALLOWED", outcome: "denied", status: 403 });
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!match) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    let gameId: string;
    try { gameId = decodeURIComponent(match[1]); } catch {
      rejectMalformed();
      return;
    }
    try {
      manager.get(gameId);
    } catch {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (client) => {
      webSockets.emit("connection", client, request, gameId);
    });
  });

  webSockets.on("connection", (client: WebSocket, _request: IncomingMessage, gameId: string) => {
    let unsubscribe = () => {};
    try {
      unsubscribe = manager.subscribe(gameId, (game) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "snapshot", game }));
      });
    } catch {
      client.close(1008, "Game session not found");
      return;
    }
    client.on("message", () => client.close(1008, "This connection only sends snapshots"));
    client.once("close", unsubscribe);
    client.once("error", unsubscribe);
  });

  server.on("close", () => {
    webSockets.close();
    manager.close();
  });
  return server;
}
