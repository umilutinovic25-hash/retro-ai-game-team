import type { GameSnapshot } from "../game/gameProtocol.ts";
import type { Point, RenderState } from "./renderState.ts";

export type RenderEvent =
  | { kind: "ate"; at: Point; points: number }
  | { kind: "lucky"; at: Point; points: number }
  | { kind: "levelUp"; level: number }
  | { kind: "purchase" }
  | { kind: "died" }
  | { kind: "won" };

export type AdaptResult = { state: RenderState; moved: boolean; events: RenderEvent[] };

const samePoint = (a: Point | null | undefined, b: Point | null | undefined): boolean =>
  a != null && b != null && a.x === b.x && a.y === b.y;
const adjacent = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/** Pure conversion of server snapshots into renderer input. The only memory is the previous snapshot and the last eaten item. */
export function createSnapshotAdapter() {
  let previous: GameSnapshot | null = null;
  let lastEaten: RenderState["lastEaten"] = null;

  function toState(next: GameSnapshot): RenderState {
    const player = next.players[0];
    return {
      snake: player.snake.map((segment) => ({ ...segment })),
      direction: player.direction,
      food: next.state.food ? { ...next.state.food } : null,
      lucky: next.state.luckyPickup ? { ...next.state.luckyPickup } : null,
      bonus: null,
      obstacles: [],
      score: player.score,
      status: next.state.status,
      combo: 1,
      lastEaten,
      powerUp: null,
      effects: { slow: 0, ghost: 0 },
      lastPowerUp: null,
    };
  }

  return {
    reset(): void {
      previous = null;
      lastEaten = null;
    },
    adapt(next: GameSnapshot): AdaptResult {
      const before = previous;
      if (before && before.id === next.id && next.revision === before.revision) {
        return { state: toState(next), moved: false, events: [] };
      }
      previous = next;
      const sameGame = before !== null && before.id === next.id && next.revision > before.revision;
      if (!sameGame || next.state.status === "ready") {
        lastEaten = null;
        return { state: toState(next), moved: false, events: [] };
      }

      const events: RenderEvent[] = [];
      const old = before.players[0];
      const now = next.players[0];
      const head = now.snake[0];
      const lifeLost = now.perks.extraLife.charges < old.perks.extraLife.charges;
      const moved = before.state.status === "playing" && next.state.status === "playing"
        && !lifeLost && adjacent(head, old.snake[0]);

      if (moved) {
        if (samePoint(head, before.state.food)) {
          const points = now.score - old.score;
          lastEaten = { kind: "food", points, combo: 1, at: { ...head } };
          events.push({ kind: "ate", at: { ...head }, points });
        } else if (samePoint(head, before.state.luckyPickup)) {
          lastEaten = { kind: "lucky", points: 1, combo: 1, at: { ...head } };
          events.push({ kind: "lucky", at: { ...head }, points: 1 });
        }
      }
      if (now.progression.level > old.progression.level) events.push({ kind: "levelUp", level: now.progression.level });
      const bought = next.state.status === "paused"
        && (now.perks.extraXp.level > old.perks.extraXp.level
          || now.perks.luck.level > old.perks.luck.level
          || now.perks.extraLife.charges > old.perks.extraLife.charges);
      if (bought) events.push({ kind: "purchase" });
      if (next.state.status === "game_over" && before.state.status !== "game_over") events.push({ kind: "died" });
      if (next.state.status === "won" && before.state.status !== "won") events.push({ kind: "won" });

      return { state: toState(next), moved, events };
    },
  };
}
