import { ProviderFailure, type ProviderResponse } from "../ai/shopAdvice.ts";
import type { AdviceModel } from "../../src/ai/shopAdvice.ts";
import type { AgentStepRequest, AgentTransport } from "./types.ts";
import { adoptOrphanedProviderWork } from "../security/providerWork.ts";

/** Runs one provider attempt with a timeout and an external abort signal. */
export async function runAttempt(
  transport: AgentTransport,
  model: AdviceModel,
  request: AgentStepRequest,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<ProviderResponse> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let work: Promise<ProviderResponse> | undefined;
  let settled = false;
  try {
    if (controller.signal.aborted) throw new ProviderFailure("terminal", undefined, undefined, "cancelled");
    work = transport(model, request, controller.signal);
    work.then(() => { settled = true; }, () => { settled = true; });
    if (controller.signal.aborted) throw new ProviderFailure("transient", 408, undefined, "timeout");
    const response = await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new ProviderFailure("transient", 408, undefined, "timeout")), { once: true });
      }),
    ]);
    if (controller.signal.aborted) throw new ProviderFailure("transient", 408, undefined, "timeout");
    return response;
  } catch (error) {
    const unfinished = work !== undefined && controller.signal.aborted && !settled;
    if (unfinished) adoptOrphanedProviderWork(work!);
    if (externalSignal?.aborted) throw new ProviderFailure("terminal", undefined, undefined, "cancelled");
    // An overlapping retry would exceed admission's active-work cap.
    if (controller.signal.aborted) throw new ProviderFailure(unfinished ? "terminal" : "transient", 408, undefined, "timeout");
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure("transient", undefined, undefined, "network");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function waitFor(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  if (ms <= 0) return true;
  return new Promise((resolve) => {
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(true); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
