import { SECURITY_LIMITS, type SecurityLimits } from "./limits.ts";
import { resolveLimits } from "./resolveLimits.ts";

export type AdmissionDenial = "RATE_LIMITED" | "CAPACITY_EXCEEDED";
export type Admission =
  | { ok: true; release(): void }
  | { ok: false; reason: AdmissionDenial; retryAfterSeconds: number };

export type AdmissionControl = {
  tryAcquire(): Admission;
  readonly active: number;
};

/**
 * In-memory admission control for provider-backed requests: a global concurrency cap and a sliding-window
 * rate limit. The demo has no authenticated identity, so the scope is the whole process. Valid for one process only.
 * A denied request consumes neither a slot nor a rate token.
 */
export function createAdmissionControl(
  limits: Partial<SecurityLimits> = {},
  now: () => number = Date.now,
): AdmissionControl {
  const { maxConcurrentRuns, maxRunsPerWindow, windowMs } = resolveLimits<SecurityLimits>({ ...SECURITY_LIMITS }, limits);
  let active = 0;
  let accepted: number[] = [];
  return {
    get active() { return active; },
    tryAcquire(): Admission {
      const current = now();
      accepted = accepted.filter((time) => current - time < windowMs);
      if (active >= maxConcurrentRuns) return { ok: false, reason: "CAPACITY_EXCEEDED", retryAfterSeconds: 1 };
      if (accepted.length >= maxRunsPerWindow) {
        const wait = Math.ceil((accepted[0] + windowMs - current) / 1000);
        return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: Math.max(1, wait) };
      }
      active += 1;
      accepted.push(current);
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          active -= 1;
        },
      };
    },
  };
}
