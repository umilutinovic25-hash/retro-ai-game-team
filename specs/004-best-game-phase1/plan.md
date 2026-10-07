# Best Game Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DOM board with the Canvas renderer and add the client-only features of the user's private modern branch to the server-authoritative team game, with no change to `server/`, the snapshot protocol or the game rules.

**Architecture:** A pure `snapshotAdapter` turns each validated `GameSnapshot` (plus the previous one) into the render state the ported Canvas renderer expects, a `moved` flag and derived events. Client-only features (sound, records, difficulty presets, input buffer, countdown, swipe, colorblind) are separate small modules. The modern neon theme becomes the page base, and the team HUD, shop, advisor and Strategist are re-added on top with all existing HTML ids preserved.

**Tech Stack:** TypeScript (Node ≥ 22 type-stripping, `node --test`), Vite, Canvas 2D, Web Audio, Playwright (existing `npm run test:e2e` harness). No new dependencies.

**Spec:** [spec.md](spec.md). Source of ported code: local git ref `modern-graphics-src` (= the user's private `feature/modern-graphics` @ `32a13c5`, read-only, never pushed).

## Global Constraints

- Branch `best-game-phase1`. **Nothing is pushed or published** by this plan; the user decides later.
- **No change under `server/`** and none to `src/game/gameProtocol.ts`, the snapshot shape, perk rules, AI prompts or AI tools (SC-004). Verify at the end with `git diff --stat main..HEAD -- server src/game/gameProtocol.ts` printing nothing.
- No third-party assets or audio files; sound is synthesized (Web Audio). No new dependencies.
- Node.js ≥ 22; imports use explicit `.ts` extensions; no `enum`, no parameter properties, no namespaces. Tests: `node:test` + `node:assert/strict` in `tests/*.test.ts`.
- Required gates: `npm run typecheck`, `npm test`, `npm run build`, `npm run security:scan`, and `npm run test:e2e` for the browser checks.
- Never open, read, print or commit `.env` or any key. No AI behaviour or secret handling changes.
- Commits: imperative one-liners. **Never add `Co-Authored-By` or any Claude/session line** (user rule).
- Repo workflow: log in `docs/tracking/WORK_LOG.md`, record real outputs in evidence, never claim an unrun check.
- Keyboard: arrows, P/Space pause, R restart, S shop, M sound, C colors. **WASD is not mapped** because S is the shop key (ruling for this plan).

## Review Focus

Inputs and conditions the spec implies that no task's headline tests would catch; each has a test in the owning task.

1. Duplicate, older or other-game snapshots, and the extra-life respawn, must not fake a move, a tween or an event — Task 3.
2. `localStorage` missing, throwing or holding corrupted/HTML-looking data must never break the page or inject markup — Task 1 and Task 4.
3. Arrow pressed during the countdown, an arrow opposite to the start heading, and pause pressed during the countdown must not move or start the snake wrongly — Task 2 and Task 7.
4. A difficulty change during play or during the countdown must be refused; a valid change must create a new server game and stop the old event stream — Task 7.
5. Closing the shop (W04 test M4) must not leave the status reading `PAUSED` while the countdown runs — Task 7.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/difficulty.ts` (new) | `Difficulty`, `isDifficulty`, speed-only `DIFFICULTY_CONFIGS` |
| `src/ui/settings.ts` (new) | Safe localStorage helpers, setting keys, per-difficulty best score |
| `src/ui/swipe.ts` (new) | Pure swipe-to-direction |
| `src/ui/inputBuffer.ts` (new) | Pure two-turn input buffer |
| `src/ui/countdown.ts` (new) | 3-2-1-GO controller with an injectable scheduler |
| `src/rendering/renderState.ts` (new) | Types the renderer consumes |
| `src/rendering/snapshotAdapter.ts` (new) | Pure snapshot → render state, `moved`, events |
| `src/ui/records.ts` (ported) | Local top-10 and stats (validated on read) |
| `src/audio/sound.ts` (ported) | Generated sound effects |
| `src/rendering/canvasRenderer.ts` (ported + edits) | Canvas renderer with Lucky pickup support |
| `index.html`, `src/styles.css` (rewritten) | Neon page with the team HUD, shop, advisor and Strategist |
| `src/api/gameClient.ts` (modify) | `create(config?)` |
| `src/main.ts` (rewritten) | Client orchestration on the Canvas |
| `scripts/e2e/shopAdvisor.e2e.ts` (modify) | Add Canvas, countdown, settings, records, difficulty checks |
| `tests/difficulty.test.ts`, `settings.test.ts`, `swipe.test.ts`, `inputBuffer.test.ts`, `countdown.test.ts`, `snapshotAdapter.test.ts`, `records.test.ts` (new/ported) | Unit tests |
| `AGENTS.md`, `docs/INSTRUCTIONS.md`, `docs/instructions/01-project-architecture.md`, `README.md`, spec, tracking (modify) | Contract and evidence |

---

### Task 1: Difficulty presets, settings storage and swipe

**Files:**
- Create: `src/ui/difficulty.ts`, `src/ui/settings.ts`, `src/ui/swipe.ts`
- Test: `tests/difficulty.test.ts`, `tests/settings.test.ts`, `tests/swipe.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_CONFIG`, `GameConfig`, `parseGameConfig` (`src/game/snakeConfig.ts`), `Direction` (`src/game/snakeEngine.ts`).
- Produces: `DIFFICULTIES`, `Difficulty`, `isDifficulty(value): value is Difficulty`, `DIFFICULTY_CONFIGS: Record<Difficulty, GameConfig>`; `SETTING_KEYS`, `readSetting(key, storage?)`, `writeSetting(key, value, storage?)`, `bestKey(difficulty)`, `readBest(difficulty, storage?)`; `swipeDirection(dx, dy, minPx?): Direction | null`.

- [ ] **Step 1: Write the failing tests**

`tests/difficulty.test.ts`:

```ts
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
```

`tests/settings.test.ts`:

```ts
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
```

`tests/swipe.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/difficulty.test.ts tests/settings.test.ts tests/swipe.test.ts`
Expected: FAIL (cannot find modules `../src/ui/difficulty.ts`, `settings.ts`, `swipe.ts`).

- [ ] **Step 3: Implement**

`src/ui/difficulty.ts`:

```ts
import { DEFAULT_CONFIG, type GameConfig } from "../game/snakeConfig.ts";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

/** Speed-only presets for Phase 1. They are sent to the server, which validates them with parseGameConfig. */
export const DIFFICULTY_CONFIGS: Record<Difficulty, GameConfig> = {
  easy: { ...DEFAULT_CONFIG, startingSpeedMs: 200 },
  normal: DEFAULT_CONFIG,
  hard: { ...DEFAULT_CONFIG, startingSpeedMs: 125 },
};
```

`src/ui/settings.ts`:

```ts
import type { Difficulty } from "./difficulty.ts";

export const SETTING_KEYS = {
  difficulty: "retro-snake-difficulty",
  colorblind: "retro-snake-colorblind",
} as const;

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSetting(key: string, storage: ReadStorage | null = defaultStorage()): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string, storage: WriteStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Local persistence is optional; the game must work when it is unavailable.
  }
}

export function bestKey(difficulty: Difficulty): string {
  return difficulty === "normal" ? "retro-snake-best-score" : `retro-snake-best-score-${difficulty}`;
}

export function readBest(difficulty: Difficulty, storage: ReadStorage | null = defaultStorage()): number {
  const saved = Number(readSetting(bestKey(difficulty), storage));
  return Number.isInteger(saved) && saved >= 0 ? saved : 0;
}
```

`src/ui/swipe.ts`:

```ts
import type { Direction } from "../game/snakeEngine.ts";

export function swipeDirection(dx: number, dy: number, minPx = 24): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minPx) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `node --test tests/difficulty.test.ts tests/settings.test.ts tests/swipe.test.ts && npm run typecheck`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/difficulty.ts src/ui/settings.ts src/ui/swipe.ts tests/difficulty.test.ts tests/settings.test.ts tests/swipe.test.ts
git commit -m "Add difficulty presets, safe settings storage and swipe helper"
```

---

### Task 2: Input buffer and countdown

**Files:**
- Create: `src/ui/inputBuffer.ts`, `src/ui/countdown.ts`
- Test: `tests/inputBuffer.test.ts`, `tests/countdown.test.ts`

**Interfaces:**
- Consumes: `Direction`, `isOpposite` (`src/game/snakeEngine.ts`).
- Produces: `createInputBuffer(send: (d: Direction) => void)` → `{ press(direction, heading), tick(), reset() }`; `createCountdown(options)` → `{ start(onDone), cancel(), isRunning() }` with `CountdownLabel = "3" | "2" | "1" | "GO!"` and options `{ stepMs, hideAfterMs?, onLabel, onHide, schedule?, cancelScheduled? }`.

- [ ] **Step 1: Write the failing tests**

`tests/inputBuffer.test.ts`:

```ts
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
```

`tests/countdown.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createCountdown, type CountdownLabel } from "../src/ui/countdown.ts";

function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    schedule: (fn: () => void, ms: number) => { const id = nextId++; tasks.set(id, { at: now + ms, fn }); return id; },
    cancelScheduled: (id: unknown) => { tasks.delete(id as number); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        tasks.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
  };
}

function fixture() {
  const clock = fakeScheduler();
  const log: string[] = [];
  const countdown = createCountdown({
    stepMs: 550,
    onLabel: (label: CountdownLabel) => { log.push(label); },
    onHide: () => { log.push("hide"); },
    schedule: clock.schedule,
    cancelScheduled: clock.cancelScheduled,
  });
  return { clock, log, countdown };
}

test("counts 3, 2, 1, then GO and calls onDone exactly once", () => {
  const { clock, log, countdown } = fixture();
  let done = 0;
  countdown.start(() => { done += 1; });
  assert.equal(countdown.isRunning(), true);
  clock.advance(0);
  assert.deepEqual(log, ["3"]);
  clock.advance(550);
  clock.advance(550);
  assert.deepEqual(log, ["3", "2", "1"]);
  assert.equal(done, 0);
  assert.equal(countdown.isRunning(), true);
  clock.advance(550);
  assert.deepEqual(log, ["3", "2", "1", "GO!"]);
  assert.equal(done, 1);
  assert.equal(countdown.isRunning(), false);
  clock.advance(520);
  assert.deepEqual(log, ["3", "2", "1", "GO!", "hide"]);
  clock.advance(5000);
  assert.equal(done, 1);
});

test("cancelling stops the countdown, never calls onDone and hides once", () => {
  const { clock, log, countdown } = fixture();
  let done = 0;
  countdown.start(() => { done += 1; });
  clock.advance(600);
  countdown.cancel();
  assert.equal(countdown.isRunning(), false);
  clock.advance(5000);
  assert.equal(done, 0);
  assert.deepEqual(log, ["3", "2", "hide"]);
});

test("starting again replaces the running countdown", () => {
  const { clock, log, countdown } = fixture();
  const calls: string[] = [];
  countdown.start(() => { calls.push("first"); });
  clock.advance(600);
  countdown.start(() => { calls.push("second"); });
  clock.advance(5000);
  assert.deepEqual(calls, ["second"]);
  assert.equal(log.filter((entry) => entry === "GO!").length, 1);
});

test("cancelling when idle is harmless", () => {
  const { countdown, log } = fixture();
  assert.doesNotThrow(() => countdown.cancel());
  assert.equal(countdown.isRunning(), false);
  assert.deepEqual(log, ["hide"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/inputBuffer.test.ts tests/countdown.test.ts`
Expected: FAIL (cannot find modules `../src/ui/inputBuffer.ts`, `../src/ui/countdown.ts`).

- [ ] **Step 3: Implement**

`src/ui/inputBuffer.ts`:

```ts
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
```

`src/ui/countdown.ts`:

```ts
export type CountdownLabel = "3" | "2" | "1" | "GO!";

export type CountdownOptions = {
  stepMs: number;
  hideAfterMs?: number;
  onLabel: (label: CountdownLabel) => void;
  onHide: () => void;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
};

export function createCountdown(options: CountdownOptions) {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  const cancelScheduled = options.cancelScheduled ?? ((handle: unknown) => window.clearTimeout(handle as number));
  const hideAfterMs = options.hideAfterMs ?? 520;
  let handles: unknown[] = [];
  let running = false;

  function clear(): void {
    handles.forEach(cancelScheduled);
    handles = [];
  }

  return {
    isRunning: () => running,
    start(onDone: () => void): void {
      clear();
      running = true;
      (["3", "2", "1"] as const).forEach((label, index) => {
        handles.push(schedule(() => options.onLabel(label), index * options.stepMs));
      });
      handles.push(schedule(() => {
        running = false;
        options.onLabel("GO!");
        onDone();
        handles.push(schedule(options.onHide, hideAfterMs));
      }, 3 * options.stepMs));
    },
    cancel(): void {
      clear();
      running = false;
      options.onHide();
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `node --test tests/inputBuffer.test.ts tests/countdown.test.ts && npm run typecheck`
Expected: all PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/inputBuffer.ts src/ui/countdown.ts tests/inputBuffer.test.ts tests/countdown.test.ts
git commit -m "Add client input buffer and countdown controller"
```

---

### Task 3: Render state and snapshot adapter

**Files:**
- Create: `src/rendering/renderState.ts`, `src/rendering/snapshotAdapter.ts`
- Test: `tests/snapshotAdapter.test.ts`

**Interfaces:**
- Consumes: `GameSnapshot` (`src/game/gameProtocol.ts`).
- Produces (`renderState.ts`): `Point`, `Direction`, `GameStatus`, `BonusKind`, `EatenKind` (`"food" | "lucky" | BonusKind`), `PowerUpKind`, `RenderBonus`, `RenderPowerUp`, `RenderState`, `RendererConfig = { gridSize: number; maxComboMultiplier: number }`.
- Produces (`snapshotAdapter.ts`): `RenderEvent` (kinds `ate | lucky | levelUp | purchase | died | won`), `AdaptResult = { state: RenderState; moved: boolean; events: RenderEvent[] }`, `createSnapshotAdapter()` → `{ adapt(next): AdaptResult, reset(): void }`.
- Ruling: the `won` event is added to the spec's list so a cleared board plays its own sound and finishes the record.

- [ ] **Step 1: Write the failing test** — `tests/snapshotAdapter.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/game/snakeConfig.ts";
import type { GameSnapshot } from "../src/game/gameProtocol.ts";
import { createSnapshotAdapter } from "../src/rendering/snapshotAdapter.ts";

type Pt = { x: number; y: number };
type Over = {
  id?: string; revision?: number; status?: GameSnapshot["state"]["status"]; snake?: Pt[];
  food?: Pt | null; lucky?: Pt | null; score?: number; level?: number; perkPoints?: number;
  extraXp?: number; luck?: number; lives?: number;
};

function snap(o: Over = {}): GameSnapshot {
  const extraXp = o.extraXp ?? 0;
  const luck = o.luck ?? 0;
  const lives = o.lives ?? 0;
  return {
    id: o.id ?? "g1",
    revision: o.revision ?? 1,
    config: DEFAULT_CONFIG,
    configError: null,
    players: [{
      id: "p1",
      snake: o.snake ?? [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: "right",
      queuedDirection: "right",
      score: o.score ?? 0,
      progression: { xp: 0, level: o.level ?? 1, perkPoints: o.perkPoints ?? 0 },
      perks: {
        extraXp: { level: extraXp, nextCost: extraXp < 5 ? extraXp + 1 : null },
        luck: { level: luck, nextCost: luck < 5 ? luck + 1 : null },
        extraLife: { charges: lives, nextCost: lives === 0 ? 5 : lives === 1 ? 8 : null },
      },
    }],
    state: { food: o.food === undefined ? { x: 15, y: 5 } : o.food, luckyPickup: o.lucky ?? null, status: o.status ?? "playing" },
  };
}

const moveRight = (head: number, extra: Over = {}): Over => ({
  snake: [{ x: head, y: 10 }, { x: head - 1, y: 10 }, { x: head - 2, y: 10 }], ...extra,
});

test("the first snapshot is a reset with neutral Phase 2 fields", () => {
  const result = createSnapshotAdapter().adapt(snap({ revision: 1 }));
  assert.equal(result.moved, false);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.bonus, null);
  assert.deepEqual(result.state.obstacles, []);
  assert.equal(result.state.combo, 1);
  assert.deepEqual(result.state.effects, { slow: 0, ghost: 0 });
  assert.equal(result.state.powerUp, null);
  assert.equal(result.state.lastEaten, null);
});

test("an adjacent head while playing is a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(11, { revision: 2 })));
  assert.equal(result.moved, true);
  assert.deepEqual(result.state.snake[0], { x: 11, y: 10 });
});

test("a pause snapshot is not a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, status: "paused" })));
  assert.equal(result.moved, false);
});

test("eating food emits ate and keeps lastEaten stable until the next eat", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  const ate = adapter.adapt(snap({
    revision: 2, score: 1, food: { x: 3, y: 3 },
    snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  assert.deepEqual(ate.events, [{ kind: "ate", at: { x: 11, y: 10 }, points: 1 }]);
  assert.equal(ate.state.lastEaten?.kind, "food");
  const quiet = adapter.adapt(snap({
    revision: 3, score: 1, food: { x: 3, y: 3 },
    snake: [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }],
  }));
  assert.deepEqual(quiet.events, []);
  assert.equal(quiet.state.lastEaten, ate.state.lastEaten);
});

test("collecting the Lucky pickup emits lucky and a lucky lastEaten", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, lucky: { x: 11, y: 10 } })));
  const result = adapter.adapt(snap({ ...moveRight(11, { revision: 2, perkPoints: 1 }), lucky: null }));
  assert.deepEqual(result.events, [{ kind: "lucky", at: { x: 11, y: 10 }, points: 1 }]);
  assert.equal(result.state.lastEaten?.kind, "lucky");
});

test("a higher level emits levelUp", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const result = adapter.adapt(snap(moveRight(11, { revision: 2, level: 2, perkPoints: 1 })));
  assert.deepEqual(result.events, [{ kind: "levelUp", level: 2 }]);
});

test("a perk purchase while paused emits purchase and is not a move", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, status: "paused", perkPoints: 3 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, status: "paused", perkPoints: 2, extraXp: 1 })));
  assert.deepEqual(result.events, [{ kind: "purchase" }]);
  assert.equal(result.moved, false);
});

test("game over and board clear are emitted once", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1 })));
  const over = adapter.adapt(snap(moveRight(10, { revision: 2, status: "game_over" })));
  assert.deepEqual(over.events, [{ kind: "died" }]);
  assert.equal(over.moved, false);
  const again = adapter.adapt(snap(moveRight(10, { revision: 3, status: "game_over" })));
  assert.deepEqual(again.events, []);

  const winner = createSnapshotAdapter();
  winner.adapt(snap(moveRight(10, { revision: 1 })));
  assert.deepEqual(winner.adapt(snap(moveRight(11, { revision: 2, status: "won" }))).events, [{ kind: "won" }]);
});

test("an extra-life respawn is not a move even when the new head is adjacent", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(11, { revision: 1, lives: 1 })));
  const result = adapter.adapt(snap(moveRight(10, { revision: 2, lives: 0 })));
  assert.equal(result.moved, false);
  assert.deepEqual(result.events, []);
});

test("a duplicate revision changes nothing and keeps lastEaten", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  const ate = adapter.adapt(snap({
    revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  const duplicate = adapter.adapt(snap({
    revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  }));
  assert.equal(duplicate.moved, false);
  assert.deepEqual(duplicate.events, []);
  assert.equal(duplicate.state.lastEaten, ate.state.lastEaten);
});

test("another game or a ready snapshot resets lastEaten and emits nothing", () => {
  const adapter = createSnapshotAdapter();
  adapter.adapt(snap(moveRight(10, { revision: 1, food: { x: 11, y: 10 } })));
  adapter.adapt(snap({ revision: 2, score: 1, snake: [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] }));
  const other = adapter.adapt(snap({ id: "g2", revision: 1, status: "ready" }));
  assert.equal(other.state.lastEaten, null);
  assert.deepEqual(other.events, []);
  assert.equal(other.moved, false);
});

test("adapting never mutates the snapshot it was given", () => {
  const input = snap(moveRight(10, { revision: 1 }));
  const before = JSON.stringify(input);
  const result = createSnapshotAdapter().adapt(input);
  result.state.snake[0].x = 99;
  assert.equal(JSON.stringify(input), before);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/snapshotAdapter.test.ts`
Expected: FAIL (cannot find module `../src/rendering/snapshotAdapter.ts`).

- [ ] **Step 3: Implement**

`src/rendering/renderState.ts`:

```ts
export type Point = { x: number; y: number };
export type Direction = "up" | "right" | "down" | "left";
export type GameStatus = "ready" | "playing" | "paused" | "game_over" | "won";
export type BonusKind = "gold" | "gem";
export type EatenKind = "food" | "lucky" | BonusKind;
export type PowerUpKind = "slow" | "ghost";

export type RenderBonus = { position: Point; kind: BonusKind; points: number; ticksLeft: number; lifetime: number };
export type RenderPowerUp = { position: Point; kind: PowerUpKind; ticksLeft: number; lifetime: number };

/** What the Canvas renderer draws. Phase 2 entities are neutral until the engine and server provide them. */
export type RenderState = {
  snake: Point[];
  direction: Direction;
  food: Point | null;
  lucky: Point | null;
  bonus: RenderBonus | null;
  obstacles: Point[];
  score: number;
  status: GameStatus;
  combo: number;
  lastEaten: { kind: EatenKind; points: number; combo: number; at: Point } | null;
  powerUp: RenderPowerUp | null;
  effects: Record<PowerUpKind, number>;
  lastPowerUp: { kind: PowerUpKind; at: Point } | null;
};

export type RendererConfig = { gridSize: number; maxComboMultiplier: number };
```

`src/rendering/snapshotAdapter.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `node --test tests/snapshotAdapter.test.ts && npm run typecheck`
Expected: 11 tests PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add src/rendering/renderState.ts src/rendering/snapshotAdapter.ts tests/snapshotAdapter.test.ts
git commit -m "Add render state and snapshot adapter for the Canvas renderer"
```

---

### Task 4: Port records and sound

**Files:**
- Create (ported): `src/ui/records.ts`, `src/audio/sound.ts`, `tests/records.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `isDifficulty` (`src/ui/difficulty.ts`, Task 1).
- Produces: `TOP_SIZE`, `ScoreEntry`, `Stats`, `Records`, `sanitizeName`, `parseRecords`, `loadRecords`, `saveRecords`, `qualifies`, `addEntry`, `recordGame`; `SoundName`, `SoundPlayer { play(name, combo?), toggleMuted(), isMuted() }`, `createSoundPlayer()`.
- TDD note: `sound.ts` is Web Audio synthesis (no logic that runs under Node); it is ported verbatim and verified by typecheck, the M-key e2e check (Task 7) and a manual listen. `records.ts` keeps its original test file.

- [ ] **Step 1: Port the test first and watch it fail**

```bash
git show modern-graphics-src:tests/records.test.ts > tests/records.test.ts
node --test tests/records.test.ts
```

Expected: FAIL (cannot find module `../src/ui/records.ts`).

- [ ] **Step 2: Port the modules and repoint the difficulty import**

```bash
mkdir -p src/audio
git show modern-graphics-src:src/audio/sound.ts > src/audio/sound.ts
git show modern-graphics-src:src/ui/records.ts > src/ui/records.ts
python3 -I - <<'PY'
import pathlib
p = pathlib.Path("src/ui/records.ts"); t = p.read_text(encoding="utf-8")
old = 'import { isDifficulty, type Difficulty } from "../game/snakeConfig.ts";'
assert t.count(old) == 1
p.write_text(t.replace(old, 'import { isDifficulty, type Difficulty } from "./difficulty.ts";'), encoding="utf-8")
PY
grep -n "^import" src/ui/records.ts src/audio/sound.ts
```

Expected: `records.ts` imports only `./difficulty.ts`; `sound.ts` has no imports.

- [ ] **Step 3: Run tests and typecheck**

Run: `node --test tests/records.test.ts && npm run typecheck && npm test`
Expected: records tests PASS; typecheck 0; whole suite green (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/ui/records.ts src/audio/sound.ts tests/records.test.ts
git commit -m "Port local records and generated sound effects"
```

---

### Task 5: Port the Canvas renderer with Lucky pickup support

**Files:**
- Create (ported): `src/rendering/canvasRenderer.ts`
- Modify: the ported file (edits below)

**Interfaces:**
- Consumes: `RenderState`, `RendererConfig`, `Point`, `Direction`, `EatenKind`, `PowerUpKind` (Task 3).
- Produces: `Renderer = { update(state: RenderState, moved: boolean, tickMs: number): void; banner(text, color): void; setColorblind(enabled): void }`, `createRenderer(canvas: HTMLCanvasElement, config: RendererConfig): Renderer`.
- TDD note: a Canvas renderer cannot run under Node. It is verified by typecheck here, then by the Playwright pixel check (Task 7) and a manual visual check (Task 8).

- [ ] **Step 1: Port the file**

```bash
mkdir -p src/rendering
git show modern-graphics-src:src/rendering/canvasRenderer.ts > src/rendering/canvasRenderer.ts
npm run typecheck 2>&1 | head -5
```

Expected: typecheck FAILS (the ported file imports types from the modern engine that do not exist in the team engine). This is the red state for the next step.

- [ ] **Step 2: Apply the edits with a checked script**

```bash
python3 -I - <<'PY'
import pathlib
p = pathlib.Path("src/rendering/canvasRenderer.ts"); t = p.read_text(encoding="utf-8")
def sub(old, new):
    global t
    assert t.count(old) == 1, (old[:60], t.count(old))
    t = t.replace(old, new)

# 1. Types come from the render state, keeping the original local names.
sub('import type { GameConfig } from "../game/snakeConfig.ts";\nimport type { Direction, EatenKind, GameState, Point, PowerUpKind } from "../game/snakeEngine.ts";',
    'import type { Direction, EatenKind, Point, PowerUpKind, RenderState as GameState, RendererConfig as GameConfig } from "./renderState.ts";')

# 2. Palette type: add the Lucky colors.
sub("  gem: [string, string, string];\n  obstacle:", "  gem: [string, string, string];\n  lucky: [string, string, string];\n  obstacle:")

# 3. Normal palette.
sub('    gem: ["#e0fbff", "#4cc9f0", "#7b2cbf"],\n    obstacle: ["#5a3d8f", "#231542"],',
    '    gem: ["#e0fbff", "#4cc9f0", "#7b2cbf"],\n    lucky: ["#ffe9c2", "#ff9f1c", "#a85a00"],\n    obstacle: ["#5a3d8f", "#231542"],')
sub('      gem: ["#4cc9f0", "#b8f2ff", "#9d4edd"],\n      slow:',
    '      gem: ["#4cc9f0", "#b8f2ff", "#9d4edd"],\n      lucky: ["#ff9f1c", "#ffd08a", "#fff3c4"],\n      slow:')

# 4. Colorblind palette.
sub('    gem: ["#ffe3f2", "#cc79a7", "#7a2f5a"],\n    obstacle: ["#d55e00", "#6b2d00"],',
    '    gem: ["#ffe3f2", "#cc79a7", "#7a2f5a"],\n    lucky: ["#fff3c4", "#f0a000", "#7a4a00"],\n    obstacle: ["#d55e00", "#6b2d00"],')
sub('      gem: ["#cc79a7", "#ffc4e4", "#ffffff"],\n      slow:',
    '      gem: ["#cc79a7", "#ffc4e4", "#ffffff"],\n      lucky: ["#f0a000", "#ffe29a", "#ffffff"],\n      slow:')

# 5. Floating text for the Lucky pickup.
sub('text: eaten.combo > 1 ? `+${eaten.points} ×${eaten.combo}` : `+${eaten.points}`',
    'text: eaten.kind === "lucky" ? "+1 PT" : eaten.combo > 1 ? `+${eaten.points} ×${eaten.combo}` : `+${eaten.points}`')

# 6. Draw the Lucky pickup right after the food.
sub("  function timerRing(r: number, remaining: number, color: string): void {", '''  function drawLucky(p: Point, time: number): void {
    const c = center(p);
    const pulse = reducedMotion ? 1 : 1 + 0.1 * Math.sin(time / 150);
    const r = cell * 0.33 * pulse;
    g.save();
    g.shadowColor = palette.lucky[1];
    g.shadowBlur = cell * 1.1;
    const orb = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
    orb.addColorStop(0, palette.lucky[0]);
    orb.addColorStop(0.4, palette.lucky[1]);
    orb.addColorStop(1, palette.lucky[2]);
    g.fillStyle = orb;
    g.beginPath();
    if (palette.hatch) {
      g.moveTo(c.x, c.y - r * 1.15);
      g.lineTo(c.x + r * 1.15, c.y);
      g.lineTo(c.x, c.y + r * 1.15);
      g.lineTo(c.x - r * 1.15, c.y);
      g.closePath();
    } else {
      g.arc(c.x, c.y, r, 0, Math.PI * 2);
    }
    g.fill();
    g.shadowBlur = 0;
    if (!reducedMotion) {
      for (let i = 0; i < 4; i += 1) {
        const angle = -time / 450 + (i * Math.PI * 2) / 4;
        const orbit = cell * 0.5;
        g.fillStyle = `rgba(255, 236, 170, ${0.45 + 0.4 * Math.sin(time / 160 + i)})`;
        g.beginPath();
        g.arc(c.x + Math.cos(angle) * orbit, c.y + Math.sin(angle) * orbit, cell * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function timerRing(r: number, remaining: number, color: string): void {''')

# 7. Frame order.
sub("      if (curr.food) drawFood(curr.food, time);\n", "      if (curr.food) drawFood(curr.food, time);\n      if (curr.lucky) drawLucky(curr.lucky, time);\n")

p.write_text(t, encoding="utf-8")
PY
npm run typecheck 2>&1 | tail -15