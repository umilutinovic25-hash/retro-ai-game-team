// W08 misuse resistance: configuration mistakes must fail closed or fail loudly, never silently disable a control.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createAdmissionControl } from "../../server/security/admission.ts";
import { resolveLimits } from "../../server/security/resolveLimits.ts";
import { createShopAgent } from "../../server/agent/shopAgent.ts";
import { runAgent } from "../../server/agent/orchestrator.ts";
import { DEFAULT_LIMITS } from "../../server/agent/types.ts";
import { createGameHttpServer } from "../../server/httpServer.ts";
import { GameSessionManager } from "../../server/gameSession.ts";
import { FAST, SHOP_STATE, pausedGame, scripted } from "../support/agentFixtures.ts";

test("an undefined override keeps the default; NaN, Infinity, 0, negatives, strings and unknown keys throw", () => {
  assert.equal(resolveLimits({ ...DEFAULT_LIMITS }, { maxAgentSteps: undefined }).maxAgentSteps, DEFAULT_LIMITS.maxAgentSteps);
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, "5", null]) {
    assert.throws(() => resolveLimits({ ...DEFAULT_LIMITS }, { maxAgentSteps: bad }), /positive integer/, String(bad));
  }
  assert.throws(() => resolveLimits({ ...DEFAULT_LIMITS }, { maxSteps: 999 } as never), /Unknown limit/);
});

test("admission control and the agent refuse a limit that would disable them", async () => {
  assert.throws(() => createAdmissionControl({ maxConcurrentRuns: Number.NaN }));
  assert.throws(() => createAdmissionControl({ windowMs: 0 }));
  assert.throws(() => createShopAgent(null, { limits: { maxProviderAttempts: Number.POSITIVE_INFINITY } }));
  const { manager, id } = pausedGame(3);
  await assert.rejects(runAgent({ manager, gameId: id, transport: scripted([SHOP_STATE]).transport, deps: FAST, limits: { maxToolCalls: -1 } }));
});

test("allowedOrigins rejects *, null and non-origin strings; staticRoot cannot be empty", () => {
  for (const origin of ["*", "null", "http://localhost:5173/", "http://localhost:5173/app", "localhost:5173", "file://", "javascript:alert(1)"]) {
    assert.throws(() => createGameHttpServer(new GameSessionManager(), undefined, undefined, undefined, { allowedOrigins: [origin] }), /exact http/, origin);
  }
  assert.doesNotThrow(() => createGameHttpServer(new GameSessionManager(), undefined, undefined, undefined, { allowedOrigins: ["http://localhost:5173"] }).close());
  assert.throws(() => createGameHttpServer(new GameSessionManager(), undefined, undefined, undefined, { staticRoot: " " }));
});

test("a static root pointed at a project folder still never serves dot files", async () => {
  const root = mkdtempSync(join(tmpdir(), "w08-static-"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>ok</title>");
  writeFileSync(join(root, ".env"), "GEMINI_API_KEY=W08_SERVER_SECRET_DO_NOT_EXPOSE");
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".git", "config"), "[core]");
  const server = createGameHttpServer(new GameSessionManager(), undefined, undefined, undefined, { staticRoot: root, securityLog: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    for (const path of ["/.env", "/.git/config", "/%2eenv", "/assets/../.env", "/.%65nv"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      const text = await response.text();
      assert.equal(text.includes("W08_SERVER_SECRET"), false, path);
      assert.notEqual(response.status, 200, path);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
