import { ADVICE_MODELS, type AdviceModel } from "../../src/ai/shopAdvice.ts";
import { validateGameCoachResult, type GameCoachResult } from "../../src/ai/gameCoach.ts";
import type { GameCoachContext, GameSessionManager } from "../gameSession.ts";
import { ProviderFailure, type ProviderResponse } from "./shopAdvice.ts";

export type GameCoachTransport = (
  model: AdviceModel,
  context: Omit<GameCoachContext, "runNumber">,
  signal: AbortSignal,
) => Promise<ProviderResponse>;

export type GameCoach = { coach: (manager: GameSessionManager, gameId: string, signal?: AbortSignal) => Promise<GameCoachResult> };

const ATTEMPT_TIMEOUT_MS = 3_500;
const MAX_CACHED_RUNS = 100;

function unavailable(code: Extract<GameCoachResult, { status: "unavailable" }>["code"]): GameCoachResult {
  const message = code === "not_configured" ? "AI COACH IS OFFLINE. START THE SERVER WITH GEMINI_API_KEY TO ENABLE IT."
    : code === "cancelled" ? "AI COACH REQUEST WAS CANCELLED."
      : code === "busy" ? "AI COACH IS BUSY. TRY AGAIN IN A MOMENT."
        : "AI COACH IS UNAVAILABLE RIGHT NOW. YOUR RUN IS SAFE.";
  return { status: "unavailable", code, message };
}

function safeContext(context: GameCoachContext): Omit<GameCoachContext, "runNumber"> {
  return {
    mode: context.mode,
    difficulty: context.difficulty,
    score: context.score,
    level: context.level,
    snakeLength: context.snakeLength,
    foodEaten: context.foodEaten,
    bonusesCollected: context.bonusesCollected,
    collisions: context.collisions,
    rivalScore: context.rivalScore,
    rivalAliveAtEnd: context.rivalAliveAtEnd,
    endedBy: context.endedBy,
  };
}

async function timedAttempt(
  transport: GameCoachTransport,
  model: AdviceModel,
  context: Omit<GameCoachContext, "runNumber">,
  signal?: AbortSignal,
): Promise<ProviderResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ATTEMPT_TIMEOUT_MS);
  try {
    return await transport(model, context, controller.signal);
  } catch (error) {
    if (signal?.aborted) throw new ProviderFailure("terminal", undefined, undefined, "cancelled");
    if (controller.signal.aborted) throw new ProviderFailure("transient", 408, undefined, "timeout");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createGameCoach(transport: GameCoachTransport | null): GameCoach {
  const completed = new Map<string, GameCoachResult>();
  const pending = new Map<string, Promise<GameCoachResult>>();

  async function perform(context: GameCoachContext, signal?: AbortSignal): Promise<GameCoachResult> {
    if (!transport) return unavailable("not_configured");
    const safe = safeContext(context);
    for (const model of ADVICE_MODELS) {
      try {
        const response = await timedAttempt(transport, model, safe, signal);
        const candidate = response.value;
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          const output = candidate as Record<string, unknown>;
          if (Object.keys(output).length === 2 && Object.hasOwn(output, "headline") && Object.hasOwn(output, "tip")) {
            const result = validateGameCoachResult({ status: "coaching", headline: output.headline, tip: output.tip, model });
            if (result?.status === "coaching") return result;
          }
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof ProviderFailure && error.errorClass === "cancelled")) return unavailable("cancelled");
        if (error instanceof ProviderFailure && error.kind === "terminal") break;
      }
    }
    return unavailable("temporarily_unavailable");
  }

  return {
    async coach(manager, gameId, signal) {
      const context = manager.getCoachContext(gameId);
      const key = `${gameId}:${context.runNumber}`;
      const cached = completed.get(key);
      if (cached) return cached;
      const active = pending.get(key);
      if (active) return active;
      const operation = perform(context, signal).then((result) => {
        completed.set(key, result);
        while (completed.size > MAX_CACHED_RUNS) completed.delete(completed.keys().next().value!);
        return result;
      }).finally(() => pending.delete(key));
      pending.set(key, operation);
      return operation;
    },
  };
}
