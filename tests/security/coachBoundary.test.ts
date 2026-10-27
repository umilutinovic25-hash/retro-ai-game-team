// The coach shares provider admission with the selected W05 flow, so its cleanup must also be bounded.
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createGameCoach } from "../../server/ai/gameCoach.ts";
import type { ProviderResponse } from "../../server/ai/shopAdvice.ts";
import type { GameCoachResult } from "../../src/ai/gameCoach.ts";
import { orphanedProviderWork } from "../../server/security/providerWork.ts";
import { pausedGame } from "../support/agentFixtures.ts";

const valid = () => ({ value: { headline: "Good run!", tip: "Leave more space near the walls." } });
const finishedGame = () => pausedGame(0, { status: "game_over" });
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("T12/T17 a pre-cancelled coach request makes zero provider calls", async () => {
  const { manager, id } = finishedGame();
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const coach = createGameCoach(async () => { calls += 1; return valid(); });
  try {
    const result = await coach.coach(manager, id, controller.signal);
    assert.equal(calls, 0);
    assert.ok(result.status === "unavailable" && result.code === "cancelled");
  } finally { manager.close(); }
});

test("T12/T17 coach cancellation finishes promptly even when transport ignores abort; late success is discarded", async () => {
  const { manager, id } = finishedGame();
  const controller = new AbortController();
  let release = () => {};
  const coach = createGameCoach(() => new Promise((resolve) => { release = () => resolve(valid()); }));
  const operation = coach.coach(manager, id, controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    controller.abort();
    const result = await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("coach cancellation did not finish")), 250); }),
    ]);
    assert.ok(result.status === "unavailable" && result.code === "cancelled");
    assert.equal(orphanedProviderWork(), 1);
    release();
    await turn();
    assert.equal(orphanedProviderWork(), 0);
    assert.ok(result.status === "unavailable", "late provider success cannot replace cancellation");
  } finally {
    clearTimeout(timer);
    release();
    await operation;
    manager.close();
  }
});

test("T17 a cancelled coach result does not poison the run cache; retry succeeds and success is cached", async () => {
  const { manager, id } = finishedGame();
  const before = JSON.stringify(manager.get(id));
  const controller = new AbortController();
  let calls = 0;
  const coach = createGameCoach((_model, _context, signal) => {
    calls += 1;
    if (calls > 1) return Promise.resolve(valid());
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  try {
    const first = coach.coach(manager, id, controller.signal);
    controller.abort();
    const cancelled = await first;
    assert.ok(cancelled.status === "unavailable" && cancelled.code === "cancelled");
    const retry = await coach.coach(manager, id);
    assert.equal(retry.status, "coaching");
    assert.equal(calls, 2);
    assert.deepEqual(await coach.coach(manager, id), retry);
    assert.equal(calls, 2, "successful result is cached");
    assert.equal(JSON.stringify(manager.get(id)), before);
  } finally { manager.close(); }
});

test("T12/T13 coach timeout bounds the response and tracks unfinished work without overlapping fallback", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { manager, id } = finishedGame();
  let release = () => {};
  let calls = 0;
  const coach = createGameCoach(() => {
    calls += 1;
    return new Promise<ProviderResponse>((resolve) => { release = () => resolve(valid()); });
  });
  let result: GameCoachResult | undefined;
  const operation = coach.coach(manager, id).then((value) => { result = value; return value; });
  try {
    t.mock.timers.tick(3_500);
    await turn();
    assert.ok(result?.status === "unavailable" && result.code === "temporarily_unavailable", "timeout must finish the response");
    assert.equal(calls, 1, "no fallback overlaps pending work");
    assert.equal(orphanedProviderWork(), 1);
    release();
    await turn();
    assert.equal(orphanedProviderWork(), 0);
  } finally {
    release();
    await operation;
    manager.close();
  }
});

test("T13 invalid coach contexts consume no admission tokens and a finished run still succeeds", async () => {
  const { createGameHttpServer } = await import("../../server/httpServer.ts");
  const { createAdmissionControl } = await import("../../server/security/admission.ts");
  const { manager, id } = finishedGame();
  const ready = manager.create();
  let calls = 0;
  const coach = createGameCoach(async () => { calls += 1; return valid(); });
  const admission = createAdmissionControl({ maxRunsPerWindow: 1 });
  const server = createGameHttpServer(manager, undefined, undefined, coach, { admission, securityLog: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (gameId: string) => fetch(`${base}/api/games/${gameId}/coach`, { method: "POST" });
  try {
    assert.equal((await post("unknown-game")).status, 404);
    assert.equal((await post(ready.id)).status, 409);
    assert.equal(calls, 0);
    assert.equal((await post(id)).status, 200, "invalid contexts must not spend the only rate token");
    assert.equal(calls, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("T17 HTTP coach disconnect tracks ignored-abort work, refuses surplus, then permits a successful retry", async () => {
  const { createGameHttpServer } = await import("../../server/httpServer.ts");
  const { createAdmissionControl } = await import("../../server/security/admission.ts");
  const { manager, id } = finishedGame();
  const before = JSON.stringify(manager.get(id));
  let started = () => {};
  let aborted = () => {};
  let release = () => {};
  const began = new Promise<void>((resolve) => { started = resolve; });
  const sawAbort = new Promise<void>((resolve) => { aborted = resolve; });
  let calls = 0;
  const coach = createGameCoach((_model, _context, signal) => {
    calls += 1;
    if (calls > 1) return Promise.resolve(valid());
    signal.addEventListener("abort", aborted, { once: true });
    started();
    return new Promise((resolve) => { release = () => resolve(valid()); });
  });
  const admission = createAdmissionControl({ maxConcurrentRuns: 1, maxRunsPerWindow: 50 }, Date.now, orphanedProviderWork);
  const server = createGameHttpServer(manager, undefined, undefined, coach, { admission, securityLog: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/games/${id}/coach`;
  const controller = new AbortController();
  const first = fetch(url, { method: "POST", signal: controller.signal }).catch(() => null);
  try {
    await began;
    controller.abort();
    await sawAbort;
    await turn();
    assert.equal(admission.active, 0);
    assert.equal(orphanedProviderWork(), 1);
    assert.equal((await fetch(url, { method: "POST" })).status, 503);
    assert.equal(calls, 1);
    release();
    await turn();
    assert.equal(orphanedProviderWork(), 0);
    const retry = await fetch(url, { method: "POST" });
    assert.equal(retry.status, 200);
    assert.equal(((await retry.json()) as { coach: GameCoachResult }).coach.status, "coaching");
    assert.equal(calls, 2);
    assert.equal(JSON.stringify(manager.get(id)), before);
  } finally {
    controller.abort();
    release();
    await first;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
