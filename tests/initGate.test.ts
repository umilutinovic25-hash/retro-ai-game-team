import test from "node:test";
import assert from "node:assert/strict";
import { createInitGate } from "../src/ui/initGate.ts";

test("only one initialization runs at a time", () => {
  const gate = createInitGate();
  const first = gate.begin();
  assert.notEqual(first, null);
  assert.equal(gate.begin(), null);
  gate.fail(first as number);
  assert.notEqual(gate.begin(), null);
});

test("while initializing and no game is active, no snapshot is accepted", () => {
  const gate = createInitGate();
  gate.begin();
  assert.equal(gate.allows(false, "old-game"), false);
  assert.equal(gate.allows(false, "new-game"), false);
});

test("after adopting a game, with no active game only that game is accepted", () => {
  const gate = createInitGate();
  const token = gate.begin() as number;
  assert.equal(gate.adopt(token, "new-game"), true);
  assert.equal(gate.allows(false, "new-game"), true);
  assert.equal(gate.allows(false, "old-game"), false);
});

test("an active game always passes the gate (the id guard in the client handles it)", () => {
  const gate = createInitGate();
  assert.equal(gate.allows(true, "anything"), true);
});

test("a stale token cannot adopt a game or end the current initialization", () => {
  const gate = createInitGate();
  const stale = gate.begin() as number;
  gate.fail(stale);
  const current = gate.begin() as number;
  assert.equal(gate.adopt(stale, "ghost"), false);
  gate.fail(stale);
  assert.equal(gate.begin(), null, "the current initialization is still running");
  assert.equal(gate.isCurrent(stale), false);
  assert.equal(gate.isCurrent(current), true);
});
