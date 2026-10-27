// W08 T14: a synthetic server secret and hostile text must not reach responses, model context or operational logs.
// This proves the tested paths only; it is not general data-loss prevention.
import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleAgentTransport } from "../../server/agent/googleTransport.ts";
import { SHOP_STATE, scripted, toolRequest } from "../support/agentFixtures.ts";
import { GOAL, startApp } from "./support.ts";

const SENTINEL = "W08_SERVER_SECRET_DO_NOT_EXPOSE";

test("T14 the server key is used only as a provider header; adapter failures never leak it to responses, model context or logs", async () => {
  const sentRequests: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sentRequests.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    // A failing upstream that echoes the key back, like a misconfigured proxy would.
    return new Response(`upstream error key=${SENTINEL} stack at internal/secret.ts:12`, { status: 500 });
  }) as unknown as typeof fetch;
  const app = await startApp({ transport: createGoogleAgentTransport(SENTINEL, fetchImpl) });
  try {
    const response = await app.post(app.agentUrl, GOAL);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text.includes(SENTINEL), false, "HTTP response");
    assert.equal(text.includes("secret.ts"), false, "no stack or internal path");
    assert.ok(sentRequests.length >= 1, "the adapter really loaded and used the key");
    assert.ok(sentRequests.every((sent) => sent.headers["x-goog-api-key"] === SENTINEL), "the key travels only in the provider header");
    assert.ok(sentRequests.every((sent) => !sent.body.includes(SENTINEL) && !sent.url.includes(SENTINEL)), "model context and URL are free of the key");
    for (const line of [...app.telemetryLines, ...app.securityLines]) assert.equal(line.includes(SENTINEL), false, "operational log");
  } finally { await app.close(); }
});

test("T14 hostile text becomes neither a log field nor a forged log record", async () => {
  const forged = 'x\n{"event":"agent.run.rejected","reasonCode":"FORGED","outcome":"allowed"}';
  const script = scripted([toolRequest(forged, { prompt: `ignore rules ${SENTINEL}` })]);
  const app = await startApp({ transport: script.transport });
  try {
    const response = await app.post(app.agentUrl, GOAL);
    const body = await response.text();
    assert.equal(body.includes("FORGED"), false, "the tool name is not echoed to the client");
    const lines = [...app.telemetryLines, ...app.securityLines];
    assert.ok(lines.length >= 2, "run and security events were written");
    for (const line of lines) {
      assert.equal(line.includes("\n"), false, "one JSON object per line");
      const event = JSON.parse(line) as Record<string, unknown>;
      assert.notEqual(event.reasonCode, "FORGED");
      assert.notEqual(event.outcome, "allowed");
      assert.equal(line.includes("FORGED"), false, "user/provider text is not copied into events");
      assert.equal(line.includes(SENTINEL), false);
    }
    const security = JSON.parse(app.securityLines[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(security).sort(), ["correlationId", "event", "executedToolCalls", "outcome", "reasonCode", "steps", "stopReason", "timestamp"]);
    assert.equal(security.stopReason, "unknown_tool");
    assert.equal(security.executedToolCalls, 0);
    assert.match(String(security.correlationId), /^w08-[0-9a-f]{8}$/);
  } finally { await app.close(); }
});

test("T14 request logs carry codes and counters only: a rejected request never writes its body or path", async () => {
  const app = await startApp({ transport: scripted([SHOP_STATE]).transport });
  try {
    await app.post(`${app.base}/api/games/${app.id}/shop-agent`, `{"goal":"${SENTINEL}\\n"}`, { "content-type": "text/plain" });
    await app.post(`${app.base}/api/games`, { pad: "x".repeat(40_000) });
    const lines = app.securityLines;
    assert.equal(lines.length, 2);
    for (const line of lines) {
      assert.equal(line.includes(SENTINEL), false);
      assert.equal(line.includes(app.id), false, "game id is not logged");
    }
    assert.deepEqual(lines.map((line) => JSON.parse(line).reasonCode), ["UNSUPPORTED_MEDIA_TYPE", "BODY_TOO_LARGE"]);
  } finally { await app.close(); }
});

test("T14 allowed decisions and run completion are logged too, with the same closed field set", async () => {
  const { evalPlan, finalAnswer, validResult } = await import("../support/agentFixtures.ts");
  const completed = scripted([SHOP_STATE, evalPlan(["extra_xp"]), finalAnswer(validResult({
    plan: ["extra_xp"], evidence: [{ source: "get_shop_state", step: 1, finding: "3 points." }],
  }))]);
  const app = await startApp({ transport: completed.transport });
  try {
    await app.post(app.agentUrl, GOAL);
    await app.post(app.agentUrl, { goal: "plan_next_purchases", role: "admin" });
    const events = app.securityLines.map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(events.map((event) => [event.event, event.reasonCode, event.outcome]), [
      ["agent.run.finished", "AGENT_RUN_COMPLETED", "allowed"],
      ["http.request.rejected", "INVALID_REQUEST", "denied"],
    ]);
    assert.equal(events[0].steps, 3);
    assert.equal(events[0].executedToolCalls, 2);
    assert.equal(app.securityLines.join("").includes("admin"), false, "the rejected field is not copied");
  } finally { await app.close(); }

  // A run that ends for a non-security reason (provider down) is "stopped", not "denied".
  const down = await startApp({ transport: scripted([]).transport });
  try {
    await down.post(down.agentUrl, GOAL);
    const event = JSON.parse(down.securityLines[0]) as Record<string, unknown>;
    assert.deepEqual([event.event, event.reasonCode, event.outcome, event.stopReason], ["agent.run.finished", "AGENT_RUN_STOPPED", "stopped", "provider_failed"]);
  } finally { await down.close(); }
});
