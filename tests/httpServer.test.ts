import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createGameHttpServer } from "../server/httpServer.ts";
import { GameSessionManager } from "../server/gameSession.ts";
import { createShopAdvisor, type ShopAdvisor } from "../server/ai/shopAdvice.ts";
import { DEFAULT_CONFIG } from "../src/game/snakeConfig.ts";

async function startServer(random: () => number = () => 0, advisor: ShopAdvisor = createShopAdvisor(null)) {
  let id = 0;
  const manager = new GameSessionManager(random, () => `api-${++id}`);
  const server = createGameHttpServer(manager, advisor);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    manager,
    server,
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

test("HTTP API creates independent games and exposes server-owned actions", async () => {
  const app = await startServer();
  try {
    const firstResponse = await fetch(`${app.baseUrl}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const first = (await json(firstResponse)).game;
    const secondResponse = await fetch(`${app.baseUrl}/api/games`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const second = (await json(secondResponse)).game;
    assert.equal(firstResponse.status, 201);
    assert.notEqual(first.id, second.id);
    assert.equal(first.players[0].id, "api-2");

    const getResponse = await fetch(`${app.baseUrl}/api/games/${first.id}`);
    assert.equal(getResponse.status, 200);
    assert.equal((await json(getResponse)).game.id, first.id);

    const moveResponse = await fetch(`${app.baseUrl}/api/games/${first.id}/move`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: "up" }),
    });
    assert.equal((await json(moveResponse)).game.state.status, "playing");

    const pauseResponse = await fetch(`${app.baseUrl}/api/games/${first.id}/pause`, { method: "POST" });
    assert.equal((await json(pauseResponse)).game.state.status, "paused");
    const resumeResponse = await fetch(`${app.baseUrl}/api/games/${first.id}/resume`, { method: "POST" });
    assert.equal((await json(resumeResponse)).game.state.status, "playing");
    const restartResponse = await fetch(`${app.baseUrl}/api/games/${first.id}/restart`, { method: "POST" });
    assert.equal((await json(restartResponse)).game.state.status, "ready");
    assert.equal(app.manager.get(second.id).state.status, "ready");
  } finally {
    await app.close();
  }
});

test("HTTP API rejects malformed requests and missing game IDs safely", async () => {
  const app = await startServer();
  try {
    const badJson = await fetch(`${app.baseUrl}/api/games`, { method: "POST", body: "{" });
    assert.equal(badJson.status, 400);
    assert.equal((await json(badJson)).error.code, "invalid_json");

    const created = await fetch(`${app.baseUrl}/api/games`, { method: "POST", body: "{}" });
    const { game } = await json(created);
    const malformedPurchase = await fetch(`${app.baseUrl}/api/games/${game.id}/perks`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perk: "unknown" }),
    });
    assert.equal(malformedPurchase.status, 400);
    assert.equal((await json(malformedPurchase)).error.code, "invalid_purchase");
    const wrongStatusPurchase = await fetch(`${app.baseUrl}/api/games/${game.id}/perks`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perk: "extra_xp" }),
    });
    assert.equal(wrongStatusPurchase.status, 409);
    assert.equal((await json(wrongStatusPurchase)).error.code, "invalid_status");
    assert.equal(app.manager.get(game.id).revision, 0);
    const invalidMove = await fetch(`${app.baseUrl}/api/games/${game.id}/move`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: "teleport" }),
    });
    assert.equal(invalidMove.status, 400);
    assert.equal((await json(invalidMove)).error.code, "invalid_move");

    const missing = await fetch(`${app.baseUrl}/api/games/unknown`);
    assert.equal(missing.status, 404);
    assert.equal((await json(missing)).error.code, "game_not_found");
    assert.equal(app.manager.get(game.id).revision, 0);
  } finally {
    await app.close();
  }
});

test("shop advice route uses paused server state and leaves the revision unchanged", async () => {
  let calls = 0;
  const advisor = createShopAdvisor(async () => {
    calls += 1;
    return { value: { decision: "wait", reasonCode: "cannot_afford" } };
  }, { backoffScheduleMs: [0, 0, 0, 0, 0] });
  const app = await startServer(() => 0, advisor);
  try {
    const game = app.manager.create();
    const route = `${app.baseUrl}/api/games/${game.id}/shop-advice`;
    const headers = { "content-type": "application/json" };
    const wrongStatus = await fetch(route, { method: "POST", headers, body: "{}" });
    assert.equal(wrongStatus.status, 409);
    assert.equal((await json(wrongStatus)).error.code, "invalid_status");
    assert.equal(calls, 0);
    app.manager.move(game.id, "up");
    app.manager.pause(game.id);
    const before = app.manager.get(game.id);
    const extraField = await fetch(route, { method: "POST", headers, body: '{"model":"arbitrary"}' });
    assert.equal(extraField.status, 400);
    assert.equal((await json(extraField)).error.code, "invalid_request");
    assert.equal(calls, 0);
    const response = await fetch(route, { method: "POST", headers, body: "{}" });
    const result = await json(response);
    assert.equal(response.status, 200);
    assert.deepEqual(result.advice, {
      status: "advice",
      revision: before.revision,
      decision: "wait",
      reasonCode: "cannot_afford",
      message: "WAIT. SAVE POINTS UNTIL A PERK IS AFFORDABLE.",
      model: "gemini-3.8-flash",
    });
    assert.equal(calls, 1);
    assert.deepEqual(app.manager.get(game.id), before);
    const unknown = await fetch(`${app.baseUrl}/api/games/unknown/shop-advice`, { method: "POST", headers, body: "{}" });
    assert.equal(unknown.status, 404);
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});

test("shop advice without a server key returns only a safe unavailable result", async () => {
  const app = await startServer();
  try {
    const game = app.manager.create();
    app.manager.move(game.id, "up");
    app.manager.pause(game.id);
    const before = app.manager.get(game.id);
    const response = await fetch(`${app.baseUrl}/api/games/${game.id}/shop-advice`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await json(response)).advice, {
      status: "unavailable", revision: before.revision, code: "not_configured",
      message: "SHOP ADVICE IS UNAVAILABLE. NO PURCHASE WAS MADE.",
    });
    assert.deepEqual(app.manager.get(game.id), before);
  } finally {
    await app.close();
  }
});

test("shop advice route aborts provider work when the browser disconnects", async () => {
  let onStart: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { onStart = resolve; });
  let cancelled = false;
  const advisor = createShopAdvisor(async (_model, _context, signal) => {
    onStart?.();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
      cancelled = true;
      reject(new Error("cancelled"));
    }, { once: true }));
  });
  const app = await startServer(() => 0, advisor);
  try {
    const game = app.manager.create();
    app.manager.move(game.id, "up");
    app.manager.pause(game.id);
    const controller = new AbortController();
    const request = fetch(`${app.baseUrl}/api/games/${game.id}/shop-advice`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: controller.signal,
    });
    await started;
    controller.abort();
    await assert.rejects(request);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(cancelled, true);
  } finally {
    await app.close();
  }
});

test("HTTP API applies a valid paused perk purchase and returns the updated snapshot", async () => {
  const draws = [190 / 397, 170 / 396, 0.99, 150 / 395, 0.99, 130 / 394, 0.99, 110 / 393, 0.99, 90 / 392, 0.99];
  let draw = 0;
  const app = await startServer(() => draws[draw++] ?? 0);
  try {
    const createdResponse = await fetch(`${app.baseUrl}/api/games`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { ...DEFAULT_CONFIG, obstacleStartCount: 0, bonusChance: 0 } }),
    });
    const { game } = await json(createdResponse);
    app.manager.move(game.id, "up");
    for (let index = 0; index < 5; index += 1) app.manager.advance(game.id);
    app.manager.pause(game.id);

    const response = await fetch(`${app.baseUrl}/api/games/${game.id}/perks`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perk: "luck" }),
    });
    const result = await json(response);
    assert.equal(response.status, 200);
    assert.equal(result.game.players[0].perks.luck.level, 1);
    assert.equal(result.game.players[0].progression.perkPoints, 0);
  } finally {
    await app.close();
  }
});

test("WebSocket sends initial and changed authoritative snapshots", async () => {
  const app = await startServer();
  let socket: WebSocket | undefined;
  try {
    const response = await fetch(`${app.baseUrl}/api/games`, { method: "POST", body: "{}" });
    const { game } = await json(response);
    const address = new URL(app.baseUrl);
    socket = new WebSocket(`ws://${address.host}/api/games/${game.id}/events`);
    const firstMessage = once(socket, "message");
    await once(socket, "open");

    const initial = JSON.parse((await firstMessage)[0].toString());
    assert.equal(initial.type, "snapshot");
    assert.equal(initial.game.state.status, "ready");

    const changedMessage = once(socket, "message");
    await fetch(`${app.baseUrl}/api/games/${game.id}/move`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: "up" }),
    });
    const changed = JSON.parse((await changedMessage)[0].toString());
    assert.equal(changed.game.state.status, "playing");
    assert.ok(changed.game.revision > initial.game.revision);
  } finally {
    socket?.close();
    await app.close();
  }
});
