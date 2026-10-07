import test from "node:test";
import assert from "node:assert/strict";
import { createInputBuffer } from "../src/ui/inputBuffer.ts";
import type { Direction } from "../src/game/snakeEngine.ts";

function fixture() {
  const sent: Direction[] = [];
  return { sent, buffer: createInputBuffer((direction) => { sent.push(direction); }) };
}

test("the first press is sent immediately and a second press in the same tick waits for the next tick", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  assert.deepEqual(sent, ["up"]);
  buffer.tick();
  assert.deepEqual(sent, ["up", "left"]);
});

test("a held press that is opposite to the one just sent is dropped", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("down", "right");
  buffer.tick();
  assert.deepEqual(sent, ["up"]);
});

test("repeating the direction just sent is ignored", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("up", "right");
  buffer.tick();
  assert.deepEqual(sent, ["up"]);
});

test("only the latest valid held press is kept", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  buffer.press("right", "right");
  buffer.tick();
  assert.deepEqual(sent, ["up", "right"]);
});

test("a press equal or opposite to the current heading is ignored while idle and does not block the next press", () => {
  const { sent, buffer } = fixture();
  buffer.press("right", "right");
  buffer.press("left", "right");
  assert.deepEqual(sent, []);
  buffer.press("up", "right");
  assert.deepEqual(sent, ["up"]);
});

test("a tick with nothing held only re-opens the buffer", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.tick();
  buffer.press("left", "up");
  assert.deepEqual(sent, ["up", "left"]);
});

test("reset forgets everything", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  buffer.reset();
  buffer.tick();
  assert.deepEqual(sent, ["up"]);
  buffer.press("down", "right");
  assert.deepEqual(sent, ["up", "down"]);
});

test("a held turn waits one extra tick when the snapshot does not show the sent turn applied yet", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  buffer.tick("right");
  assert.deepEqual(sent, ["up"]);
  buffer.tick("up");
  assert.deepEqual(sent, ["up", "left"]);
});

test("a held turn is released at once when the sent turn is already the heading", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  buffer.tick("up");
  assert.deepEqual(sent, ["up", "left"]);
});

test("a turn the server never applied cannot block the buffer forever", () => {
  const { sent, buffer } = fixture();
  buffer.press("up", "right");
  buffer.press("left", "right");
  buffer.tick("right");
  buffer.tick("right");
  assert.deepEqual(sent, ["up", "left"]);
  buffer.tick("right");
  buffer.tick("right");
  buffer.press("down", "right");
  assert.deepEqual(sent, ["up", "left", "down"]);
});
