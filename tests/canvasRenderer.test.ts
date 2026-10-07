import test from "node:test";
import assert from "node:assert/strict";
import { sameSnakePositions } from "../src/rendering/canvasRenderer.ts";

test("duplicate snapshots with copied snake arrays keep the current tween", () => {
  const current = [{ x: 5, y: 6 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
  const duplicate = current.map((point) => ({ ...point }));
  assert.notEqual(current, duplicate);
  assert.equal(sameSnakePositions(current, duplicate), true);
});

test("a changed cell or snake length is not a duplicate position", () => {
  const current = [{ x: 5, y: 6 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
  assert.equal(sameSnakePositions(current, [{ x: 5, y: 7 }, { x: 5, y: 6 }, { x: 5, y: 5 }]), false);
  assert.equal(sameSnakePositions(current, current.slice(0, 2)), false);
});
