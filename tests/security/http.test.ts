// W08 T01-T03, T15: the HTTP boundary. Every rejection here must happen before the provider or any tool runs.
import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { SHOP_STATE, evalPlan, finalAnswer, scripted, validResult } from "../support/agentFixtures.ts";
import { GOAL, JSON_HEADERS, startApp } from "./support.ts";

const happy = () => [SHOP_STATE, evalPlan(["extra_xp"]), finalAnswer(validResult({
  plan: ["extra_xp"], evidence: [{ source: "get_shop_state", step: 1, finding: "3 points." }],
}))];

test("T01 malformed or domain-invalid input is rejected with zero provider calls; the boundary value passes", async () => {
  const script = scripted(happy());
  const app = await startApp({ transport: script.transport });
  try {
    const cases: Array<[string, unknown, number]> = [
      ["broken JSON", "{", 400],
      ["wrong type", { goal: 42 }, 400],
      ["wrong goal", { goal: "buy_everything" }, 400],
      ["null body field", { goal: null }, 400],
      ["array body", [GOAL], 400],
      ["missing goal", {}, 400],
    ];
    for (const [name, body, status] of cases) {
      const response = await app.post(app.agentUrl, body);
      assert.equal(response.status, status, name);
    }
    assert.equal((await app.post(app.agentUrl, GOAL, { "content-type": "text/plain" })).status, 415, "text/plain");
    assert.equal(script.calls.length, 0, "no provider attempt for any rejected request");

    const ok = await app.post(app.agentUrl, GOAL);
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { run: { status: string } }).run.status, "completed");
    assert.equal(script.calls.length, 3, "the legitimate request still runs the whole flow");
  } finally { await app.close(); }
});

test("T02 oversize bodies are refused by declared length and by streamed length; extra policy fields are refused", async () => {
  const script = scripted(happy());
  const app = await startApp({ transport: script.transport });
  try {
    const big = JSON.stringify({ goal: "plan_next_purchases", pad: "x".repeat(40_000) });
    assert.equal((await app.post(app.agentUrl, big)).status, 413, "declared Content-Length over the cap");

    // Chunked upload with no Content-Length: the streaming counter must stop it.
    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL(app.agentUrl);
      const req = request({ host: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { ...JSON_HEADERS, "transfer-encoding": "chunked" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.write(`{"goal":"plan_next_purchases","pad":"${"x".repeat(20_000)}`);
      req.end('"}');
    });
    assert.equal(status, 413, "streamed body over the cap");

    // Each privileged field is tried alone, so one control cannot hide another.
    for (const extra of [{ maxSteps: 999 }, { ownerId: "someone-else" }, { role: "admin" }, { provider: "other" }, { model: "gpt-x" }, { maxToolCalls: 99 }]) {
      const response = await app.post(app.agentUrl, { ...GOAL, ...extra });
      assert.equal(response.status, 400, JSON.stringify(extra));
    }
    assert.equal(script.calls.length, 0);
  } finally { await app.close(); }
});

test("T02 the declared body cap does not block a body exactly at the cap", async () => {
  const app = await startApp({ transport: scripted(happy()).transport });
  try {
    const wrapper = JSON.stringify({ config: { pad: "" } }).length;
    const exact = JSON.stringify({ config: { pad: "x".repeat(16_384 - wrapper) } });
    assert.equal(Buffer.byteLength(exact), 16_384);
    const response = await app.post(`${app.base}/api/games`, exact);
    assert.notEqual(response.status, 413);
  } finally { await app.close(); }
});

test("T03 unknown game ids are 404 before any provider work, and two games never share tool data", async () => {
  const script = scripted(happy());
  const app = await startApp({ transport: script.transport, points: 3 });
  try {
    for (const id of ["does-not-exist", "..%2F..%2Fetc", "%00", "constructor", "__proto__"]) {
      const response = await app.post(`${app.base}/api/games/${id}/shop-agent`, GOAL);
      assert.ok([404, 400].includes(response.status), `${id} -> ${response.status}`);
    }
    assert.equal(script.calls.length, 0);

    // Context A runs; its transcript contains only A's state. B (another container) has different points.
    const b = (await (await app.post(`${app.base}/api/games`, {})).json() as { game: { id: string } }).game.id;
    assert.notEqual(b, app.id);
    const run = await (await app.post(app.agentUrl, GOAL)).json() as { run: { revision: number } };
    assert.equal(run.run.revision, app.manager.get(app.id).revision);
    const seen = JSON.stringify(script.calls.map((call) => call.request));
    assert.equal(seen.includes(b), false, "the other game's id never reaches the model context");
  } finally { await app.close(); }
});

test("T03 cross-site requests and foreign hosts are refused before anything runs", async () => {
  const script = scripted(happy());
  const app = await startApp({ transport: script.transport });
  try {
    const evil = await app.post(app.agentUrl, GOAL, { ...JSON_HEADERS, origin: "https://evil.example" });
    assert.equal(evil.status, 403);
    assert.equal(((await evil.json()) as { error: { code: string } }).error.code, "origin_not_allowed");
    // A cross-site "simple" POST without a body would otherwise create a game or pause one.
    assert.equal((await fetch(`${app.base}/api/games`, { method: "POST", headers: { origin: "https://evil.example" } })).status, 403);
    const local = await app.post(app.agentUrl, GOAL, { ...JSON_HEADERS, origin: "http://localhost:5173" });
    assert.equal(local.status, 200, "the Vite dev origin still works");

    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL(app.agentUrl);
      const req = request({ host: url.hostname, port: url.port, path: url.pathname, method: "POST", headers: { ...JSON_HEADERS, host: "rebind.evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end(JSON.stringify(GOAL));
    });
    assert.equal(status, 403, "DNS-rebinding host name");
    assert.equal(script.calls.length, 3, "only the one legitimate run reached the provider");
    const reasons = app.securityLines.map((line) => JSON.parse(line).reasonCode);
    assert.deepEqual(reasons.slice(0, 2), ["ORIGIN_NOT_ALLOWED", "ORIGIN_NOT_ALLOWED"]);
    assert.ok(reasons.includes("HOST_NOT_ALLOWED"));
  } finally { await app.close(); }
});

test("T15 client-supplied score or state is not accepted by any game action and never changes the server state", async () => {
  const app = await startApp({ transport: scripted(happy()).transport });
  try {
    const before = JSON.stringify(app.manager.get(app.id));
    for (const [path, body] of [
      ["move", { direction: "up", score: 999_999 }],
      ["perks", { perk: "extra_xp", perkPoints: 99 }],
      ["resume", { score: 999_999 }],
      ["restart", { state: { score: 999_999 } }],
    ] as const) {
      const response = await app.post(`${app.base}/api/games/${app.id}/${path}`, body);
      assert.equal(response.status, 400, path);
    }
    assert.equal(JSON.stringify(app.manager.get(app.id)), before, "no field from the client reached the authoritative state");
  } finally { await app.close(); }
});
