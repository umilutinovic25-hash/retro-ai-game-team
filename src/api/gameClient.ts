import { validateGameSnapshot, type GameSnapshot } from "../game/gameProtocol.ts";
import type { GameConfig } from "../game/snakeConfig.ts";
import type { Direction } from "../game/snakeEngine.ts";
import { validateShopAdviceResult, type ShopAdviceResult } from "../ai/shopAdvice.ts";
import { AGENT_GOAL, validatePublicAgentRun, type PublicAgentRun } from "../ai/shopAgent.ts";
import { validateGameCoachResult, type GameCoachResult } from "../ai/gameCoach.ts";

export class GameApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "GameApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function request(path: string, method = "GET", body?: unknown): Promise<GameSnapshot> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new GameApiError("server_unavailable", "GAME SERVER IS UNAVAILABLE.", 0);
  }
  let result: unknown;
  try {
    result = await response.json() as unknown;
  } catch {
    throw new GameApiError("invalid_server_response", "GAME SERVER RETURNED AN INVALID RESPONSE.", response.status);
  }
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) ? result.error : null;
    throw new GameApiError(
      typeof error?.code === "string" ? error.code : "request_failed",
      typeof error?.message === "string" ? error.message : "GAME REQUEST FAILED.",
      response.status,
    );
  }
  const game = isRecord(result) ? validateGameSnapshot(result.game) : null;
  if (!game) throw new GameApiError("invalid_server_response", "GAME SERVER RETURNED AN INVALID SNAPSHOT.", response.status);
  return game;
}

async function requestShopAdvice(gameId: string, signal?: AbortSignal): Promise<ShopAdviceResult> {
  let response: Response;
  try {
    response = await fetch(`/api/games/${encodeURIComponent(gameId)}/shop-advice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal,
    });
  } catch {
    throw new GameApiError(signal?.aborted ? "cancelled" : "server_unavailable", "SHOP ADVICE IS UNAVAILABLE.", 0);
  }
  let result: unknown;
  try {
    result = await response.json() as unknown;
  } catch {
    throw new GameApiError("invalid_server_response", "SHOP ADVICE IS UNAVAILABLE.", response.status);
  }
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) ? result.error : null;
    throw new GameApiError(typeof error?.code === "string" ? error.code : "request_failed", "SHOP ADVICE IS UNAVAILABLE.", response.status);
  }
  if (!isRecord(result) || Object.keys(result).length !== 1) {
    throw new GameApiError("invalid_server_response", "SHOP ADVICE IS UNAVAILABLE.", response.status);
  }
  const advice = validateShopAdviceResult(result.advice);
  if (!advice) throw new GameApiError("invalid_server_response", "SHOP ADVICE IS UNAVAILABLE.", response.status);
  return advice;
}

async function requestShopAgent(gameId: string, signal?: AbortSignal): Promise<PublicAgentRun> {
  const unavailable = "SHOP STRATEGIST IS UNAVAILABLE.";
  let response: Response;
  try {
    response = await fetch(`/api/games/${encodeURIComponent(gameId)}/shop-agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: AGENT_GOAL }),
      signal,
    });
  } catch {
    throw new GameApiError(signal?.aborted ? "cancelled" : "server_unavailable", unavailable, 0);
  }
  let result: unknown;
  try {
    result = await response.json() as unknown;
  } catch {
    throw new GameApiError("invalid_server_response", unavailable, response.status);
  }
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) ? result.error : null;
    throw new GameApiError(typeof error?.code === "string" ? error.code : "request_failed", unavailable, response.status);
  }
  const run = isRecord(result) && Object.keys(result).length === 1 ? validatePublicAgentRun(result.run) : null;
  if (!run) throw new GameApiError("invalid_server_response", unavailable, response.status);
  return run;
}

async function requestGameCoach(gameId: string, signal?: AbortSignal): Promise<GameCoachResult> {
  const unavailable = "AI COACH IS UNAVAILABLE.";
  let response: Response;
  try {
    response = await fetch(`/api/games/${encodeURIComponent(gameId)}/coach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal,
    });
  } catch {
    throw new GameApiError(signal?.aborted ? "cancelled" : "server_unavailable", unavailable, 0);
  }
  let result: unknown;
  try {
    result = await response.json() as unknown;
  } catch {
    throw new GameApiError("invalid_server_response", unavailable, response.status);
  }
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) ? result.error : null;
    throw new GameApiError(typeof error?.code === "string" ? error.code : "request_failed", unavailable, response.status);
  }
  const coach = isRecord(result) && Object.keys(result).length === 1 ? validateGameCoachResult(result.coach) : null;
  if (!coach) throw new GameApiError("invalid_server_response", unavailable, response.status);
  return coach;
}

export const gameClient = {
  create: (config?: GameConfig) => request("/api/games", "POST", config ? { config } : {}),
  get: (gameId: string) => request(`/api/games/${encodeURIComponent(gameId)}`),
  move: (gameId: string, direction: Direction) => request(`/api/games/${encodeURIComponent(gameId)}/move`, "POST", { direction }),
  pause: (gameId: string) => request(`/api/games/${encodeURIComponent(gameId)}/pause`, "POST", {}),
  resume: (gameId: string) => request(`/api/games/${encodeURIComponent(gameId)}/resume`, "POST", {}),
  restart: (gameId: string) => request(`/api/games/${encodeURIComponent(gameId)}/restart`, "POST", {}),
  purchasePerk: (gameId: string, perk: "extra_xp" | "extra_life" | "luck") => request(`/api/games/${encodeURIComponent(gameId)}/perks`, "POST", { perk }),
  shopAdvice: requestShopAdvice,
  shopAgent: requestShopAgent,
  gameCoach: requestGameCoach,
};

export function connectGameEvents(gameId: string, onSnapshot: (snapshot: GameSnapshot) => void, onConnection: (connected: boolean) => void): () => void {
  let socket: WebSocket | undefined;
  let stopped = false;
  let reconnectTimer: number | undefined;
  let retryMs = 500;

  const connect = () => {
    if (stopped) return;
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${scheme}//${window.location.host}/api/games/${encodeURIComponent(gameId)}/events`);
    socket.addEventListener("open", () => {
      retryMs = 500;
      onConnection(true);
    });
    socket.addEventListener("message", (event) => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (!isRecord(message) || message.type !== "snapshot") return;
        const snapshot = validateGameSnapshot(message.game);
        if (snapshot) onSnapshot(snapshot);
      } catch {
        // Ignore malformed event data; the next valid authoritative snapshot will recover the view.
      }
    });
    socket.addEventListener("close", () => {
      onConnection(false);
      if (stopped) return;
      reconnectTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 8_000);
    });
    socket.addEventListener("error", () => socket?.close());
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
