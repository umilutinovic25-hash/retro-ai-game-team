import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, getTickMs, parseGameConfig, validateGameConfig } from "../src/game/snakeConfig.ts";
import { awardXp, createInitialState, getLuckySpawnChance, pauseGame, purchasePerk, resumeGame, setDirection, startGame, step, type GameState } from "../src/game/snakeEngine.ts";

test("runtime config accepts the default and explicitly falls back when invalid", () => {
  assert.deepEqual(validateGameConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
  const invalid = parseGameConfig({ gridSize: 9 });
  assert.deepEqual(invalid.config, DEFAULT_CONFIG);
  assert.match(invalid.error ?? "", /Nevažeća konfiguracija/);
  assert.deepEqual(parseGameConfig({ ...DEFAULT_CONFIG, obstacleStartCount: -1 }).config, DEFAULT_CONFIG);
  assert.deepEqual(parseGameConfig({ ...DEFAULT_CONFIG, unexpected: true }).config, DEFAULT_CONFIG);
});

test("initial snake has three segments and food is outside its body", () => {
  const state = createInitialState(DEFAULT_CONFIG, () => 0);
  assert.equal(state.snake.length, 3);
  assert.ok(state.food);
  assert.equal(state.snake.some((segment) => segment.x === state.food?.x && segment.y === state.food?.y), false);
  assert.equal(state.obstacles.length, DEFAULT_CONFIG.obstacleStartCount);
  assert.equal(new Set(state.obstacles.map(({ x, y }) => `${x},${y}`)).size, state.obstacles.length);
  assert.ok(state.obstacles.every((obstacle) => !state.snake.some((segment) => segment.x === obstacle.x && segment.y === obstacle.y)));
  assert.ok(state.food && !state.obstacles.some((obstacle) => obstacle.x === state.food?.x && obstacle.y === state.food?.y));
  assert.ok(state.obstacles.every((point) => Math.max(Math.abs(point.x - 10), Math.abs(point.y - 10)) > 2));
  assert.ok(state.obstacles.every((point) => point.y !== 10 || point.x <= 10));
  const blocked = new Set(state.obstacles.map(({ x, y }) => `${x},${y}`));
  const reachable = new Set(["10,10"]);
  const queue = [{ x: 10, y: 10 }];
  while (queue.length) {
    const point = queue.pop()!;
    for (const next of [{ x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }]) {
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.y < 0 || next.x >= DEFAULT_CONFIG.gridSize || next.y >= DEFAULT_CONFIG.gridSize || blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }
  assert.equal(reachable.size, DEFAULT_CONFIG.gridSize ** 2 - state.obstacles.length);
});

test("food can spawn a timed gold or gem bonus that adds score and snake length", () => {
  const config = { ...DEFAULT_CONFIG, bonusChance: 1 };
  const state = startGame({ ...createInitialState(config, () => 0.99), food: { x: 11, y: 10 }, luckyPickup: null, bonus: null });
  const spawned = step(state, config, () => 0.99);
  assert.ok(spawned.bonus);
  assert.ok(spawned.bonus?.kind === "gold" || spawned.bonus?.kind === "gem");
  assert.equal(spawned.bonus?.points, spawned.bonus?.kind === "gem" ? 5 : 3);
  assert.equal(spawned.bonus?.ticksLeft, config.bonusLifetimeTicks);
  assert.ok(spawned.bonus && !spawned.obstacles.some((point) => point.x === spawned.bonus?.position.x && point.y === spawned.bonus?.position.y));

  const bonusState = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    food: { x: 0, y: 0 },
    bonus: { position: { x: 11, y: 10 }, kind: "gem", points: 5, ticksLeft: 10, lifetime: 45 },
    obstacles: [],
  });
  const collected = step(bonusState, DEFAULT_CONFIG, () => 0.99);
  assert.equal(collected.score, 5);
  assert.equal(collected.snake.length, 4);
  assert.equal(collected.bonus, null);
  assert.equal(collected.xp, 0); // score bonuses do not grant food XP
});

test("bonus expires after its final tick and obstacle collisions end the run", () => {
  const bonusState = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    food: { x: 0, y: 0 },
    bonus: { position: { x: 0, y: 1 }, kind: "gold", points: 3, ticksLeft: 1, lifetime: 45 },
    obstacles: [],
  });
  assert.equal(step(bonusState, DEFAULT_CONFIG).bonus, null);

  const obstacleState = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    obstacles: [{ x: 11, y: 10 }],
    food: { x: 0, y: 0 },
  });
  assert.equal(step(obstacleState, DEFAULT_CONFIG).status, "game_over");
});

test("food score milestones add safe obstacles up to the configured maximum", () => {
  const config = { ...DEFAULT_CONFIG, obstacleEvery: 1, maxObstacles: 1, obstacleStartCount: 0, bonusChance: 0 };
  const state = startGame({
    ...createInitialState(config, () => 0),
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    food: { x: 11, y: 10 },
    obstacles: [],
    score: 0,
  });
  const next = step(state, config, () => 0);
  assert.equal(next.obstacles.length, 1);
  assert.ok(next.obstacles.every((obstacle) => !next.snake.some((segment) => segment.x === obstacle.x && segment.y === obstacle.y)));
  assert.ok(next.food && !next.obstacles.some((obstacle) => obstacle.x === next.food?.x && obstacle.y === next.food?.y));
});

test("new game waits for a valid direction before movement starts", () => {
  const state = createInitialState(DEFAULT_CONFIG, () => 0);
  assert.equal(state.status, "ready");
  assert.deepEqual(step(state, DEFAULT_CONFIG), state);
  assert.equal(startGame(setDirection(state, "up")).status, "playing");
});

test("pause freezes the game until it is resumed", () => {
  const playing = startGame(createInitialState(DEFAULT_CONFIG, () => 0));
  const paused = pauseGame(playing);
  assert.equal(paused.status, "paused");
  assert.deepEqual(step(paused, DEFAULT_CONFIG), paused);
  assert.equal(resumeGame(paused).status, "playing");
});

test("speed increases after each configured score milestone without crossing the safe minimum", () => {
  assert.equal(getTickMs(DEFAULT_CONFIG, 0), 160);
  assert.equal(getTickMs(DEFAULT_CONFIG, 5), 148);
  assert.equal(getTickMs(DEFAULT_CONFIG, 500), 80);
});

test("opposite direction is rejected", () => {
  const state = startGame(createInitialState(DEFAULT_CONFIG, () => 0));
  const next = setDirection(state, "left");
  assert.equal(next.queuedDirection, "right");
});

test("eating food increases score and snake length", () => {
  const state = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    food: { x: 11, y: 10 },
  });
  const next = step(state, DEFAULT_CONFIG, () => 0);
  assert.equal(next.score, 1);
  assert.equal(next.xp, 10);
  assert.equal(next.level, 1);
  assert.equal(next.snake.length, 4);
  assert.ok(next.food);
  assert.equal(next.snake.some((segment) => segment.x === next.food?.x && segment.y === next.food?.y), false);
});

test("XP awards derive levels and points at thresholds, including multiple levels", () => {
  const initial = createInitialState(DEFAULT_CONFIG, () => 0);
  const atLevelTwo = awardXp({ ...initial, xp: 40 }, 10);
  assert.equal(atLevelTwo.xp, 50);
  assert.equal(atLevelTwo.level, 2);
  assert.equal(atLevelTwo.perkPoints, 1);

  const multiple = awardXp(initial, 300);
  assert.equal(multiple.level, 4);
  assert.equal(multiple.perkPoints, 3);
  assert.equal(awardXp({ ...initial, extraXpLevel: 3 }, 16).xp, 16);
});

test("Extra XP changes food awards and a charged life safely recovers a wall collision", () => {
  const boosted = step(startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    extraXpLevel: 2,
    food: { x: 11, y: 10 },
  }), DEFAULT_CONFIG, () => 0);
  assert.equal(boosted.xp, 14);

  const state = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
    direction: "right",
    queuedDirection: "right",
    food: { x: 10, y: 10 },
    score: 4,
    xp: 145,
    level: 2,
    perkPoints: 3,
    extraXpLevel: 2,
    luckLevel: 3,
    extraLives: 1,
    luckyPickup: { x: 0, y: 0 },
  });
  const recovered = step(state, DEFAULT_CONFIG, () => 0);
  assert.equal(recovered.status, "playing");
  assert.equal(recovered.extraLives, 0);
  assert.equal(recovered.score, 4);
  assert.equal(recovered.xp, 145);
  assert.equal(recovered.level, 2);
  assert.equal(recovered.perkPoints, 3);
  assert.equal(recovered.extraXpLevel, 2);
  assert.equal(recovered.luckLevel, 3);
  assert.ok(recovered.luckyPickup);
  assert.ok(recovered.luckyPickup && !recovered.obstacles.some((point) => point.x === recovered.luckyPickup?.x && point.y === recovered.luckyPickup?.y));
  assert.equal(recovered.direction, "right");
  assert.equal(recovered.queuedDirection, "right");
  assert.equal(recovered.snake.length, 3);
  assert.equal(recovered.snake[0].x, Math.floor(DEFAULT_CONFIG.gridSize / 2));
  assert.ok(recovered.food);
  assert.equal(recovered.snake.some((segment) => segment.x === recovered.food?.x && segment.y === recovered.food?.y), false);

  const conflictingItems = step(startGame({ ...state, luckyPickup: { x: 10, y: 10 } }), DEFAULT_CONFIG, () => 0);
  assert.ok(conflictingItems.luckyPickup);
  assert.notDeepEqual(conflictingItems.luckyPickup, conflictingItems.food);
  assert.equal(conflictingItems.snake.some((segment) => segment.x === conflictingItems.luckyPickup?.x && segment.y === conflictingItems.luckyPickup?.y), false);

  const selfCollision = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }],
    direction: "down",
    queuedDirection: "down",
    food: { x: 10, y: 10 },
    extraLives: 2,
  });
  const selfRecovered = step(selfCollision, DEFAULT_CONFIG, () => 0);
  assert.equal(selfRecovered.status, "playing");
  assert.equal(selfRecovered.extraLives, 1);
  assert.equal(selfRecovered.snake.length, 3);
});

test("perk purchases are paused-only, deduct exact costs, and reject atomically", () => {
  const paused = { ...createInitialState(DEFAULT_CONFIG, () => 0), status: "paused" as const, perkPoints: 20 };
  const extraXp = purchasePerk(paused, "extra_xp");
  assert.equal(extraXp.ok, true);
  if (extraXp.ok) {
    assert.equal(extraXp.state.extraXpLevel, 1);
    assert.equal(extraXp.state.perkPoints, 19);
    const extraLife = purchasePerk(extraXp.state, "extra_life");
    assert.equal(extraLife.ok, true);
    if (extraLife.ok) {
      assert.equal(extraLife.state.extraLives, 1);
      assert.equal(extraLife.state.perkPoints, 14);
      const secondLife = purchasePerk(extraLife.state, "extra_life");
      assert.equal(secondLife.ok, true);
      if (secondLife.ok) assert.equal(secondLife.state.perkPoints, 6);
    }
  }
  assert.deepEqual(purchasePerk({ ...paused, status: "playing" }, "extra_xp"), { ok: false, error: "invalid_status" });
  assert.deepEqual(purchasePerk({ ...paused, perkPoints: 0 }, "extra_xp"), { ok: false, error: "insufficient_perk_points" });
  assert.deepEqual(purchasePerk({ ...paused, extraXpLevel: 5 }, "extra_xp"), { ok: false, error: "perk_at_cap" });
  assert.deepEqual(purchasePerk({ ...paused, extraLives: 2 }, "extra_life"), { ok: false, error: "perk_at_cap" });

  let luckState: GameState = { ...paused, perkPoints: 15 };
  for (let level = 0; level < 5; level += 1) {
    const result = purchasePerk(luckState, "luck");
    assert.equal(result.ok, true);
    if (!result.ok) break;
    assert.equal(result.state.luckLevel, level + 1);
    assert.equal(result.state.perkPoints, 15 - ((level + 1) * (level + 2)) / 2);
    luckState = result.state;
  }
  assert.deepEqual(purchasePerk(luckState, "luck"), { ok: false, error: "perk_at_cap" });
  assert.deepEqual(purchasePerk({ ...paused, perkPoints: 0 }, "luck"), { ok: false, error: "insufficient_perk_points" });
});

test("Luck spawn chance scales from 5% to 30% and the orange pickup is placed separately", () => {
  const chances = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(getLuckySpawnChance), chances);
  const state = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    food: { x: 11, y: 10 },
    luckyPickup: null,
  });
  const draws = [0, 0.049, 0];
  let index = 0;
  const spawned = step(state, DEFAULT_CONFIG, () => draws[index++] ?? 0.99);
  assert.ok(spawned.luckyPickup);
  assert.notDeepEqual(spawned.luckyPickup, spawned.food);
  assert.equal(spawned.snake.some((part) => part.x === spawned.luckyPickup?.x && part.y === spawned.luckyPickup?.y), false);

  const failedRoll = step(state, DEFAULT_CONFIG, (() => {
    const results = [0, 0.05];
    let roll = 0;
    return () => results[roll++] ?? 0.99;
  })());
  assert.equal(failedRoll.luckyPickup, null);

  chances.forEach((chance, luckLevel) => {
    const leveled = { ...state, luckLevel };
    const successDraws = [0, chance - 0.001, 0];
    let successIndex = 0;
    assert.ok(step(leveled, DEFAULT_CONFIG, () => successDraws[successIndex++] ?? 0.99).luckyPickup);
    const boundaryDraws = [0, chance];
    let boundaryIndex = 0;
    assert.equal(step(leveled, DEFAULT_CONFIG, () => boundaryDraws[boundaryIndex++] ?? 0.99).luckyPickup, null);
  });
});

test("collecting a Lucky pickup grants one point only, and an active pickup blocks new rolls", () => {
  const initial = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    food: { x: 0, y: 0 },
    luckyPickup: { x: 11, y: 10 },
    score: 7,
    xp: 40,
    level: 1,
    perkPoints: 0,
    luckLevel: 2,
  });
  const collected = step(initial, DEFAULT_CONFIG, () => 0.99);
  assert.equal(collected.luckyPickup, null);
  assert.equal(collected.perkPoints, 1);
  assert.equal(collected.score, 7);
  assert.equal(collected.xp, 40);
  assert.equal(collected.snake.length, 3);

  const redFood = startGame({ ...initial, score: 0, luckyPickup: { x: 3, y: 0 }, food: { x: 11, y: 10 } });
  let draws = 0;
  const kept = step(redFood, { ...DEFAULT_CONFIG, bonusChance: 0 }, () => { draws += 1; return 0; });
  assert.deepEqual(kept.luckyPickup, redFood.luckyPickup);
  assert.equal(draws, 1); // Only the next red-food position consumes randomness; the existing Lucky blocks another roll.
});

test("wall collision ends the game", () => {
  const state = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
    direction: "right",
    queuedDirection: "right",
  });
  assert.equal(step(state, DEFAULT_CONFIG).status, "game_over");
});

test("self collision ends the game", () => {
  const state = startGame({
    ...createInitialState(DEFAULT_CONFIG, () => 0),
    snake: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }],
    direction: "down",
    queuedDirection: "down",
    food: { x: 10, y: 10 },
  });
  assert.equal(step(state, DEFAULT_CONFIG).status, "game_over");
});
