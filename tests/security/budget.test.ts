// W08 T13, T17: admission control (global concurrency + rate) on provider-backed routes.
// Single in-memory process only; the demo has no authenticated identity, so the scope is global.
import test from "node:test";
import assert from "node:assert/strict";
import { createAdmissionControl } from "../../server/security/admission.ts";
import type { AgentTransport } from "../../server/agent/types.ts";
import { GOAL, startApp } from "./support.ts";

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

test("admission control: cap, release, idempotent release, rate window and recovery (fake clock)", () => {
  let clock = 0;
  const control = createAdmissionControl({ maxConcurrentRuns: 2, maxRunsPerWindow: 5, windowMs: 60_000 }, () => clock);
  const a = control.tryAcquire();
  const b = control.tryAcquire();
  assert.ok(a.ok && b.ok);
  const third = control.tryAcquire();
  assert.deepEqual(third.ok ? null : third.reason, "CAPACITY_EXCEEDED");
  assert.equal(control.active, 2);
  if (a.ok) { a.release(); a.release(); }
  assert.equal(control.active, 1, "a double release frees one slot only");
  const c = control.tryAcquire();
  assert.ok(c.ok);
  [b, c].forEach((slot) => slot.ok && slot.release());

  // 3 accepted so far; two more fill the window, the next is rate limited without consuming a token.
  for (let index = 0; index < 2; index += 1) { const slot = control.tryAcquire(); assert.ok(slot.ok); slot.ok && slot.release(); }
  const limited = control.tryAcquire();
  assert.equal(limited.ok ? null : limited.reason, "RATE_LIMITED");
  assert.ok(!limited.ok && limited.retryAfterSeconds >= 1 && limited.retryAfterSeconds <= 60);
  clock = 60_001;
  const again = control.tryAcquire();
  assert.ok(again.ok, "the window expired");
  again.ok && again.release();
});

test("T13 parallel HTTP requests: active provider work never exceeds the cap, surplus is refused before the provider, capacity recovers", async () => {
  let active = 0;
  let maxActive = 0;
  let started = 0;
  const gates: Array<() => void> = [];
  const hanging: AgentTransport = (_model, _request, signal) => {
    started += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise((_resolve, reject) => {
      gates.push(() => { active -= 1; reject(new Error("released")); });
      signal.addEventListener("abort", () => { active -= 1; reject(new Error("aborted")); }, { once: true });
    });
  };
  const app = await startApp({ transport: hanging, admission: { maxConcurrentRuns: 2, maxRunsPerWindow: 50 }, limits: { perCallTimeoutMs: 400, totalDeadlineMs: 1_000, maxProviderAttempts: 1 } });
  try {
    const urls = [app.agentUrl, app.extraPausedGame(), app.extraPausedGame(), app.extraPausedGame()];
    const responses = urls.map((url) => app.post(url, GOAL));
    await settle(80);
    assert.equal(started, 2, "only two requests reached the provider");
    assert.equal(app.admission.active, 2);
    const surplus = await Promise.race([responses[2], responses[3]]);
    assert.equal(surplus.status, 503);
    assert.ok(surplus.headers.get("retry-after"));
    assert.equal(((await surplus.json()) as { error: { code: string } }).error.code, "server_busy");
    await Promise.all(responses);
    assert.ok(maxActive <= 2, `max active provider calls: ${maxActive}`);
    assert.equal(app.admission.active, 0, "every slot was released after completion/timeout");
    assert.ok(app.securityLines.some((line) => JSON.parse(line).reasonCode === "CAPACITY_EXCEEDED"));

    gates.length = 0;
    const next = app.post(app.agentUrl, GOAL);
    await settle(60);
    assert.equal(started >= 3, true, "a legitimate request is served after capacity is freed");
    await next;
  } finally { await app.close(); }
});

test("T13 rate limit is separate from concurrency: the sixth request in a window is 429 with zero provider work, then recovers", async () => {
  let clock = 1_000;
  let providerCalls = 0;
  const transport: AgentTransport = async () => { providerCalls += 1; return { value: { kind: "final", result: null } }; };
  const app = await startApp({ transport, admission: { maxConcurrentRuns: 10, maxRunsPerWindow: 5, windowMs: 60_000 }, now: () => clock });
  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await app.post(app.agentUrl, GOAL);
      assert.equal(response.status, 200, `request ${index + 1}`);
    }
    assert.equal(providerCalls, 5);
    const limited = await app.post(app.agentUrl, GOAL);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);
    assert.equal(providerCalls, 5, "no provider work for the refused request");
    // Rejected-at-validation requests do not consume the budget.
    assert.equal((await app.post(app.agentUrl, { goal: "wrong" })).status, 400);
    clock += 60_001;
    assert.equal((await app.post(app.agentUrl, GOAL)).status, 200);
    assert.equal(providerCalls, 6);
  } finally { await app.close(); }
});

test("T17 chain HTTP -> admission -> agent -> provider: a browser disconnect aborts provider work, frees the slot, and the next legitimate run succeeds", async () => {
  let aborted = 0;
  let calls = 0;
  const transport: AgentTransport = (_model, _request, signal) => {
    calls += 1;
    if (calls > 1) return Promise.resolve({ value: { kind: "tool_request", tool: "get_shop_state", arguments: {} } });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted += 1; reject(new Error("aborted")); }, { once: true }));
  };
  const app = await startApp({ transport, admission: { maxConcurrentRuns: 1, maxRunsPerWindow: 50 } });
  try {
    const controller = new AbortController();
    const first = app.post(app.agentUrl, GOAL, undefined, controller.signal).catch(() => null);
    await settle(60);
    assert.equal(app.admission.active, 1);
    const blocked = await app.post(app.extraPausedGame(), GOAL);
    assert.equal(blocked.status, 503, "cap of one is enforced while the first run is in flight");
    controller.abort();
    await first;
    await settle(80);
    assert.equal(aborted, 1, "provider work was cancelled, not left running");
    assert.equal(app.admission.active, 0);
    const after = await app.post(app.extraPausedGame(), GOAL);
    assert.equal(after.status, 200, "capacity is available again");
  } finally { await app.close(); }
});

test("T12/T13 a provider call that ignores abort keeps occupying capacity until it really settles", async () => {
  const { orphanedProviderWork } = await import("../../server/security/providerWork.ts");
  let finished = 0;
  // Ignores the AbortSignal on purpose and answers late, like a misbehaving SDK or proxy.
  const stubborn: AgentTransport = () => new Promise((resolve) => setTimeout(() => {
    finished += 1;
    resolve({ value: { kind: "tool_request", tool: "get_shop_state", arguments: {} } });
  }, 300));
  const app = await startApp({
    transport: stubborn, externalLoad: orphanedProviderWork,
    admission: { maxConcurrentRuns: 1, maxRunsPerWindow: 50 },
    limits: { perCallTimeoutMs: 30, maxProviderAttempts: 1 },
  });
  try {
    const first = await app.post(app.agentUrl, GOAL);
    assert.equal(first.status, 200, "the run itself ends after its per-call timeout");
    assert.equal(((await first.json()) as { run: { status: string } }).run.status, "failed");
    assert.equal(app.admission.active, 0, "the run released its slot");
    assert.equal(orphanedProviderWork(), 1, "but its provider call is still running");
    const blocked = await app.post(app.extraPausedGame(), GOAL);
    assert.equal(blocked.status, 503, "unfinished background work still counts against the cap");
    await settle(350);
    assert.equal(finished, 1);
    assert.equal(orphanedProviderWork(), 0);
    const after = app.post(app.extraPausedGame(), GOAL);
    await settle(20);
    assert.equal(app.admission.active, 1, "capacity is available again once the work settled");
    await after;
    await settle(350);
  } finally { await app.close(); }
});

test("T13 retries never overlap unfinished provider work within the admitted runs", async () => {
  const gates: Array<() => void> = [];
  let active = 0;
  let maximum = 0;
  const transport: AgentTransport = () => {
    active += 1;
    maximum = Math.max(maximum, active);
    return new Promise((resolve) => gates.push(() => { active -= 1; resolve({ value: null }); }));
  };
  const { orphanedProviderWork } = await import("../../server/security/providerWork.ts");
  const app = await startApp({ transport, externalLoad: orphanedProviderWork,
    admission: { maxConcurrentRuns: 2, maxRunsPerWindow: 50 },
    limits: { perCallTimeoutMs: 30, totalDeadlineMs: 1_000 },
  });
  try {
    await Promise.all([app.post(app.agentUrl, GOAL), app.post(app.extraPausedGame(), GOAL)]);
    assert.ok(maximum <= 2, `actual unfinished provider work: ${maximum}`);
    assert.equal(gates.length, 2, "no retry or fallback while each prior attempt still runs");
    assert.equal((await app.post(app.extraPausedGame(), GOAL)).status, 503);
  } finally {
    gates.forEach((release) => release());
    await settle(0);
    await app.close();
  }
});

test("T13 shop advice also avoids retrying a provider attempt that ignores cancellation", async () => {
  const { createShopAdvisor } = await import("../../server/ai/shopAdvice.ts");
  const { pausedGame } = await import("../support/agentFixtures.ts");
  const { manager, id } = pausedGame(3);
  const gates: Array<() => void> = [];
  const advisor = createShopAdvisor(() => new Promise((resolve) => gates.push(() => resolve({ value: null }))), {
    attemptTimeoutMs: 10, deadlineMs: 1_000, backoffScheduleMs: [0, 0, 0, 0, 0],
  });
  try {
    assert.equal((await advisor.advise(manager, id)).status, "unavailable");
    assert.equal(gates.length, 1, "one unfinished call; no overlapping retry/fallback");
  } finally {
    gates.forEach((release) => release());
    await settle(0);
    manager.close();
  }
});
