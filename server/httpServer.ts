import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { GameSessionManager, SessionError } from "./gameSession.ts";
import type { Direction } from "../src/game/snakeEngine.ts";
import { createShopAdvisor, type ShopAdvisor } from "./ai/shopAdvice.ts";
import { AGENT_GOAL } from "../src/ai/shopAgent.ts";
import { createShopAgent, type ShopAgent } from "./agent/shopAgent.ts";
import { createGameCoach, type GameCoach } from "./ai/gameCoach.ts";

type ApiError = { error: { code: string; message: string } };

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_384) throw new HttpError(413, "payload_too_large", "Request body is too large.");
    chunks.push(buffer);
  }
  if (length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
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

async function handleRequest(request: IncomingMessage, response: ServerResponse, manager: GameSessionManager, advisor: ShopAdvisor, agent: ShopAgent, coach: GameCoach): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
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
          throw new HttpError(400, "invalid_request", "Shop advice does not accept request fields.");
        }
        const snapshot = manager.get(gameId);
        if (snapshot.state.status !== "paused") {
          throw new HttpError(409, "invalid_status", "Shop advice is available only while paused.");
        }
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const advice = await advisor.advise(manager, gameId, controller.signal);
          if (!response.destroyed) sendJson(response, 200, { advice });
        } finally {
          response.removeListener("close", onClose);
        }
        return;
      }
      if (action === "shop-agent") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 1 || body.goal !== AGENT_GOAL) {
          throw new HttpError(400, "invalid_request", `Shop agent expects exactly {"goal":"${AGENT_GOAL}"}.`);
        }
        const snapshot = manager.get(gameId);
        if (snapshot.state.status !== "paused") {
          throw new HttpError(409, "invalid_status", "Shop agent is available only while paused.");
        }
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const run = await agent.run(manager, gameId, controller.signal);
          if (!response.destroyed) sendJson(response, 200, { run });
        } finally {
          response.removeListener("close", onClose);
        }
        return;
      }
      if (action === "coach") {
        const body = await readJson(request);
        if (!isRecord(body) || Object.keys(body).length !== 0) {
          throw new HttpError(400, "invalid_request", "The AI coach does not accept request fields.");
        }
        const controller = new AbortController();
        const onClose = () => { if (!response.writableEnded) controller.abort(); };
        response.once("close", onClose);
        try {
          const result = await coach.coach(manager, gameId, controller.signal);
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
    if (!response.destroyed) sendJson(response, apiError.status, body);
  }
}

export function createGameHttpServer(
  manager: GameSessionManager = new GameSessionManager(),
  advisor: ShopAdvisor = createShopAdvisor(null),
  agent: ShopAgent = createShopAgent(null),
  coach: GameCoach = createGameCoach(null),
): Server {
  const server = createServer((request, response) => {
    void handleRequest(request, response, manager, advisor, agent, coach);
  });
  const webSockets = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/api\/games\/([^/]+)\/events$/.exec(url.pathname);
    if (!match) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    const gameId = decodeURIComponent(match[1]);
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
