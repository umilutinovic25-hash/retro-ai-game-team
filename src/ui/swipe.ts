import type { Direction } from "../game/snakeEngine.ts";

export function swipeDirection(dx: number, dy: number, minPx = 24): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minPx) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
