import test from "node:test";
import assert from "node:assert/strict";
import { swipeDirection } from "../src/ui/swipe.ts";

test("a long horizontal or vertical drag maps to a direction", () => {
  assert.equal(swipeDirection(60, 5), "right");
  assert.equal(swipeDirection(-60, 5), "left");
  assert.equal(swipeDirection(4, 60), "down");
  assert.equal(swipeDirection(4, -60), "up");
});

test("short drags and taps are not swipes", () => {
  assert.equal(swipeDirection(0, 0), null);
  assert.equal(swipeDirection(10, -12), null);
  assert.equal(swipeDirection(23, 0), null);
  assert.equal(swipeDirection(24, 0), "right");
});

test("the dominant axis wins and a tie prefers vertical", () => {
  assert.equal(swipeDirection(40, 30), "right");
  assert.equal(swipeDirection(30, 40), "down");
  assert.equal(swipeDirection(30, 30), "down");
});
