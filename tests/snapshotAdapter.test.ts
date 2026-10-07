import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/game/snakeConfig.ts";
import type { GameSnapshot } from "../src/game/gameProtocol.ts";
import { createSnapshotAdapter } from "../src/rendering/snapshotAdapter.ts";

type Pt = { x: number; y: number };
type Over = {
  id?: string; revision?: number; status?: GameSnapshot["state"]["status"]; snake?: Pt[];
  food?: Pt | null; lucky?: Pt | null; score?: number; level?: number; perkPoints?: number;
  extraXp?: number; luck?: number; lives?: number;
};

function snap(o: Over = {}): GameSnapshot {
  const extraXp = o.extraXp ?? 0;
  const luck = o.luck ?? 0;
  const lives = o.lives ?? 0;
  return {
    id: o.id ?? "g1",
    revision: o.revision ?? 1,
    config: DEFAULT_CONFIG,
    configError: null,
    players: [{
      id: "p1",
      snake: o.snake ?? [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: "right",
      queuedDirection: "right",
      score: o.score ?? 0,
      progression: { xp: 0, level: o.level ?? 1, perkPoints: o.perkPoints ?? 0 },
      perks: {
        extraXp: { level: extraXp, nextCost: extraXp < 5 ? extraXp + 1 : null },
        luck: { level: luck, nextCost: luck < 5 ? luck + 1 : null },
        extraLife: { charges: lives, nextCost: lives === 0 ? 5 : lives === 1 ? 8 : null },
      },
    }],
    state: { food: o.food === undefined ? { x: 15, y: 5 } : o.food, luckyPickup: o.lucky ?? null, status: o.status ?? "playing" },
  };
}

const moveRight = (head: number, extra: Over = {}): Over => ({
  snake: [{ x: head, y: 10 }, { x: head - 1, y: 10 }, { x: head - 2, y: 10 }], ...extra,
});

test("the first snapshot is a reset with neutral Phase 2 fields", () => {
  const result = createSnapshotAdapter().adapt(snap({ revision: 1 }));
  assert.equal(result.moved, false);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.bonus, null);
  assert.deepEqual(result.state.obstacles, []);
  assert.equal(result.state.combo, 1);
  assert.deepEqual(result.state.effects, { slow: 0, ghost: 0 });
  assert.equal(result.state.powerUp, null);
  assert.equal(result.state.lastEaten, null);
});

test("an adjacent head while playing is a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(11, { revision: 2 })));
  assert.equal(result.moved, true);
  assert.deepEqual(result.state.snake[0], { x: 11, y: 10 });
});

test("a pause snapshot is not a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, status: "paused" })));
  assert.equal(result.moved, false);
});

test("eating food emits ate and keeps lastEaten stable until the next eat", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  const ate = adapter.adapt(snap({
    revision: 2, score: 1, food: { x: 3, y: 3 },
    snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  assert.deepEqual(ate.events, [{ kind: "ate", at: { x: 11, y: 10 }, points: 1 }]);
  assert.equal(ate.state.lastEaten?.kind, "food");
  const quiet = adapter.adapt(snap({
    revision: 3, score: 1, food: { x: 3, y: 3 },
    snake: [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }],
  }));
  assert.deepEqual(quiet.events, []);
  assert.equal(quiet.state.lastEaten, ate.state.lastEaten);
});

test("collecting the Lucky pickup emits lucky and a lucky lastEaten", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, lucky: { x: 11, y: 10 } })));
  const result = adapter.adapt(snap({ ...moveRight(11, { revision: 2, perkPoints: 1 }), lucky: null }));
  assert.deepEqual(result.events, [{ kind: "lucky", at: { x: 11, y: 10 }, points: 1 }]);
  assert.equal(result.state.lastEaten?.kind, "lucky");
});

test("a higher level emits levelUp", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(11, { revision: 2, level: 2, perkPoints: 1 })));
  assert.deepEqual(result.events, [{ kind: "levelUp", level: 2 }]);
});

test("a perk purchase while paused emits purchase and is not a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, status: "paused", perkPoints: 3 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, status: "paused", perkPoints: 2, extraXp: 1 })));
  assert.deepEqual(result.events, [{ kind: "purchase" }]);
  assert.equal(result.moved, false);
});

test("game over and board clear are emitted once", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const over = adapter.adapt(snap(moveRight(10, { revision: 2, status: "game_over" })));
  assert.deepEqual(over.events, [{ kind: "died" }]);
  assert.equal(over.moved, false);
  const again = adapter.adapt(snap(moveRight(10, { revision: 3, status: "game_over" })));
  assert.deepEqual(again.events, []);

  const winner = createSnapshotAdapter();
  winner.adapt(snap(moveRight(10, { revision: 1 })));
  assert.deepEqual(winner.adapt(snap(moveRight(11, { revision: 2, status: "won" }))).events, [{ kind: "won" }]);
});

test("an extra-life respawn is not a move even when the new head is adjacent", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(11, { revision: 1, lives: 1 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, lives: 0 })));
  assert.equal(result.moved, false);
  assert.deepEqual(result.events, []);
});

test("a duplicate revision changes nothing and keeps lastEaten", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  const ate = adapter.adapt(snap({
    revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  const duplicate = adapter.adapt(snap({
    revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  assert.equal(duplicate.moved, false);
  assert.deepEqual(duplicate.events, []);
  assert.equal(duplicate.state.lastEaten, ate.state.lastEaten);
});

test("another game or a ready snapshot resets lastEaten and emits nothing", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  adapter.adapt(snap({ revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] }));
  const other = adapter.adapt(snap({ id: "g2", revision: 1, status: "ready" }));
  assert.equal(other.state.lastEaten, null);
  assert.deepEqual(other.events, []);
  assert.equal(other.moved, false);
});

test("adapting never mutates the snapshot it was given", () => {
  const input = snap(moveRight(10, { revision: 1 }));
  const before = JSON.stringify(input);
  const result = createSnapshotAdapter().adapt(input);
  result.state.snake[0].x = 99;
  assert.equal(JSON.stringify(input), before);
});
