import { randomUUID } from "node:crypto";
import { ADVICE_MODELS, type AdviceModel } from "../../src/ai/shopAdvice.ts";
import { AGENT_GOAL, type AgentResult, type Perk, type StopReason } from "../../src/ai/shopAgent.ts";
import { ProviderFailure, type ProviderUsage } from "../ai/shopAdvice.ts";
import type { GameSessionManager, GameSnapshot } from "../gameSession.ts";
import { runAttempt, waitFor } from "./attempt.ts";
import { buildPlanLine, validateAgentResult } from "./finalResult.ts";
import { TOOLS, lookupTool, toolDescriptors } from "./tools.ts";
import { resolveLimits } from "../security/resolveLimits.ts";
import {
  DEFAULT_LIMITS, statusForStop,
  type AgentLimits, type AgentOutcome, type AgentStepRequest, type AgentTelemetrySink, type AgentTransport,
  type StepLog, type ToolRegistry, type TranscriptEntry,
} from "./types.ts";

export type AgentDeps = {
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
  jitter?: () => number;
  runId?: () => string;
  backoffScheduleMs?: readonly number[];
  telemetry?: AgentTelemetrySink;
};

export type RunAgentInput = {
  manager: GameSessionManager;
  gameId: string;
  transport: AgentTransport;
  limits?: Partial<AgentLimits>;
  deps?: AgentDeps;
  tools?: ToolRegistry;
  signal?: AbortSignal;
};

type Envelope = { kind: "tool_request"; tool: unknown; arguments: unknown } | { kind: "final"; result: unknown };
type ModelCall =
  | { ok: true; value: unknown; model: AdviceModel; usage?: ProviderUsage; latencyMs: number }
  | { ok: false; reason: StopReason };

const MAX_RETRY_AFTER_MS = 5_000;
const DEFAULT_BACKOFF_MS = [1_000, 3_000, 5_000, 5_000, 5_000] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEnvelope(value: unknown): Envelope | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (value.kind === "tool_request" && keys.length === 3 && "tool" in value && "arguments" in value) {
    return { kind: "tool_request", tool: value.tool, arguments: value.arguments };
  }
  if (value.kind === "final" && keys.length === 2 && "result" in value) return { kind: "final", result: value.result };
  return null;
}

function readSnapshot(manager: GameSessionManager, gameId: string): GameSnapshot | null {
  try {
    return manager.get(gameId);
  } catch {
    return null;
  }
}

export async function runAgent(input: RunAgentInput): Promise<AgentOutcome> {
  const limits = resolveLimits<AgentLimits>({ ...DEFAULT_LIMITS }, input.limits);
  const deps = input.deps ?? {};
  const now = deps.now ?? Date.now;
  const runId = (deps.runId ?? randomUUID)();
  const { manager, gameId, transport, signal } = input;
  const tools = input.tools ?? TOOLS;
  const wait = deps.wait ?? waitFor;
  const jitter = deps.jitter ?? Math.random;
  const schedule = deps.backoffScheduleMs && deps.backoffScheduleMs.length > 0 ? deps.backoffScheduleMs : DEFAULT_BACKOFF_MS;
  const jittered = (delay: number) => (delay <= 0 ? 0 : Math.round(delay * (0.8 + Math.max(0, Math.min(1, jitter())) * 0.4)));
  const startedAt = now();
  const deadlineAt = startedAt + limits.totalDeadlineMs;
  const initial = readSnapshot(manager, gameId);
  const stateVersion = initial?.revision ?? 0;

  const run = {
    stepCount: 0,
    toolCallCount: 0,
    evaluatorCallCount: 0,
    providerAttempts: 0,
    modelIndex: 0,
    fallbacks: 0,
    seen: new Set<string>(),
    transcript: [] as TranscriptEntry[],
    validPlans: [] as Perk[][],
    log: [] as StepLog[],
  };

  function emit(event: Parameters<AgentTelemetrySink>[0]): void {
    try {
      deps.telemetry?.(event);
    } catch {
      // Diagnostics must never change the run.
    }
  }

  function finish(stopReason: StopReason, result?: AgentResult): AgentOutcome {
    const status = statusForStop(stopReason);
    const elapsedMs = Math.max(0, Math.round(now() - startedAt));
    emit({
      event: "shop_agent_run", runId, status, stopReason, steps: run.stepCount, toolCalls: run.toolCallCount,
      providerAttempts: run.providerAttempts, elapsedMs, stepLog: run.log,
    });
    return {
      runId, status, stopReason, revision: stateVersion, steps: run.stepCount, toolCalls: run.toolCallCount,
      providerAttempts: run.providerAttempts, elapsedMs, log: run.log,
      ...(result ? { result, planLine: buildPlanLine(result.plan, run.transcript) } : {}),
    };
  }

  function isCurrent(snapshot: GameSnapshot | null): snapshot is GameSnapshot {
    return snapshot !== null && snapshot.state.status === "paused" && snapshot.revision === stateVersion;
  }

  function buildRequest(): AgentStepRequest {
    return {
      goal: AGENT_GOAL,
      tools: toolDescriptors(tools),
      transcript: run.transcript.map((entry) => ({ ...entry })),
      budget: { stepsLeft: limits.maxAgentSteps - run.stepCount, toolCallsLeft: limits.maxToolCalls - run.toolCallCount },
    };
  }

  async function callModel(request: AgentStepRequest): Promise<ModelCall> {
    let attemptsThisStep = 0;
    let transientFailures = 0;
    while (true) {
      if (signal?.aborted) return { ok: false, reason: "cancelled" };
      const remaining = deadlineAt - now();
      if (remaining <= 0) return { ok: false, reason: "deadline" };
      if (run.providerAttempts >= limits.maxProviderAttempts) return { ok: false, reason: "provider_failed" };
      const model = ADVICE_MODELS[run.modelIndex];
      run.providerAttempts += 1;
      attemptsThisStep += 1;
      const attemptStarted = now();
      try {
        const response = await runAttempt(transport, model, request, Math.min(limits.perCallTimeoutMs, remaining), signal);
        const latencyMs = Math.max(0, Math.round(now() - attemptStarted));
        emit({
          event: "shop_agent_provider_attempt", runId, step: run.stepCount + 1, attempt: run.providerAttempts,
          model, status: "success", latencyMs, ...(response.usage ? { usage: response.usage } : {}),
        });
        return { ok: true, value: response.value, model, usage: response.usage, latencyMs };
      } catch (error) {
        const failure = error instanceof ProviderFailure ? error : new ProviderFailure("transient");
        const cancelled = signal?.aborted === true || failure.errorClass === "cancelled";
        emit({
          event: "shop_agent_provider_attempt", runId, step: run.stepCount + 1, attempt: run.providerAttempts, model,
          status: "failure", errorClass: cancelled ? "cancelled" : failure.errorClass,
          ...(failure.status !== undefined ? { providerStatus: failure.status } : {}),
          latencyMs: Math.max(0, Math.round(now() - attemptStarted)),
        });
        if (cancelled) return { ok: false, reason: "cancelled" };
        if (failure.kind === "invalid_output") return { ok: false, reason: "invalid_model_proposal" };
        if (failure.kind === "terminal") return { ok: false, reason: "provider_failed" };

        const retryAfterTooLong = failure.retryAfterMs !== undefined
          && (failure.retryAfterMs > MAX_RETRY_AFTER_MS || failure.retryAfterMs >= deadlineAt - now());
        if (failure.kind === "capability" || attemptsThisStep >= limits.maxAttemptsPerStep || retryAfterTooLong) {
          if (run.modelIndex + 1 >= ADVICE_MODELS.length || run.fallbacks >= limits.maxProviderFallbacks) {
            return { ok: false, reason: "provider_failed" };
          }
          run.modelIndex += 1;
          run.fallbacks += 1;
          attemptsThisStep = 0;
          continue;
        }
        transientFailures += 1;
        const base = schedule[Math.min(transientFailures - 1, schedule.length - 1)];
        const delay = Math.max(jittered(base), failure.retryAfterMs ?? 0);
        if (delay >= deadlineAt - now()) return { ok: false, reason: "deadline" };
        if (!(await wait(delay, signal))) return { ok: false, reason: signal?.aborted ? "cancelled" : "deadline" };
      }
    }
  }

  if (!isCurrent(initial)) return finish("stale");

  while (true) {
    if (signal?.aborted) return finish("cancelled");
    if (now() >= deadlineAt) return finish("deadline");
    if (run.stepCount >= limits.maxAgentSteps) return finish("step_limit");

    const call = await callModel(buildRequest());
    if (!call.ok) return finish(call.reason);
    run.stepCount += 1;
    const stepNo = run.stepCount;
    const record = (decision: StepLog["decision"], validation: StepLog["validation"], tool?: string) => {
      run.log.push({ step: stepNo, model: call.model, decision, validation, latencyMs: call.latencyMs, ...(tool ? { tool } : {}), ...(call.usage ? { usage: call.usage } : {}) });
    };

    // Timers can run after promise continuations; the absolute deadline is authoritative.
    if (signal?.aborted) return finish("cancelled");
    if (now() >= deadlineAt) return finish("deadline");

    const envelope = parseEnvelope(call.value);
    if (!envelope) {
      record("rejected", "rejected");
      return finish("invalid_model_proposal");
    }

    if (envelope.kind === "final") {
      const result = validateAgentResult(envelope.result, run.transcript, run.validPlans);
      if (!result) {
        record("final", "rejected");
        return finish("invalid_model_proposal");
      }
      if (!isCurrent(readSnapshot(manager, gameId))) {
        record("final", "rejected");
        return finish("stale");
      }
      if (signal?.aborted) return finish("cancelled");
      if (now() >= deadlineAt) return finish("deadline");
      record("final", "accepted");
      return finish("completed", result);
    }

    const tool = lookupTool(envelope.tool, tools);
    if (!tool) {
      record("rejected", "rejected");
      return finish("unknown_tool");
    }
    const args = tool.validateArgs(envelope.arguments);
    if (!args.ok) {
      record("tool_request", "rejected", tool.name);
      return finish("invalid_tool_arguments");
    }
    if (stepNo >= limits.maxAgentSteps) {
      record("tool_request", "rejected", tool.name);
      return finish("step_limit");
    }
    if (run.toolCallCount >= limits.maxToolCalls
      || (tool.name === "evaluate_perk_plan" && run.evaluatorCallCount >= limits.maxEvaluatorCalls)) {
      record("tool_request", "rejected", tool.name);
      return finish("tool_call_limit");
    }
    const key = `${tool.name}|${JSON.stringify(args.value)}|${stateVersion}`;
    if (run.seen.has(key)) {
      record("tool_request", "rejected", tool.name);
      return finish("repeated_action");
    }
    run.seen.add(key);
    const snapshot = readSnapshot(manager, gameId);
    if (!isCurrent(snapshot)) {
      record("tool_request", "rejected", tool.name);
      return finish("stale");
    }

    if (signal?.aborted) return finish("cancelled");
    if (now() >= deadlineAt) return finish("deadline");
    run.toolCallCount += 1;
    if (tool.name === "evaluate_perk_plan") run.evaluatorCallCount += 1;
    const toolStarted = now();
    let result: unknown;
    try {
      result = tool.execute(args.value, { snapshot, history: manager.getRunHistory(gameId) });
    } catch {
      record("tool_request", "rejected", tool.name);
      return finish("tool_failed");
    }
    if (signal?.aborted) return finish("cancelled");
    if (now() >= deadlineAt) return finish("deadline");
    let size = Number.POSITIVE_INFINITY;
    try {
      size = Buffer.byteLength(JSON.stringify(result) ?? "");
    } catch {
      size = Number.POSITIVE_INFINITY;
    }
    if (now() - toolStarted > limits.toolTimeoutMs || size > limits.maxToolResultBytes || !tool.validateResult(result)) {
      record("tool_request", "rejected", tool.name);
      return finish("tool_failed");
    }
    record("tool_request", "accepted", tool.name);
    run.transcript.push({ step: stepNo, tool: tool.name, arguments: args.value, result });
    if (tool.name === "evaluate_perk_plan" && isRecord(result) && result.valid === true) {
      run.validPlans.push([...(args.value.plan as Perk[])]);
    }
  }
}
