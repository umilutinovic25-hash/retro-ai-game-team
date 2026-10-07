import test from "node:test";
import assert from "node:assert/strict";
import { TOP_SIZE, addEntry, parseRecords, qualifies, recordGame, sanitizeName } from "../src/ui/records.ts";

const entry = (name: string, score: number) => ({ name, score, difficulty: "normal" as const, date: "2026-09-23" });

test("stored records are untrusted: malformed data is dropped, not shown", () => {
  assert.deepEqual(parseRecords("not json").top, []);
  assert.deepEqual(parseRecords(null).stats, { games: 0, totalFood: 0, longestSnake: 0, bestCombo: 0 });
  const raw = JSON.stringify({
    top: [entry("abc", 9), { name: "<img src=x onerror=alert(1)>", score: 5, difficulty: "normal", date: "2026-09-23" }, { name: "BAD", score: -1, difficulty: "normal", date: "x" }, { name: "LVL", score: 3, difficulty: "insane", date: "x" }],
    stats: { games: "many", totalFood: 4, longestSnake: 12, bestCombo: 3 },
  });
  const parsed = parseRecords(raw);
  assert.deepEqual(parsed.top.map((e) => [e.name, e.score]), [["ABC", 9], ["IMG", 5]]);
  assert.deepEqual(parsed.stats, { games: 0, totalFood: 4, longestSnake: 12, bestCombo: 3 });
});

test("names are reduced to three uppercase letters or digits", () => {
  assert.equal(sanitizeName("uros!!"), "URO");
  assert.equal(sanitizeName("  "), "???");
});

test("only positive scores that beat the table qualify, and ranks are ordered", () => {
  let records = parseRecords(null);
  assert.equal(qualifies(records, 0), false);
  for (let i = 1; i <= TOP_SIZE; i += 1) records = addEntry(records, entry("AAA", i * 10)).records;
  assert.equal(qualifies(records, 10), false);
  assert.equal(qualifies(records, 11), true);
  const result = addEntry(records, entry("NEW", 55));
  assert.equal(result.rank, 5);
  assert.equal(result.records.top.length, TOP_SIZE);
  assert.equal(result.records.top.at(-1)?.score, 20);
});

test("game stats accumulate totals and keep maxima", () => {
  let records = parseRecords(null);
  records = recordGame(records, { food: 5, length: 9, combo: 3 });
  records = recordGame(records, { food: 2, length: 6, combo: 4 });
  assert.deepEqual(records.stats, { games: 2, totalFood: 7, longestSnake: 9, bestCombo: 4 });
});
