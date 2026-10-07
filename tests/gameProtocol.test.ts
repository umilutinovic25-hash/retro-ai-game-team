import test from "node:test";
import assert from "node:assert/strict";
import { GameSessionManager } from "../server/gameSession.ts";
import { validateGameSnapshot } from "../src/game/gameProtocol.ts";
import { DEFAULT_CONFIG } from "../src/game/snakeConfig.ts";

test("snapshot protocol accepts authoritative snapshots and rejects malformed data", () => {
  const manager = new GameSessionManager(() => 0, () => "protocol-id");
  const snapshot = manager.create();
  assert.deepEqual(validateGameSnapshot(snapshot), snapshot);
  assert.deepEqual(snapshot.players[0].progression, { xp: 0, level: 1, perkPoints: 0 });
  assert.deepEqual(snapshot.players[0].perks, {
    extraXp: { level: 0, nextCost: 1 },
    luck: { level: 0, nextCost: 1 },
    extraLife: { charges: 0, nextCost: 5 },
  });
  assert.equal(snapshot.state.luckyPickup, null);
  assert.equal(snapshot.state.obstacles.length, DEFAULT_CONFIG.obstacleStartCount);
  assert.equal(snapshot.state.bonus, null);

  assert.equal(validateGameSnapshot({ ...snapshot, extra: "unexpected" }), null);
  const afterLuckyPickup = {
    ...snapshot,
    state: { ...snapshot.state, status: "playing" as const },
    players: [{ ...snapshot.players[0], progression: { ...snapshot.players[0].progression, perkPoints: 1 } }],
  };
  assert.deepEqual(validateGameSnapshot(afterLuckyPickup), afterLuckyPickup);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    players: [{ ...snapshot.players[0], progression: { xp: 50, level: 1, perkPoints: 0 } }],
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    players: [{ ...snapshot.players[0], perks: { ...snapshot.players[0].perks, extraXp: { level: 1, nextCost: 1 } } }],
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    players: [{ ...snapshot.players[0], perks: { ...snapshot.players[0].perks, luck: { level: 5, nextCost: 1 } } }],
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    state: { ...snapshot.state, luckyPickup: snapshot.players[0].snake[0] },
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    players: [{ ...snapshot.players[0], progression: { ...snapshot.players[0].progression, xp: 1 } }],
  }), null);
  assert.equal(validateGameSnapshot({ ...snapshot, config: { ...snapshot.config, gridSize: 9 } }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    players: [{ ...snapshot.players[0], snake: [{ x: -1, y: 3 }] }],
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    state: { ...snapshot.state, obstacles: [snapshot.players[0].snake[0]] },
  }), null);
  assert.equal(validateGameSnapshot({
    ...snapshot,
    state: { ...snapshot.state, bonus: { position: snapshot.state.food!, kind: "gem", points: 5, ticksLeft: 3, lifetime: DEFAULT_CONFIG.bonusLifetimeTicks } },
  }), null);
  manager.close();
});
