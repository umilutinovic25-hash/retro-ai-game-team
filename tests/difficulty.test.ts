import test from "node:test";
import assert from "node:assert/strict";
import { parseGameConfig } from "../src/game/snakeConfig.ts";
import { DIFFICULTIES, DIFFICULTY_CONFIGS, isDifficulty } from "../src/ui/difficulty.ts";

test("every preset passes the shared runtime config validation", () => {
  for (const name of DIFFICULTIES) {
    const result = parseGameConfig(DIFFICULTY_CONFIGS[name]);
    assert.equal(result.error, undefined, name);
    assert.deepEqual(result.config, DIFFICULTY_CONFIGS[name]);
  }
});

test("easy is slower than normal and normal is slower than hard", () => {
  assert.ok(DIFFICULTY_CONFIGS.easy.startingSpeedMs > DIFFICULTY_CONFIGS.normal.startingSpeedMs);
  assert.ok(DIFFICULTY_CONFIGS.normal.startingSpeedMs > DIFFICULTY_CONFIGS.hard.startingSpeedMs);
});

test("only the three known names are difficulties", () => {
  for (const name of DIFFICULTIES) assert.equal(isDifficulty(name), true);
  for (const bad of ["insane", "", "EASY", null, undefined, 1, {}, "__proto__"]) assert.equal(isDifficulty(bad), false);
});
