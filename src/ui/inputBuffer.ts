import { isOpposite, type Direction } from "../game/snakeEngine.ts";

/**
 * Keeps two quick turns inside one game tick. The first turn is sent at once, a second one is held
 * and sent when the next tick (a snapshot in which the snake moved) arrives.
 */
export function createInputBuffer(send: (direction: Direction) => void) {
  let awaitingTick = false;
  let lastSent: Direction | null = null;
  let held: Direction | null = null;

  return {
    press(direction: Direction, heading: Direction): void {
      if (!awaitingTick) {
        if (direction === heading || isOpposite(direction, heading)) return;
        send(direction);
        lastSent = direction;
        awaitingTick = true;
        return;
      }
      if (direction === lastSent || (lastSent !== null && isOpposite(direction, lastSent))) return;
      held = direction;
    },
    tick(): void {
      awaitingTick = false;
      if (held === null) return;
      const next = held;
      held = null;
      send(next);
      lastSent = next;
      awaitingTick = true;
    },
    reset(): void {
      awaitingTick = false;
      lastSent = null;
      held = null;
    },
  };
}
