import { randomUUID } from "node:crypto";
import { adoptOrphanedProviderWork } from "../security/providerWork.ts";
import type { GameSnapshot } from "../../src/game/gameProtocol.ts";
import { getLevelForXp } from "../../src/game/snakeEngine.ts";
import {
  ADVICE_MODELS,
  isAdviceDecision,
  isAdviceReason,
  isDecisionReasonPair,
  type AdviceDecision,
  type AdviceModel,
  type AdviceReason,
  type AdviceUnavailableCode,
  type ShopAdviceResult,
} from "../../src/ai/shopAdvice.ts";
import type { GameSessionManager } from "../gameSession.ts";

export type ShopAdviceContext = {
  revision: number;
  status: "paused";
  score: number;
  xp: number;
  level: number;
  perkPoints: number;
  extraXp: { level: number; nextCost: number | null };
  luck: { level: number; nextCost: number | null };
  extraLife: { charges: number; nextCost: number | null };
};

export type ModelDecision = { decision: AdviceDecision; reasonCode: AdviceReason };

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  thoughtTokens?: number;
};

export type ProviderResponse = { value: unknown; usage?: ProviderUsage };
export type AdviceTransport = (
  model: AdviceModel,
  context: ShopAdviceContext,
  signal: AbortSignal,
) => Promise<ProviderResponse>;

export type ProviderFailureKind = "transient" | "terminal" | "invalid_output" | "capability";
export type ProviderErrorClass =
  | "network"
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "model_unavailable"
  | "conflict"
  | "provider_error"
  | "refusal"
  | "empty_output"
  | "invalid_json"
  | "response_too_large"
  | "schema_invalid"
  | "semantic_invalid"
  | "cancelled";

export class ProviderFailure extends Error {
  readonly kind: ProviderFailureKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly errorClass: ProviderErrorClass;

  constructor(kind: ProviderFailureKind, status?: number, retryAfterMs?: number, errorClass?: ProviderErrorClass) {
    super(errorClass ?? kind);
    this.name = "ProviderFailure";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.errorClass = errorClass ?? defaultErrorClass(kind, status);
  }
}

function defaultErrorClass(kind: ProviderFailureKind, status?: number): ProviderErrorClass {
  if (kind === "invalid_output") return "schema_invalid";
  if (kind === "capability" || status === 404) return "model_unavailable";
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status !== undefined && status >= 500) return "provider_unavailable";
  return kind === "transient" ? "network" : "provider_error";
}

export type AdviceAttemptTelemetry = {
  event: "shop_ai_provider_attempt";
  interactionId: string;
  operation: "shop_advice";
  provider: "google";
  model: AdviceModel;
  adapter: "gemini_structured" | "gemma_json";
  phase: "final_output";
  attempt: number;
  attemptLimit: number;
  modelAttempt: number;
  modelAttemptLimit: number;
  attemptKind: "initial" | "retry" | "fallback";
  status: "success" | "failure";
  errorClass?: ProviderErrorClass;
  providerStatus?: number;
  latencyMs: number;
  fallbackUsed: boolean;
  cacheStatus: "not_used";
  primarySkippedForCongestion: boolean;
  usage?: ProviderUsage;
};

export type AdviceTelemetrySink = (event: AdviceAttemptTelemetry) => void;

export function createJsonAdviceTelemetrySink(
  write: (line: string) => void = (line) => console.info(line),
): AdviceTelemetrySink {
  return (event) => write(JSON.stringify(event));
}

function emitTelemetry(sink: AdviceTelemetrySink, event: AdviceAttemptTelemetry): void {
  try {
    sink(event);
  } catch {
    // Diagnostics must never change the advice result.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeInt(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function deriveShopContext(snapshot: GameSnapshot): ShopAdviceContext | null {
  if (snapshot.state.status !== "paused" || !safeInt(snapshot.revision, 0) || snapshot.players.length !== 1) return null;
  const player = snapshot.players[0];
  const { xp, level, perkPoints } = player.progression;
  const extraXp = player.perks.extraXp;
  const luck = player.perks.luck;
  const extraLife = player.perks.extraLife;
  if (!safeInt(player.score, 0) || !safeInt(xp, 0) || !safeInt(level, 1)
    || getLevelForXp(xp) !== level || !safeInt(perkPoints, 0)
    || !safeInt(extraXp.level, 0, 5) || !safeInt(luck.level, 0, 5)
    || !safeInt(extraLife.charges, 0, 2)) return null;
  if (extraXp.nextCost !== (extraXp.level < 5 ? extraXp.level + 1 : null)
    || luck.nextCost !== (luck.level < 5 ? luck.level + 1 : null)
    || extraLife.nextCost !== (extraLife.charges === 0 ? 5 : extraLife.charges === 1 ? 8 : null)) return null;
  return {
    revision: snapshot.revision,
    status: "paused",
    score: player.score,
    xp,
    level,
    perkPoints,
    extraXp: { level: extraXp.level, nextCost: extraXp.nextCost },
    luck: { level: luck.level, nextCost: luck.nextCost },
    extraLife: { charges: extraLife.charges, nextCost: extraLife.nextCost },
  };
}

function affordable(cost: number | null, points: number): boolean {
  return cost !== null && points >= cost;
}

export function parseModelDecision(value: unknown): ModelDecision | null {
  if (!isRecord(value) || Object.keys(value).length !== 2
    || !Object.keys(value).every((key) => key === "decision" || key === "reasonCode")
    || !isAdviceDecision(value.decision) || !isAdviceReason(value.reasonCode)
    || !isDecisionReasonPair(value.decision, value.reasonCode)) return null;
  return { decision: value.decision, reasonCode: value.reasonCode };
}

export function validateDecisionSemantics(choice: ModelDecision, context: ShopAdviceContext): boolean {
  const { decision, reasonCode } = choice;
  if (decision === "buy_extra_xp" && !affordable(context.extraXp.nextCost, context.perkPoints)) return false;
  if (decision === "buy_luck" && !affordable(context.luck.nextCost, context.perkPoints)) return false;
  if (decision === "buy_extra_life" && !affordable(context.extraLife.nextCost, context.perkPoints)) return false;
  const costs = [context.extraXp.nextCost, context.luck.nextCost, context.extraLife.nextCost];
  const allCapped = costs.every((cost) => cost === null);
  if (reasonCode === "cannot_afford" && (allCapped || costs.some((cost) => affordable(cost, context.perkPoints)))) return false;
  if (reasonCode === "all_capped" && !allCapped) return false;
  if (reasonCode === "save_points" && allCapped) return false;
  return true;
}

export function validateModelDecision(value: unknown, context: ShopAdviceContext): ModelDecision | null {
  const choice = parseModelDecision(value);
  return choice && validateDecisionSemantics(choice, context) ? choice : null;
}

function displayMessage(choice: ModelDecision, context: ShopAdviceContext): string {
  if (choice.decision === "buy_extra_xp") return `BUY EXTRA XP FOR ${context.extraXp.nextCost} POINTS. EACH FOOD WILL GRANT 2 MORE XP.`;
  if (choice.decision === "buy_luck") return `BUY LUCK FOR ${context.luck.nextCost} POINTS. LUCKY PICKUP CHANCE RISES TO ${10 + 5 * context.luck.level}%.`;
  if (choice.decision === "buy_extra_life") return `BUY +1 LIFE FOR ${context.extraLife.nextCost} POINTS. SURVIVE ONE COLLISION.`;
  if (choice.reasonCode === "all_capped") return "WAIT. ALL PERKS ARE AT THEIR CURRENT CAP.";
  if (choice.reasonCode === "cannot_afford") return "WAIT. SAVE POINTS UNTIL A PERK IS AFFORDABLE.";
  return "WAIT. SAVE YOUR POINTS FOR A LATER PERK PURCHASE.";
}

function unavailable(revision: number, code: AdviceUnavailableCode): ShopAdviceResult {
  return { status: "unavailable", revision, code, message: "SHOP ADVICE IS UNAVAILABLE. NO PURCHASE WAS MADE." };
}

type AdvisorOptions = {
  deadlineMs?: number;
  attemptTimeoutMs?: number;
  backoffScheduleMs?: readonly number[];
  congestionCooldownMs?: number;
  maxRetryAfterMs?: number;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
  jitter?: () => number;
  interactionId?: () => string;
  telemetry?: AdviceTelemetrySink;
};

type AttemptPlan = { model: AdviceModel; modelAttempt: number; modelAttemptLimit: number };

const MODEL_ATTEMPT_LIMITS = [1, 2, 3] as const;

function attemptPlan(skipPrimary: boolean): AttemptPlan[] {
  return ADVICE_MODELS.flatMap((model, modelIndex) => {
    if (skipPrimary && modelIndex === 0) return [];
    const modelAttemptLimit = MODEL_ATTEMPT_LIMITS[modelIndex];
    return Array.from({ length: modelAttemptLimit }, (_value, index) => ({
      model,
      modelAttempt: index + 1,
      modelAttemptLimit,
    }));
  });
}

function bounded(value: number | undefined, defaultValue: number, min: number, max: number): number {
  return value === undefined || !Number.isFinite(value) ? defaultValue : Math.max(min, Math.min(max, value));
}

function jittered(delay: number, random: () => number): number {
  if (delay <= 0) return 0;
  const sample = Math.max(0, Math.min(1, random()));
  return Math.round(delay * (0.8 + sample * 0.4));
}

async function waitFor(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  if (ms <= 0) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(true); }, ms);
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function runAttempt(transport: AdviceTransport, model: AdviceModel, context: ShopAdviceContext,
  timeoutMs: number, externalSignal?: AbortSignal): Promise<ProviderResponse> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let work: Promise<ProviderResponse> | undefined;
  let settled = false;
  try {
    if (controller.signal.aborted) throw new ProviderFailure("terminal", undefined, undefined, "cancelled");
    work = transport(model, context, controller.signal);
    work.then(() => { settled = true; }, () => { settled = true; });
    if (controller.signal.aborted) throw new ProviderFailure("transient", 408, undefined, "timeout");
    const response = await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(
          new ProviderFailure("transient", 408, undefined, "timeout"),
        ), { once: true });
      }),
    ]);
    if (controller.signal.aborted) throw new ProviderFailure("transient", 408, undefined, "timeout");
    return response;
  } catch (error) {
    const unfinished = work !== undefined && controller.signal.aborted && !settled;
    if (unfinished) adoptOrphanedProviderWork(work!);
    if (externalSignal?.aborted) throw new ProviderFailure("terminal", undefined, undefined, "cancelled");
    if (controller.signal.aborted) throw new ProviderFailure(unfinished ? "terminal" : "transient", 408, undefined, "timeout");
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure("transient", undefined, undefined, "network");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

function nextModelIndex(attempts: readonly AttemptPlan[], currentIndex: number): number {
  const currentModel = attempts[currentIndex].model;
  const next = attempts.findIndex((attempt, index) => index > currentIndex && attempt.model !== currentModel);
  return next === -1 ? attempts.length : next;
}

function adapterFor(model: AdviceModel): AdviceAttemptTelemetry["adapter"] {
  return model === ADVICE_MODELS[2] ? "gemma_json" : "gemini_structured";
}

export function createShopAdvisor(transport: AdviceTransport | null, options: AdvisorOptions = {}) {
  const deadlineMs = bounded(options.deadlineMs, 85_000, 1, 85_000);
  const attemptTimeoutMs = bounded(options.attemptTimeoutMs, 10_000, 1, 10_000);
  const backoffScheduleMs = (options.backoffScheduleMs ?? [1_000, 3_000, 5_000, 5_000, 5_000])
    .slice(0, 5).map((delay) => bounded(delay, 5_000, 0, 5_000));
  while (backoffScheduleMs.length < 5) backoffScheduleMs.push(5_000);
  const congestionCooldownMs = bounded(options.congestionCooldownMs, 15 * 60_000, 1, 15 * 60_000);
  const maxRetryAfterMs = bounded(options.maxRetryAfterMs, 5_000, 0, 5_000);
  const now = options.now ?? Date.now;
  const wait = options.wait ?? waitFor;
  const jitter = options.jitter ?? Math.random;
  const interactionId = options.interactionId ?? randomUUID;
  const telemetry = options.telemetry ?? (() => {});
  const inFlight = new Set<string>();
  let primaryCongestedUntil = 0;
  let consecutivePrimaryTransientFailures = 0;

  return {
    async advise(manager: GameSessionManager, gameId: string, signal?: AbortSignal): Promise<ShopAdviceResult> {
      const initial = manager.get(gameId);
      const context = deriveShopContext(initial);
      if (!context) return unavailable(initial.revision, "stale");
      if (signal?.aborted) return unavailable(context.revision, "cancelled");
      if (inFlight.has(gameId)) return unavailable(context.revision, "busy");
      if (!transport) return unavailable(context.revision, "not_configured");
      inFlight.add(gameId);
      const deadline = now() + deadlineMs;
      const primaryIsCongested = primaryCongestedUntil > now();
      const attempts = attemptPlan(primaryIsCongested);
      const currentInteractionId = interactionId();
      let actualAttempt = 0;
      let transientFailures = 0;
      try {
        for (let attemptIndex = 0; attemptIndex < attempts.length && !signal?.aborted;) {
          const remaining = deadline - now();
          if (remaining <= 0) break;
          const attempt = attempts[attemptIndex];
          const { model } = attempt;
          const startedAt = now();
          actualAttempt += 1;
          const attemptKind: AdviceAttemptTelemetry["attemptKind"] = model === ADVICE_MODELS[0] ? "initial"
            : attempt.modelAttempt === 1 ? "fallback" : "retry";
          const baseEvent = {
            event: "shop_ai_provider_attempt" as const,
            interactionId: currentInteractionId,
            operation: "shop_advice" as const,
            provider: "google" as const,
            model,
            adapter: adapterFor(model),
            phase: "final_output" as const,
            attempt: actualAttempt,
            attemptLimit: attempts.length,
            modelAttempt: attempt.modelAttempt,
            modelAttemptLimit: attempt.modelAttemptLimit,
            attemptKind,
            latencyMs: 0,
            fallbackUsed: model !== ADVICE_MODELS[0],
            cacheStatus: "not_used" as const,
            primarySkippedForCongestion: primaryIsCongested,
          };
          try {
            const response = await runAttempt(transport, model, context, Math.min(attemptTimeoutMs, remaining), signal);
            const choice = parseModelDecision(response.value);
            if (!choice) {
              emitTelemetry(telemetry, {
                ...baseEvent,
                status: "failure",
                errorClass: "schema_invalid",
                latencyMs: Math.max(0, Math.round(now() - startedAt)),
                usage: response.usage,
              });
              if (model === ADVICE_MODELS[0]) consecutivePrimaryTransientFailures = 0;
              return unavailable(context.revision, "invalid_provider_output");
            }
            if (!validateDecisionSemantics(choice, context)) {
              emitTelemetry(telemetry, {
                ...baseEvent,
                status: "failure",
                errorClass: "semantic_invalid",
                latencyMs: Math.max(0, Math.round(now() - startedAt)),
                usage: response.usage,
              });
              if (model === ADVICE_MODELS[0]) consecutivePrimaryTransientFailures = 0;
              return unavailable(context.revision, "invalid_provider_output");
            }
            emitTelemetry(telemetry, {
              ...baseEvent,
              status: "success",
              latencyMs: Math.max(0, Math.round(now() - startedAt)),
              usage: response.usage,
            });
            let current: GameSnapshot;
            try {
              current = manager.get(gameId);
            } catch {
              return unavailable(context.revision, "stale");
            }
            if (current.revision !== context.revision || current.state.status !== "paused") {
              return unavailable(context.revision, "stale");
            }
            if (model === ADVICE_MODELS[0]) {
              consecutivePrimaryTransientFailures = 0;
              primaryCongestedUntil = 0;
            }
            return { status: "advice", revision: context.revision, ...choice, message: displayMessage(choice, context), model };
          } catch (error) {
            const failure = error instanceof ProviderFailure ? error : new ProviderFailure("transient");
            emitTelemetry(telemetry, {
              ...baseEvent,
              status: "failure",
              errorClass: signal?.aborted ? "cancelled" : failure.errorClass,
              providerStatus: failure.status,
              latencyMs: Math.max(0, Math.round(now() - startedAt)),
            });
            if (signal?.aborted) return unavailable(context.revision, "cancelled");
            if (model === ADVICE_MODELS[0]) {
              if (failure.kind === "transient") {
                consecutivePrimaryTransientFailures += 1;
                if (consecutivePrimaryTransientFailures >= 2) {
                  primaryCongestedUntil = now() + congestionCooldownMs;
                }
              } else {
                consecutivePrimaryTransientFailures = 0;
              }
            }
            if (failure.kind === "invalid_output") return unavailable(context.revision, "invalid_provider_output");
            if (failure.kind === "terminal") return unavailable(context.revision, "temporarily_unavailable");
            if (failure.kind === "capability") {
              attemptIndex = nextModelIndex(attempts, attemptIndex);
              continue;
            }
            transientFailures += 1;
            if (attemptIndex >= attempts.length - 1) break;
            const remainingAfterAttempt = deadline - now();
            if (failure.retryAfterMs !== undefined
              && (failure.retryAfterMs > maxRetryAfterMs || failure.retryAfterMs >= remainingAfterAttempt)) {
              attemptIndex = nextModelIndex(attempts, attemptIndex);
              continue;
            }
            const scheduledDelay = jittered(
              backoffScheduleMs[Math.min(transientFailures - 1, backoffScheduleMs.length - 1)],
              jitter,
            );
            const delay = Math.max(scheduledDelay, failure.retryAfterMs ?? 0);
            if (delay >= remainingAfterAttempt || !(await wait(delay, signal))) break;
            attemptIndex += 1;
          }
        }
        return unavailable(context.revision, signal?.aborted ? "cancelled" : "temporarily_unavailable");
      } finally {
        inFlight.delete(gameId);
      }
    },
  };
}

export type ShopAdvisor = ReturnType<typeof createShopAdvisor>;
