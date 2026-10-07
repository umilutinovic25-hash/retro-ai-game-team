import test from "node:test";
import assert from "node:assert/strict";
import { SETTING_KEYS, bestKey, readBest, readSetting, writeSetting } from "../src/ui/settings.ts";

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
};
const broken = {
  getItem: (): string | null => { throw new Error("denied"); },
  setItem: (): void => { throw new Error("denied"); },
};

test("settings round-trip through storage", () => {
  const storage = memory();
  writeSetting(SETTING_KEYS.colorblind, "1", storage);
  assert.equal(readSetting(SETTING_KEYS.colorblind, storage), "1");
  assert.equal(readSetting("missing", storage), null);
});

test("missing or throwing storage never throws and falls back to defaults", () => {
  assert.equal(readSetting("x", null), null);
  assert.doesNotThrow(() => writeSetting("x", "1", null));
  assert.equal(readSetting("x", broken), null);
  assert.doesNotThrow(() => writeSetting("x", "1", broken));
  assert.equal(readBest("hard", broken), 0);
});

test("best score is kept per difficulty and keeps the legacy key for normal", () => {
  assert.equal(bestKey("normal"), "retro-snake-best-score");
  assert.equal(bestKey("hard"), "retro-snake-best-score-hard");
  const storage = memory({ "retro-snake-best-score": "12", "retro-snake-best-score-hard": "30" });
  assert.equal(readBest("normal", storage), 12);
  assert.equal(readBest("hard", storage), 30);
  assert.equal(readBest("easy", storage), 0);
});

test("corrupted best scores read as zero", () => {
  for (const bad of ["abc", "-4", "1.5", "<script>", "Infinity", ""]) {
    assert.equal(readBest("normal", memory({ "retro-snake-best-score": bad })), 0, bad);
  }
});
