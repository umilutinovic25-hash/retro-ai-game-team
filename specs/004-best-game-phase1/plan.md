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
```

Expected: the script finishes without an assertion error (every replacement matched exactly once) and `npm run typecheck` prints no errors.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: all existing and new tests pass (the renderer is not imported by any test yet).

- [ ] **Step 4: Commit**

```bash
git add src/rendering/canvasRenderer.ts
git commit -m "Port the Canvas renderer with a Lucky pickup layer"
```

---

### Task 6: Neon page with the team HUD, shop and AI panels

**Files:**
- Rewrite: `index.html`, `src/styles.css`
- Test: `tests/pageMarkup.test.ts`

**Interfaces:**
- Produces: a page whose ids are exactly those `src/main.ts` (Task 7) looks up. Every id the current client uses is preserved; new ids: `countdown`, `name-form`, `name-input`, `name-rank`, `mute`, `colorblind`, `records-open`, `records-dialog`, `records-list`, `records-empty`, `stat-games`, `stat-food`, `stat-length`, `stat-combo`, plus three `data-difficulty` buttons.
- Note: until Task 7 lands the page loads but `main.ts` still targets the old DOM board. The commit is verified by the markup test and the production build only.

- [ ] **Step 1: Write the failing test** — `tests/pageMarkup.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

const REQUIRED = [
  "score", "best-score", "status", "pace", "server-connection", "board", "countdown",
  "game-overlay", "overlay-title", "overlay-message", "overlay-action", "name-form", "name-input", "name-rank",
  "xp-value", "level-value", "perk-points-value", "extra-xp-value", "extra-xp-cubes", "luck-value", "luck-cubes",
  "life-value", "life-cubes", "perk-shop", "shop-xp", "shop-level", "shop-points", "shop-close",
  "shop-luck-value", "shop-luck-cubes", "buy-luck", "shop-extra-xp-value", "shop-extra-xp-cubes", "buy-extra-xp",
  "shop-life-value", "shop-life-cubes", "buy-extra-life", "shop-advice-output", "shop-advice-button",
  "shop-agent-output", "shop-agent-button", "shop-message", "pause", "shop-toggle", "restart", "mute",
  "colorblind", "records-open", "records-dialog", "records-list", "records-empty",
  "stat-games", "stat-food", "stat-length", "stat-combo",
];

test("every id the client needs exists exactly once", () => {
  for (const id of REQUIRED) assert.equal(ids.filter((value) => value === id).length, 1, id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
});

test("the board is a canvas and the page keeps its controls", () => {
  assert.match(html, /<canvas id="board"/);
  assert.equal((html.match(/data-difficulty="(easy|normal|hard)"/g) ?? []).length, 3);
  assert.equal((html.match(/data-direction="(up|right|down|left)"/g) ?? []).length, 4);
  assert.match(html, /<script type="module" src="\/src\/main\.ts"><\/script>/);
});

test("the shop and the AI panels live inside the board frame", () => {
  const frame = /<div class="board-frame">([\s\S]*?)\n        <\/div>\n        <ul class="legend"/.exec(html)?.[1] ?? "";
  for (const id of ["perk-shop", "shop-advice-button", "shop-agent-button", "game-overlay", "countdown"]) {
    assert.ok(frame.includes(`id="${id}"`), `${id} must be inside .board-frame`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/pageMarkup.test.ts`
Expected: FAIL (the current page has no `countdown`, `mute`, `colorblind`, … and a div board).

- [ ] **Step 3: Build the page**

```bash
python3 -I - <<'PY'
import pathlib, re
html = pathlib.Path("index.html").read_text(encoding="utf-8")
hud = re.search(r'<section class="progression-hud".*?</section>', html, re.S).group(0)
shop = re.search(r'<section id="perk-shop".*?\n          </section>', html, re.S).group(0)

page = '''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#07061a" />
    <title>RETRO SNAKE</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2307061a'/%3E%3Cpath d='M7 22h10a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h8' fill='none' stroke='%232ee6a0' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='26' cy='24' r='3' fill='%23ff4d6d'/%3E%3C/svg%3E" />
  </head>
  <body>
    <div class="backdrop" aria-hidden="true"><span></span><span></span><span></span><div class="sun"></div><div class="floor"></div></div>
    <main class="app-shell">
      <header class="game-header">
        <div>
          <p class="eyebrow">ARCADE / 001</p>
          <h1 data-text="RETRO SNAKE">RETRO<br /><span>SNAKE</span></h1>
        </div>
        <div class="score-cluster" aria-live="polite">
          <div class="stat score-panel">
            <span>SCORE</span>
            <strong id="score">0</strong>
          </div>
          <div class="stat best-panel">
            <span>BEST</span>
            <strong id="best-score">0</strong>
          </div>
        </div>
      </header>

      <nav class="toolbar" aria-label="Game settings">
        <div class="segmented" role="group" aria-label="Difficulty">
          <button type="button" data-difficulty="easy" aria-pressed="false">EASY</button>
          <button type="button" data-difficulty="normal" aria-pressed="true">NORMAL</button>
          <button type="button" data-difficulty="hard" aria-pressed="false">HARD</button>
        </div>
        <div class="toolbar-actions">
          <button id="colorblind" type="button" class="pill" aria-pressed="false">◐ COLORBLIND</button>
          <button id="records-open" type="button" class="pill">★ RECORDS</button>
        </div>
      </nav>

      @@HUD@@

      <section class="game-card" aria-label="Snake game">
        <div class="status-row">
          <span id="status" class="chip" aria-live="polite" data-state="ready">READY</span>
          <span class="chip">SPEED <b id="pace">1.0×</b></span>
          <span class="chip">20 × 20</span>
          <span id="server-connection" class="chip" data-connection="connecting">CONNECTING</span>
        </div>
        <div class="board-frame">
          <canvas id="board" class="board" role="img" aria-label="Snake game board"></canvas>
          <div id="countdown" class="countdown" aria-live="assertive" hidden></div>
          <section id="game-overlay" class="game-overlay" aria-live="polite" data-state="ready">
            <p id="overlay-title" class="overlay-title">READY?</p>
            <p id="overlay-message" class="overlay-message">PRESS AN ARROW KEY OR TAP A DIRECTION TO START</p>
            <form id="name-form" class="name-form" hidden>
              <label for="name-input" id="name-rank">NEW HIGH SCORE</label>
              <div>
                <input id="name-input" maxlength="3" autocomplete="off" spellcheck="false" placeholder="AAA" aria-describedby="name-rank" />
                <button type="submit">SAVE</button>
              </div>
            </form>
            <button id="overlay-action" class="overlay-button" type="button" hidden>PLAY AGAIN</button>
          </section>
          @@SHOP@@
        </div>
        <ul class="legend" aria-label="Pickups">
          <li><i class="swatch food"></i>FOOD <b>+1</b></li>
          <li><i class="swatch lucky"></i>LUCKY <b>+1 PT</b></li>
        </ul>
      </section>

      <section class="controls" aria-label="Game controls">
        <p><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd><kbd>←</kbd> direction · <kbd>P</kbd> pause · <kbd>R</kbd> new game · <kbd>S</kbd> shop · <kbd>M</kbd> sound · <kbd>C</kbd> colors. Swipe works too.</p>
        <div class="control-actions">
          <button id="mute" type="button" class="ghost" aria-label="Sound" aria-pressed="true">♪ ON</button>
          <button id="pause" type="button">PAUSE</button>
          <button id="shop-toggle" type="button" disabled>SHOP</button>
          <button id="restart" type="button">NEW GAME</button>
        </div>
      </section>
      <nav class="touch-controls" aria-label="Touch controls">
        <button data-direction="up" type="button" aria-label="Up">↑</button>
        <button data-direction="left" type="button" aria-label="Left">←</button>
        <button data-direction="down" type="button" aria-label="Down">↓</button>
        <button data-direction="right" type="button" aria-label="Right">→</button>
      </nav>
    </main>
    <dialog id="records-dialog" class="records" aria-labelledby="records-title">
      <form method="dialog">
        <h2 id="records-title">★ HALL OF FAME</h2>
        <ol id="records-list" class="records-list"></ol>
        <p id="records-empty" class="records-empty">NO SCORES YET — GO SET ONE.</p>
        <dl class="stats">
          <div><dt>GAMES</dt><dd id="stat-games">0</dd></div>
          <div><dt>FOOD EATEN</dt><dd id="stat-food">0</dd></div>
          <div><dt>LONGEST SNAKE</dt><dd id="stat-length">0</dd></div>
          <div><dt>BEST COMBO</dt><dd id="stat-combo">—</dd></div>
        </dl>
        <button type="submit" class="overlay-button">CLOSE</button>
      </form>
    </dialog>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
'''
page = page.replace("@@HUD@@", hud).replace("@@SHOP@@", shop)
pathlib.Path("index.html").write_text(page, encoding="utf-8")
PY
git show modern-graphics-src:src/styles.css > src/styles.css
cat >> src/styles.css <<'CSS'

/* =========================================================================
   Team features on top of the neon theme: run HUD, perk shop, advisor, Strategist
   ========================================================================= */
.progression-hud { display: grid; gap: 8px; margin-bottom: 14px; }
.progression-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.progression-row > div { min-width: 0; padding: 8px 10px; border: 1px solid var(--panel-border); border-radius: 12px; background: var(--panel); backdrop-filter: blur(10px); }
.progression-hud span:first-child { display: block; color: var(--muted); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.1em; }
.progression-hud strong { display: block; margin-top: 4px; color: var(--mint-soft); font-size: 0.95rem; }
.progression-hud .perk-meter strong { display: inline-block; margin-right: 6px; }
.perk-cubes { display: inline-flex; gap: 4px; vertical-align: middle; }
.perk-cube { display: inline-block; width: 9px; height: 9px; border: 1px solid var(--mint); border-radius: 2px; background: transparent; opacity: 0.55; }
.perk-cube.filled { background: var(--mint); opacity: 1; box-shadow: 0 0 8px rgba(46, 230, 160, 0.55); }

#server-connection[data-connection="online"] { color: var(--mint); }
#server-connection[data-connection="offline"] { color: var(--pink); }
#server-connection[data-connection="connecting"], #server-connection[data-connection="reconnecting"] { color: var(--gold); }
#status[data-state="offline"] { color: var(--pink); border-color: rgba(255, 77, 109, 0.4); }

.perk-shop { position: absolute; inset: clamp(7px, 2vw, 16px); z-index: 8; display: grid; align-content: start; gap: 9px; overflow-y: auto; padding: clamp(9px, 2vw, 14px); border: 2px solid var(--gold); border-radius: 14px; background: rgba(12, 10, 38, 0.96); box-shadow: 0 6px 30px rgba(0, 0, 0, 0.6); }
.perk-shop[hidden] { display: none; }
.shop-heading, .shop-perk { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shop-points, .shop-perk p, .shop-message { margin: 0; color: var(--muted); font-size: 0.65rem; line-height: 1.5; letter-spacing: 0.06em; }
.shop-points strong, .shop-perk strong { color: var(--gold); }
.shop-kicker { margin: 0 0 5px; color: var(--gold); font-size: 0.66rem; font-weight: 800; letter-spacing: 0.13em; }
.shop-heading button, .shop-perk button, .advisor-panel button { flex: 0 0 auto; border: 0; border-radius: 10px; padding: 9px 12px; color: #2a1a00; background: linear-gradient(135deg, #ffe08a, var(--gold)); font-weight: 800; font-size: 0.68rem; letter-spacing: 0.06em; }
.shop-heading button:hover, .shop-perk button:hover:not(:disabled), .advisor-panel button:hover:not(:disabled) { filter: brightness(1.12); }
.shop-perk button:disabled, .advisor-panel button:disabled { cursor: not-allowed; opacity: 0.4; }
.shop-perks { display: grid; gap: 8px; }
.shop-perk { padding: 10px; border: 1px solid var(--panel-border); border-radius: 12px; background: rgba(255, 255, 255, 0.04); }
.shop-perk h2 { margin: 0 0 4px; color: var(--mint-soft); font-size: 0.76rem; letter-spacing: 0.08em; }
.shop-perk .perk-cubes { margin-top: 6px; }
.shop-message { min-height: 1em; margin-top: 8px; color: var(--gold); }
.advisor-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid var(--panel-border); border-radius: 12px; background: rgba(255, 255, 255, 0.04); }
.advisor-output { max-width: 360px; margin: 0; color: var(--muted); font-size: 0.68rem; line-height: 1.55; letter-spacing: 0.04em; }
.agent-output { white-space: pre-line; }

.swatch.lucky { background: radial-gradient(circle at 35% 35%, #ffe9c2, #ff9f1c 55%, #a85a00); }
[data-palette="colorblind"] .swatch.lucky { border-radius: 2px; background: #f0a000; transform: rotate(45deg) scale(0.8); }

@media (max-width: 480px) {
  .progression-row > div { padding: 7px; }
  .shop-perk, .advisor-panel { align-items: stretch; flex-direction: column; }
  .shop-perk button, .advisor-panel button { width: 100%; }
}
CSS
node --test tests/pageMarkup.test.ts
```

Expected: the markup tests PASS (3 tests).

- [ ] **Step 4: Production build and full suite**

Run: `npm run build && npm test`
Expected: build succeeds; the full suite is green.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css tests/pageMarkup.test.ts
git commit -m "Merge the neon page with the team HUD, shop and AI panels"
```

---

### Task 7: Canvas client orchestration and browser checks

**Files:**
- Modify: `src/api/gameClient.ts`, `scripts/e2e/shopAdvisor.e2e.ts`
- Rewrite: `src/main.ts`

**Interfaces:**
- Consumes: Tasks 1-6 (`createSnapshotAdapter`, `createRenderer`, `createSoundPlayer`, `createInputBuffer`, `createCountdown`, `swipeDirection`, records/settings/difficulty modules, the new page ids).
- Produces: `gameClient.create(config?: GameConfig)` posting `{ config }` when given; the full Canvas client.
- Behaviour rules fixed here: the countdown runs before the first move and before every resume (pause button/key, shop close); the status chip reads `GET READY` while it runs; pressing an arrow during the countdown only updates the pending start heading; P, R, S or focus loss cancel it; difficulty can change only when the game is `ready`, `game_over` or `won`.

- [ ] **Step 1: Write the failing browser checks first**

Run `npx playwright install chromium` once if Chromium is missing. Then add the checks before the provider-off section of `scripts/e2e/shopAdvisor.e2e.ts`:

```bash
python3 -I - <<'PY'
import pathlib
p = pathlib.Path("scripts/e2e/shopAdvisor.e2e.ts"); t = p.read_text(encoding="utf-8")
old = '    await stop(api);\n    api = await startApi(apiPort, { FAKE_PROVIDER: "off" });'
assert t.count(old) == 1, t.count(old)
checks = r'''    await check("C1", "The Canvas board draws and the page has no console errors", async () => {
      const errors: string[] = [];
      const onError = (error: Error) => errors.push(error.message);
      page.on("pageerror", onError);
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.waitForTimeout(500);
      const drawn = await page.evaluate(() => {
        const canvas = document.querySelector("#board") as HTMLCanvasElement | null;
        if (!canvas || canvas.tagName !== "CANVAS") return false;
        const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!data) return false;
        let lit = 0;
        for (let index = 0; index < data.length; index += 4 * 97) if (data[index] + data[index + 1] + data[index + 2] > 40) lit += 1;
        return lit > 20;
      });
      page.off("pageerror", onError);
      assert.equal(drawn, true);
      assert.deepEqual(errors, []);
    });

    await check("C2", "An arrow starts a 3-2-1 countdown, then the game runs", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => document.querySelector("#countdown")?.textContent === "3");
      assert.equal(await text(page, "#status"), "GET READY");
      await page.waitForFunction(() => document.querySelector("#status")?.textContent === "PLAYING", undefined, { timeout: 5000 });
    });

    await check("C3", "M and C toggle sound and colors and the choice survives a reload", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.keyboard.press("c");
      assert.equal(await page.evaluate(() => document.body.dataset.palette), "colorblind");
      await page.keyboard.press("m");
      assert.equal(await page.getAttribute("#mute", "aria-pressed"), "false");
      await page.reload();
      await page.waitForSelector('#server-connection[data-connection="online"]');
      assert.equal(await page.evaluate(() => document.body.dataset.palette), "colorblind");
      assert.equal(await page.getAttribute("#mute", "aria-pressed"), "false");
      await page.keyboard.press("c");
      await page.keyboard.press("m");
    });

    await check("C4", "The records dialog opens and closes", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      await page.click("#records-open");
      await page.waitForSelector("#records-dialog[open]");
      assert.match(await text(page, "#records-empty"), /NO SCORES YET/);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#records-dialog")?.hasAttribute("open"));
    });

    await check("C5", "Difficulty starts a new game with the speed preset and is remembered", async () => {
      await page.goto(webUrl);
      await page.waitForSelector('#server-connection[data-connection="online"]');
      const created = page.waitForRequest((request) => request.url().endsWith("/api/games") && request.method() === "POST");
      await page.click('[data-difficulty="hard"]');
      assert.equal((await created).postDataJSON().config.startingSpeedMs, 125);
      await page.waitForFunction(() => document.querySelector('[data-difficulty="hard"]')?.getAttribute("aria-pressed") === "true");
      await page.reload();
      await page.waitForSelector('#server-connection[data-connection="online"]');
      assert.equal(await page.getAttribute('[data-difficulty="hard"]', "aria-pressed"), "true");
      await page.click('[data-difficulty="normal"]');
    });

'''
p.write_text(t.replace(old, checks + old), encoding="utf-8")
PY
npm run test:e2e 2>&1 | tail -12
```

Expected: FAIL (the old `main.ts` cannot drive the new page: the first `M` check times out waiting for the shop, or `C1` reports console errors). This is the red state.

- [ ] **Step 2: Let the client create a game with a config** — edit `src/api/gameClient.ts` with a checked script:

```bash
python3 -I - <<'PY'
import pathlib
p = pathlib.Path("src/api/gameClient.ts"); t = p.read_text(encoding="utf-8")
def sub(old, new):
    global t
    assert t.count(old) == 1, (old[:50], t.count(old))
    t = t.replace(old, new)
sub('import type { Direction } from "../game/snakeEngine.ts";', 'import type { GameConfig } from "../game/snakeConfig.ts";\nimport type { Direction } from "../game/snakeEngine.ts";')
sub('  create: () => request("/api/games", "POST", {}),', '  create: (config?: GameConfig) => request("/api/games", "POST", config ? { config } : {}),')
p.write_text(t, encoding="utf-8")
PY
```

- [ ] **Step 3: Rewrite `src/main.ts`** (replace the whole file with the content below)

```ts
import "./styles.css";
import { gameClient, GameApiError, connectGameEvents } from "./api/gameClient.ts";
import { getTickMs } from "./game/snakeConfig.ts";
import { validateGameSnapshot, type GameSnapshot } from "./game/gameProtocol.ts";
import { isOpposite, type Direction } from "./game/snakeEngine.ts";
import { createRenderer, type Renderer } from "./rendering/canvasRenderer.ts";
import { createSnapshotAdapter, type RenderEvent } from "./rendering/snapshotAdapter.ts";
import { createSoundPlayer } from "./audio/sound.ts";
import { DIFFICULTY_CONFIGS, isDifficulty, type Difficulty } from "./ui/difficulty.ts";
import { addEntry, loadRecords, qualifies, recordGame, sanitizeName, saveRecords, type Records } from "./ui/records.ts";
import { SETTING_KEYS, bestKey, readBest, readSetting, writeSetting } from "./ui/settings.ts";
import { createInputBuffer } from "./ui/inputBuffer.ts";
import { createCountdown } from "./ui/countdown.ts";
import { swipeDirection } from "./ui/swipe.ts";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Snake UI nije kompletno inicijalizovan: #${id}`);
  return element as T;
}

const gameBoard = byId<HTMLCanvasElement>("board");
const boardFrameElement = document.querySelector<HTMLElement>(".board-frame");
if (!boardFrameElement) throw new Error("Snake UI nije kompletno inicijalizovan: .board-frame");
const boardFrame: HTMLElement = boardFrameElement;
const score = byId("score");
const bestScore = byId("best-score");
const status = byId("status");
const pace = byId("pace");
const connection = byId("server-connection");
const pause = byId<HTMLButtonElement>("pause");
const restartButton = byId<HTMLButtonElement>("restart");
const gameOverlay = byId("game-overlay");
const gameOverlayTitle = byId("overlay-title");
const gameOverlayMessage = byId("overlay-message");
const gameOverlayActionButton = byId<HTMLButtonElement>("overlay-action");
const countdownElement = byId("countdown");
const nameForm = byId<HTMLFormElement>("name-form");
const nameInput = byId<HTMLInputElement>("name-input");
const nameRank = byId("name-rank");
const askAdvice = byId<HTMLButtonElement>("shop-advice-button");
const adviceMessage = byId("shop-advice-output");
const askAgent = byId<HTMLButtonElement>("shop-agent-button");
const agentMessage = byId("shop-agent-output");
const runXpValue = byId("xp-value");
const runLevelValue = byId("level-value");
const runPerkPointsValue = byId("perk-points-value");
const runExtraXpValue = byId("extra-xp-value");
const runLuckValue = byId("luck-value");
const runLifeValue = byId("life-value");
const runExtraXpCubes = byId("extra-xp-cubes");
const runLuckCubes = byId("luck-cubes");
const runLifeCubes = byId("life-cubes");
const toggleShopButton = byId<HTMLButtonElement>("shop-toggle");
const shopPanel = byId("perk-shop");
const shopXpNumeric = byId("shop-xp");
const shopLevelNumeric = byId("shop-level");
const availableShopPoints = byId("shop-points");
const shopXpValue = byId("shop-extra-xp-value");
const shopLuckyValue = byId("shop-luck-value");
const shopChargesValue = byId("shop-life-value");
const shopXpCubes = byId("shop-extra-xp-cubes");
const shopLuckyCubes = byId("shop-luck-cubes");
const shopChargesCubes = byId("shop-life-cubes");
const purchaseExtraXpButton = byId<HTMLButtonElement>("buy-extra-xp");
const purchaseExtraLifeButton = byId<HTMLButtonElement>("buy-extra-life");
const purchaseLuckButton = byId<HTMLButtonElement>("buy-luck");
const closeShopButton = byId<HTMLButtonElement>("shop-close");
const shopStatusMessage = byId("shop-message");
const muteButton = byId<HTMLButtonElement>("mute");
const colorblindButton = byId<HTMLButtonElement>("colorblind");
const recordsButton = byId<HTMLButtonElement>("records-open");
const recordsDialog = byId<HTMLDialogElement>("records-dialog");
const recordsList = byId("records-list");
const recordsEmpty = byId("records-empty");
const statGames = byId("stat-games");
const statFood = byId("stat-food");
const statLength = byId("stat-length");
const statCombo = byId("stat-combo");
const difficultyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-difficulty]")];

const COUNT_MS = 550;
const SWIPE_MIN_PX = 24;
const ADVICE_IDLE = "ASK WHETHER TO BUY A PERK OR WAIT.";
const AGENT_IDLE = "PLAN YOUR NEXT PERK PURCHASES WITH AI.";

const adapter = createSnapshotAdapter();
const sound = createSoundPlayer();
let renderer: Renderer | null = null;
let game: GameSnapshot | null = null;
let displayedScore = 0;
let best = 0;
const savedDifficulty = readSetting(SETTING_KEYS.difficulty);
let difficulty: Difficulty = isDifficulty(savedDifficulty) ? savedDifficulty : "normal";
let colorblind = readSetting(SETTING_KEYS.colorblind) === "1";
let records: Records = loadRecords();
let gameFood = 0;
let pendingRecord: { score: number } | null = null;
let startDirection: Direction | null = null;
let disconnectEvents: (() => void) | undefined;
let shopVisible = false;
let adviceAbort: AbortController | null = null;
let agentAbort: AbortController | null = null;

function clearAdvice(message = ADVICE_IDLE): void {
  adviceAbort?.abort();
  adviceAbort = null;
  adviceMessage.textContent = message;
  agentAbort?.abort();
  agentAbort = null;
  agentMessage.textContent = AGENT_IDLE;
}

function haptic(pattern: number | number[]): void {
  if (!sound.isMuted() && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}

function replayAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function renderCubes(element: HTMLElement, filled: number, total: number): void {
  element.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const cube = document.createElement("span");
    cube.className = index < filled ? "perk-cube filled" : "perk-cube";
    element.append(cube);
  }
}

const countdown = createCountdown({
  stepMs: COUNT_MS,
  onLabel: (label) => {
    countdownElement.hidden = false;
    countdownElement.textContent = label;
    countdownElement.dataset.go = String(label === "GO!");
    replayAnimation(countdownElement, "count-pop");
    sound.play(label === "GO!" ? "go" : "count");
    haptic(label === "GO!" ? 40 : 15);
  },
  onHide: () => { countdownElement.hidden = true; },
});

function cancelCountdown(): void {
  startDirection = null;
  countdown.cancel();
  if (game) render(game);
}

function runCountdown(onDone: () => void): void {
  countdown.start(() => {
    onDone();
    if (game) render(game);
  });
  if (game) render(game);
}

function sendMove(direction: Direction): void {
  if (game) void runAction(() => gameClient.move(game!.id, direction));
}
const inputs = createInputBuffer(sendMove);

function handleEvents(events: RenderEvent[], next: GameSnapshot, before: GameSnapshot | null): void {
  for (const event of events) {
    if (event.kind === "ate") {
      gameFood += 1;
      sound.play("eat");
      haptic(12);
    } else if (event.kind === "lucky") {
      sound.play("gold");
      haptic([12, 30, 12]);
    } else if (event.kind === "levelUp") {
      sound.play("speedup");
      renderer?.banner("LEVEL UP!", "#2ee6a0");
    } else if (event.kind === "purchase") {
      sound.play("gem");
    } else if (event.kind === "died") {
      sound.play("death");
      haptic([60, 40, 120]);
      finishGame(next);
    } else if (event.kind === "won") {
      sound.play("record");
      finishGame(next);
    }
  }
  const from = before?.state.status;
  const to = next.state.status;
  if (from === "ready" && to === "playing") sound.play("start");
  else if (from === "playing" && to === "paused") sound.play("pause");
  else if (from === "paused" && to === "playing") sound.play("resume");
}

function finishGame(final: GameSnapshot): void {
  const finalScore = final.players[0].score;
  records = recordGame(records, { food: gameFood, length: final.players[0].snake.length, combo: 0 });
  saveRecords(records);
  if (qualifies(records, finalScore)) {
    pendingRecord = { score: finalScore };
    const rank = records.top.filter((entry) => entry.score >= finalScore).length + 1;
    nameRank.textContent = `NEW HIGH SCORE — #${rank}`;
    nameForm.hidden = false;
    nameInput.value = "";
    window.setTimeout(() => nameInput.focus(), 350);
    window.setTimeout(() => sound.play("record"), 600);
  }
}

function applySnapshot(value: unknown): void {
  const next = validateGameSnapshot(value);
  if (!next || (game && next.id !== game.id) || (game && next.revision < game.revision)) return;
  if (game && (next.revision !== game.revision || next.state.status !== "paused")) clearAdvice();
  if (!renderer) {
    renderer = createRenderer(gameBoard, { gridSize: next.config.gridSize, maxComboMultiplier: 4 });
    renderer.setColorblind(colorblind);
  }
  const adapted = adapter.adapt(next);
  renderer.update(adapted.state, adapted.moved, getTickMs(next.config, next.players[0].score));
  if (adapted.moved) inputs.tick();
  if (next.state.status !== "playing") inputs.reset();
  const before = game;
  game = next;
  handleEvents(adapted.events, next, before);
  render(next);
}

function render(next: GameSnapshot): void {
  const player = next.players[0];
  const { progression, perks } = player;
  const { config } = next;
  const state = { status: next.state.status, score: player.score };
  const counting = countdown.isRunning();

  if (state.score !== displayedScore) {
    if (state.score > displayedScore) replayAnimation(score, "score-bump");
    displayedScore = state.score;
  }
  score.textContent = String(state.score);
  if (state.score > best) {
    best = state.score;
    writeSetting(bestKey(difficulty), String(best));
    replayAnimation(bestScore, "best-bump");
  }
  bestScore.textContent = String(best);

  const tickMs = getTickMs(config, state.score);
  pace.textContent = `${(config.startingSpeedMs / tickMs).toFixed(1)}×`;
  const statusText = counting ? "GET READY"
    : next.configError && state.status === "playing" ? "CONFIG FALLBACK"
      : state.status === "game_over" ? "GAME OVER"
        : state.status === "won" ? "BOARD CLEAR"
          : state.status === "paused" ? "PAUSED"
            : state.status === "ready" ? "READY" : "PLAYING";
  status.textContent = statusText;
  status.dataset.state = counting ? "ready" : state.status;

  runXpValue.textContent = String(progression.xp);
  runLevelValue.textContent = String(progression.level);
  runPerkPointsValue.textContent = String(progression.perkPoints);
  runExtraXpValue.textContent = `${perks.extraXp.level} / 5`;
  runLuckValue.textContent = `${perks.luck.level} / 5`;
  runLifeValue.textContent = `${perks.extraLife.charges} / 2`;
  renderCubes(runExtraXpCubes, perks.extraXp.level, 5);
  renderCubes(runLuckCubes, perks.luck.level, 5);
  renderCubes(runLifeCubes, perks.extraLife.charges, 2);
  availableShopPoints.textContent = String(progression.perkPoints);
  shopXpNumeric.textContent = String(progression.xp);
  shopLevelNumeric.textContent = String(progression.level);
  shopXpValue.textContent = `${perks.extraXp.level} / 5`;
  shopLuckyValue.textContent = `${perks.luck.level} / 5`;
  shopChargesValue.textContent = `${perks.extraLife.charges} / 2`;
  renderCubes(shopXpCubes, perks.extraXp.level, 5);
  renderCubes(shopLuckyCubes, perks.luck.level, 5);
  renderCubes(shopChargesCubes, perks.extraLife.charges, 2);
  const isPaused = state.status === "paused";
  const extraXpCost = perks.extraXp.nextCost;
  const extraLifeCost = perks.extraLife.nextCost;
  const luckCost = perks.luck.nextCost;
  purchaseExtraXpButton.textContent = extraXpCost === null ? "MAX LEVEL" : `BUY · ${extraXpCost} PT`;
  purchaseExtraLifeButton.textContent = extraLifeCost === null ? "MAX CHARGES" : `BUY · ${extraLifeCost} PT`;
  purchaseLuckButton.textContent = luckCost === null ? "MAX LEVEL" : `BUY · ${luckCost} PT`;
  purchaseExtraXpButton.disabled = !isPaused || extraXpCost === null || progression.perkPoints < extraXpCost;
  purchaseExtraLifeButton.disabled = !isPaused || extraLifeCost === null || progression.perkPoints < extraLifeCost;
  purchaseLuckButton.disabled = !isPaused || luckCost === null || progression.perkPoints < luckCost;
  toggleShopButton.disabled = state.status !== "playing" && state.status !== "paused";
  toggleShopButton.textContent = isPaused && shopVisible ? "CLOSE SHOP" : "SHOP";
  shopPanel.hidden = !isPaused || !shopVisible;

  gameOverlay.hidden = state.status === "playing" || (isPaused && shopVisible) || counting;
  gameOverlay.dataset.state = state.status;
  gameOverlayActionButton.hidden = state.status === "ready";
  pause.textContent = state.status === "paused" ? "RESUME" : "PAUSE";
  pause.disabled = state.status === "ready" || state.status === "game_over" || state.status === "won";
  askAdvice.disabled = state.status !== "paused" || !shopVisible || adviceAbort !== null;
  askAgent.disabled = state.status !== "paused" || !shopVisible || agentAbort !== null;
  const locked = state.status === "playing" || state.status === "paused" || counting;
  difficultyButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
    button.disabled = locked;
  });

  if (state.status === "ready") {
    gameOverlayTitle.textContent = "READY?";
    gameOverlayMessage.textContent = "PRESS AN ARROW KEY OR TAP A DIRECTION TO START";
  } else if (state.status === "paused") {
    gameOverlayTitle.textContent = "PAUSED";
    gameOverlayMessage.textContent = "PRESS P, SPACE OR RESUME TO CONTINUE";
    gameOverlayActionButton.textContent = "RESUME";
  } else if (state.status === "game_over") {
    gameOverlayTitle.textContent = "GAME OVER";
    gameOverlayMessage.textContent = `FINAL SCORE: ${state.score} // PRESS R TO RESTART`;
    gameOverlayActionButton.textContent = "PLAY AGAIN";
  } else if (state.status === "won") {
    gameOverlayTitle.textContent = "BOARD CLEAR";
    gameOverlayMessage.textContent = `FINAL SCORE: ${state.score} // PERFECT RUN`;
    gameOverlayActionButton.textContent = "NEW GAME";
  }
  if (state.status !== "game_over" && state.status !== "won") {
    nameForm.hidden = true;
    pendingRecord = null;
  }
}

function reportError(error: unknown): void {
  const message = error instanceof GameApiError ? error.message : "GAME SERVER REQUEST FAILED.";
  connection.textContent = "SERVER OFFLINE";
  connection.dataset.connection = "offline";
  status.textContent = "SERVER OFFLINE";
  status.dataset.state = "offline";
  if (!game) {
    gameOverlay.hidden = false;
    gameOverlayTitle.textContent = "SERVER UNAVAILABLE";
    gameOverlayMessage.textContent = `${message} START THE SERVER AND RELOAD.`;
    gameOverlayActionButton.hidden = true;
  }
}

async function runAction(action: () => Promise<GameSnapshot>): Promise<boolean> {
  try {
    applySnapshot(await action());
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

async function restart(): Promise<void> {
  if (!game) {
    await initializeGame();
    return;
  }
  cancelCountdown();
  inputs.reset();
  displayedScore = 0;
  gameFood = 0;
  shopVisible = false;
  clearAdvice();
  await runAction(() => gameClient.restart(game!.id));
}

function handleDirection(direction: Direction): void {
  if (!game) return;
  const current = game.state.status;
  if (current === "ready") {
    if (isOpposite(direction, game.players[0].direction)) return;
    startDirection = direction;
    if (!countdown.isRunning()) {
      runCountdown(() => {
        const heading = startDirection;
        startDirection = null;
        if (heading && game?.state.status === "ready") sendMove(heading);
      });
    }
    return;
  }
  if (current === "playing" && !countdown.isRunning()) inputs.press(direction, game.players[0].direction);
}

function resumeWithCountdown(): void {
  clearAdvice();
  shopVisible = false;
  if (game) render(game);
  runCountdown(() => {
    if (game?.state.status === "paused") void runAction(() => gameClient.resume(game!.id));
  });
}

async function togglePause(): Promise<void> {
  if (!game) return;
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game.state.status === "playing") {
    shopVisible = false;
    clearAdvice();
    inputs.reset();
    await runAction(() => gameClient.pause(game!.id));
  } else if (game.state.status === "paused") {
    resumeWithCountdown();
  }
}

async function toggleShop(): Promise<void> {
  if (!game) return;
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game.state.status === "playing") {
    inputs.reset();
    if (await runAction(() => gameClient.pause(game!.id))) {
      shopVisible = true;
      clearAdvice();
      if (game) render(game);
    }
  } else if (game.state.status === "paused") {
    if (shopVisible) {
      resumeWithCountdown();
    } else {
      shopVisible = true;
      clearAdvice();
      render(game);
    }
  }
}

async function purchasePerk(perk: "extra_xp" | "extra_life" | "luck"): Promise<void> {
  if (!game || game.state.status !== "paused") return;
  clearAdvice();
  shopStatusMessage.textContent = "";
  try {
    applySnapshot(await gameClient.purchasePerk(game.id, perk));
    shopStatusMessage.textContent = "PURCHASE APPLIED.";
  } catch (error) {
    shopStatusMessage.textContent = error instanceof GameApiError ? error.message : "PURCHASE FAILED.";
  }
}

async function setDifficulty(next: Difficulty): Promise<void> {
  const current = game?.state.status;
  if (!game || countdown.isRunning() || (current !== "ready" && current !== "game_over" && current !== "won")) return;
  difficulty = next;
  writeSetting(SETTING_KEYS.difficulty, next);
  await initializeGame();
}

function toggleMute(): void {
  const muted = sound.toggleMuted();
  muteButton.textContent = muted ? "♪ OFF" : "♪ ON";
  muteButton.setAttribute("aria-pressed", String(!muted));
}

function applyColorblind(): void {
  renderer?.setColorblind(colorblind);
  document.body.dataset.palette = colorblind ? "colorblind" : "normal";
  colorblindButton.setAttribute("aria-pressed", String(colorblind));
  colorblindButton.textContent = colorblind ? "◐ COLORBLIND ON" : "◐ COLORBLIND";
}

function toggleColorblind(): void {
  colorblind = !colorblind;
  writeSetting(SETTING_KEYS.colorblind, colorblind ? "1" : "0");
  applyColorblind();
}

function renderRecords(highlight = -1): void {
  recordsList.replaceChildren();
  recordsEmpty.hidden = records.top.length > 0;
  records.top.forEach((entry, index) => {
    const row = document.createElement("li");
    if (index === highlight) row.className = "highlight";
    const rank = document.createElement("span");
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const level = document.createElement("em");
    level.textContent = entry.difficulty.toUpperCase();
    const points = document.createElement("b");
    points.textContent = String(entry.score);
    row.append(rank, name, level, points);
    recordsList.append(row);
  });
  statGames.textContent = String(records.stats.games);
  statFood.textContent = String(records.stats.totalFood);
  statLength.textContent = String(records.stats.longestSnake);
  statCombo.textContent = records.stats.bestCombo > 0 ? `×${records.stats.bestCombo}` : "—";
}

function openRecords(highlight = -1): void {
  if (game?.state.status === "playing") void togglePause();
  renderRecords(highlight);
  if (!recordsDialog.open) recordsDialog.showModal();
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingRecord) return;
  const entry = { name: sanitizeName(nameInput.value), score: pendingRecord.score, difficulty, date: new Date().toISOString().slice(0, 10) };
  const result = addEntry(records, entry);
  records = result.records;
  saveRecords(records);
  pendingRecord = null;
  nameForm.hidden = true;
  nameInput.blur();
  openRecords(result.rank);
});
nameInput.addEventListener("input", () => {
  nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
});

const keyDirections: Record<string, Direction> = {
  arrowup: "up",
  arrowright: "right",
  arrowdown: "down",
  arrowleft: "left",
};

window.addEventListener("keydown", (event) => {
  if (event.repeat || recordsDialog.open || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (key === "r") {
    event.preventDefault();
    void restart();
  } else if (key === "p" || event.code === "Space") {
    event.preventDefault();
    void togglePause();
  } else if (key === "s") {
    event.preventDefault();
    void toggleShop();
  } else if (key === "m") {
    event.preventDefault();
    toggleMute();
  } else if (key === "c") {
    event.preventDefault();
    toggleColorblind();
  } else if (keyDirections[key]) {
    event.preventDefault();
    handleDirection(keyDirections[key]);
  }
});

restartButton.addEventListener("click", () => { void restart(); });
pause.addEventListener("click", () => { void togglePause(); });
toggleShopButton.addEventListener("click", () => { void toggleShop(); });
closeShopButton.addEventListener("click", () => { void togglePause(); });
purchaseExtraXpButton.addEventListener("click", () => { void purchasePerk("extra_xp"); });
purchaseExtraLifeButton.addEventListener("click", () => { void purchasePerk("extra_life"); });
purchaseLuckButton.addEventListener("click", () => { void purchasePerk("luck"); });
muteButton.addEventListener("click", toggleMute);
colorblindButton.addEventListener("click", toggleColorblind);
recordsButton.addEventListener("click", () => openRecords());
recordsDialog.addEventListener("click", (event) => { if (event.target === recordsDialog) recordsDialog.close(); });
difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const next = button.dataset.difficulty;
    if (isDifficulty(next)) void setDifficulty(next);
  });
});
gameOverlayActionButton.addEventListener("click", () => {
  if (game?.state.status === "paused") void togglePause();
  else void restart();
});

askAdvice.addEventListener("click", async () => {
  if (!game || game.state.status !== "paused" || !shopVisible || adviceAbort) return;
  const gameId = game.id;
  const revision = game.revision;
  const controller = new AbortController();
  adviceAbort = controller;
  askAdvice.disabled = true;
  adviceMessage.textContent = "CHECKING YOUR CURRENT SHOP OPTIONS…";
  try {
    const result = await gameClient.shopAdvice(gameId, controller.signal);
    if (controller.signal.aborted || !game || game.id !== gameId || game.revision !== revision || !shopVisible
      || game.state.status !== "paused" || result.revision !== revision) return;
    adviceMessage.textContent = result.status === "advice"
      ? `${result.message} · ${result.model === "gemini-3.8-flash" ? "GEMINI FLASH" : result.model === "gemini-3.5-flash-lite" ? "GEMINI FLASH-LITE" : "GEMMA 4"}`
      : result.message;
  } catch {
    if (!controller.signal.aborted && game?.id === gameId && game.revision === revision && shopVisible) {
      adviceMessage.textContent = "SHOP ADVICE IS UNAVAILABLE. NO PURCHASE WAS MADE.";
    }
  } finally {
    if (adviceAbort === controller) {
      adviceAbort = null;
      if (game) render(game);
    }
  }
});

askAgent.addEventListener("click", async () => {
  if (!game || game.state.status !== "paused" || !shopVisible || agentAbort) return;
  const gameId = game.id;
  const revision = game.revision;
  const controller = new AbortController();
  agentAbort = controller;
  askAgent.disabled = true;
  agentMessage.textContent = "AI ANALYSIS IN PROGRESS…";
  try {
    const run = await gameClient.shopAgent(gameId, controller.signal);
    if (controller.signal.aborted || !game || game.id !== gameId || game.revision !== revision || !shopVisible
      || game.state.status !== "paused" || run.revision !== revision) return;
    agentMessage.textContent = run.status === "completed"
      ? [run.message, run.result.summary, ...run.result.evidence.map((item) => `· ${item.finding}`)].join("\n")
      : run.message;
  } catch {
    if (!controller.signal.aborted && game?.id === gameId && game.revision === revision && shopVisible) {
      agentMessage.textContent = "SHOP STRATEGIST IS UNAVAILABLE. NO PURCHASE WAS MADE.";
    }
  } finally {
    if (agentAbort === controller) {
      agentAbort = null;
      if (game) render(game);
    }
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.direction;
    if (direction === "up" || direction === "right" || direction === "down" || direction === "left") handleDirection(direction);
  });
});

function pauseOnFocusLoss(): void {
  if (countdown.isRunning()) {
    cancelCountdown();
    return;
  }
  if (game?.state.status === "playing") void togglePause();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseOnFocusLoss(); });
window.addEventListener("blur", pauseOnFocusLoss);

let swipeStart: { x: number; y: number } | null = null;
boardFrame.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") swipeStart = { x: event.clientX, y: event.clientY };
});
boardFrame.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const direction = swipeDirection(event.clientX - swipeStart.x, event.clientY - swipeStart.y, SWIPE_MIN_PX);
  swipeStart = null;
  if (direction) handleDirection(direction);
});
boardFrame.addEventListener("pointercancel", () => { swipeStart = null; });

async function initializeGame(): Promise<void> {
  disconnectEvents?.();
  disconnectEvents = undefined;
  game = null;
  adapter.reset();
  inputs.reset();
  startDirection = null;
  countdown.cancel();
  displayedScore = 0;
  gameFood = 0;
  pendingRecord = null;
  nameForm.hidden = true;
  shopVisible = false;
  clearAdvice();
  best = readBest(difficulty);
  connection.textContent = "CONNECTING";
  connection.dataset.connection = "connecting";
  try {
    const initial = await gameClient.create(DIFFICULTY_CONFIGS[difficulty]);
    applySnapshot(initial);
    disconnectEvents = connectGameEvents(initial.id, applySnapshot, (connected) => {
      connection.textContent = connected ? "SERVER ONLINE" : "RECONNECTING";
      connection.dataset.connection = connected ? "online" : "reconnecting";
    });
    const fresh = await gameClient.get(initial.id);
    applySnapshot(fresh);
  } catch (error) {
    reportError(error);
  }
}

window.addEventListener("beforeunload", () => disconnectEvents?.());
muteButton.textContent = sound.isMuted() ? "♪ OFF" : "♪ ON";
muteButton.setAttribute("aria-pressed", String(!sound.isMuted()));
applyColorblind();
renderRecords();
void initializeGame();
```

- [ ] **Step 4: Typecheck, unit tests and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck 0, the whole suite green, build succeeds.

- [ ] **Step 5: Run the browser checks**

Run: `npm run test:e2e 2>&1 | tail -20`
Expected: every W04 scenario (M1 to M6 and the others the script already had) and the new C1 to C5 print `PASS`, ending with `... passed, 0 skipped, 0 failed.` If an M scenario fails because it expected the old board or an immediate resume, apply the smallest fix in `src/main.ts` (not in the test), ledger it as a ruling, and rerun. In particular M4 requires the status not to read `PAUSED` after the shop closes, which the `GET READY` chip satisfies.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/api/gameClient.ts scripts/e2e/shopAdvisor.e2e.ts
git commit -m "Drive the game from the Canvas with countdown, sound, records and difficulty"
```

---

### Task 8: Contract, docs, evidence and final verification

**Files:**
- Modify: `AGENTS.md`, `docs/INSTRUCTIONS.md`, `docs/instructions/01-project-architecture.md`, `README.md`, `specs/004-best-game-phase1/spec.md`, `docs/tracking/WORK_LOG.md`, `docs/tracking/AI_USAGE_LOG.md`
- Create: `docs/tracking/evidence/EVIDENCE_015.md`

- [ ] **Step 1: Update the project contract and instructions (checked replacements)**

```bash
python3 -I - <<'PY'
import pathlib
def sub(path, old, new):
    p = pathlib.Path(path); t = p.read_text(encoding="utf-8")
    assert t.count(old) == 1, (path, old[:60], t.count(old))
    p.write_text(t.replace(old, new), encoding="utf-8")

sub("AGENTS.md",
    "- Keep RETRO SNAKE a small, original TypeScript game with a Vite browser client and a TypeScript Node backend: 20 × 20 board, three-segment snake, controls, food, score, collisions, restart, runtime configuration validation, and focused tests.",
    "- Keep RETRO SNAKE an original TypeScript game with a Vite browser client (Canvas 2D renderer, DOM HUD) and a TypeScript Node backend: 20 × 20 board, three-segment snake, controls, food, score, collisions, restart, runtime configuration validation, local records, generated sound, accessibility options, and focused tests. The Canvas renderer only draws server snapshots.")
sub("AGENTS.md",
    "- Do not add third-party assets, music, logos, unrelated frameworks, or broad refactors.",
    "- Do not add third-party assets, audio files, logos, unrelated frameworks, or broad refactors. Sound is synthesized in code.")
sub("docs/instructions/01-project-architecture.md",
    "- Keep DOM/CSS responsible for the board, controls, status, and responsive presentation. Do not move game rules into event handlers or rendering code.",
    "- Keep the Canvas renderer and DOM/CSS responsible for the board, controls, status, and responsive presentation; they only read server snapshots. Do not move game rules into event handlers or rendering code.")
sub("docs/INSTRUCTIONS.md",
    "| Server refactor plan | [`specs/REFACTOR_PLAN.md`](specs/REFACTOR_PLAN.md) | Accepted client/server architecture, task checklist, and validation record |",
    "| Best Game Phase 1 | [`../specs/004-best-game-phase1/`](../specs/004-best-game-phase1/) | Canvas visuals and client features on the server-authoritative game |\n| Server refactor plan | [`specs/REFACTOR_PLAN.md`](specs/REFACTOR_PLAN.md) | Accepted client/server architecture, task checklist, and validation record |")
sub("specs/004-best-game-phase1/spec.md",
    "(`ate`, `lucky`, `levelUp`, `died`, `purchase`)", "(`ate`, `lucky`, `levelUp`, `died`, `won`, `purchase`)")
sub("specs/004-best-game-phase1/spec.md",
    "`ate | lucky | levelUp | died | purchase`", "`ate | lucky | levelUp | died | won | purchase`")
sub("specs/004-best-game-phase1/spec.md",
    "client-side only and use the existing API (`move`, `pause`, `resume`, `restart`, `POST /api/games`).",
    "client-side only and use the existing API (`move`, `pause`, `resume`, `restart`, `POST /api/games`). While the countdown runs the status chip reads GET READY. Keyboard: arrows, P/Space pause, R restart, S shop, M sound, C colors; WASD is not mapped because S is the shop key.")
PY
cat >> README.md <<'EOF'

## Canvas izgled i klijentske opcije (Faza 1)

Tabla se crta na Canvasu (neon tema, čestice, tween kretanja) iz server snapshota; server i dalje drži sva pravila. Tasteri: strelice smer · P/Space pauza · R nova igra · S shop · M zvuk · C colorblind režim; swipe radi na telefonu. Pri startu i nastavku igre ide odbrojavanje 3-2-1. Težine EASY/NORMAL/HARD menjaju brzinu i pokreću novu igru. Rekordi (top 10) i statistika čuvaju se lokalno u browseru. Specifikacija: [specs/004-best-game-phase1](specs/004-best-game-phase1/spec.md).
EOF
git diff --check; echo "diffcheck $?"
```

Expected: no assertion error (every replacement matched exactly once) and `git diff --check` prints nothing.

- [ ] **Step 2: Run all gates and keep the real output**

```bash
{ npm run typecheck; echo "typecheck exit $?"; npm test; echo "test exit $?"; npm run build; echo "build exit $?"; npm run security:scan; echo "scan exit $?"; npm run test:e2e; echo "e2e exit $?"; } > /tmp/phase1-gates.txt 2>&1
grep -E "exit [0-9]+$|^ℹ (tests|pass|fail)|passed" /tmp/phase1-gates.txt
git diff --stat main..HEAD -- server src/game/gameProtocol.ts
```

Expected: every `exit` line is 0; the test counts show `fail 0`; the e2e line ends with `0 failed`; the final `git diff --stat` prints nothing (SC-004).

- [ ] **Step 3: Visual and manual check**

Terminal A: `npm run dev:server` (a key is only needed for the AI buttons). Terminal B: `npm run dev`, then open the printed URL. Check and write down what you actually saw:

- the board is a neon Canvas and the snake glides between cells;
- eating food shows particles and `+1`; a Lucky orb is orange and shows `+1 PT`; a level-up shows the `LEVEL UP!` banner;
- the shop opens over the Canvas; closing it runs 3-2-1 and the status chip reads `GET READY`;
- `M`, `C`, a swipe in the browser's device emulation, `EASY`/`HARD` (disabled during play), game over with the name prompt, and the records dialog.

If no human check was done, say so in the evidence; do not write "verified".

- [ ] **Step 4: Evidence and tracking**

Copy `docs/tracking/evidence/EVIDENCE_TEMPLATE.md` to `docs/tracking/evidence/EVIDENCE_015.md` and fill it with the real Step 2 output (commands, exit codes, test counts, the e2e line), the list of new test files and what each covers, the manual check result or `not done`, and the honest limitations: the Canvas renderer cannot be unit-tested (covered by the pixel check and manual look), AI behaviour was not changed or re-tested live, Phase 2 rules are not part of this work, the user's private branch was only read through the local ref `modern-graphics-src`.

Append a dated entry to `docs/tracking/WORK_LOG.md` (goal, files, commands and results, evidence link, rulings, limitations, next step). Then add one row to the AI usage log:

```bash
python3 -I - <<'PY'
import pathlib
p = pathlib.Path("docs/tracking/AI_USAGE_LOG.md"); t = p.read_text(encoding="utf-8")
marker = "\nDo not use this log as a substitute for task evidence."
assert t.count(marker) == 1
row = "| 28 | Merge the private modern-graphics branch into the team game (Phase 1) | [Spec 004](../../specs/004-best-game-phase1/spec.md), [plan](../../specs/004-best-game-phase1/plan.md), user's local branch read through `modern-graphics-src`, team client code. No standalone prompt artifact. | Proposed the phased merge and adapter design, wrote spec, plan, tests and implementation under red/green TDD | Human chose the team game as base, the phased delivery and the client-side countdown/difficulty/input buffer; the private branch was never pushed | See [Evidence 015](evidence/EVIDENCE_015.md) for the verified results and limits |\n"
p.write_text(t.replace(marker, row + marker), encoding="utf-8")
PY
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs README.md specs/004-best-game-phase1
git commit -m "Document Best Game Phase 1 and record its evidence"
```

Do not push or open a PR; the user decides later.

---

## Self-Review

**Spec coverage.** US1 (Canvas play) → Tasks 3, 5, 6, 7; US2 (sound, colorblind, swipe, focus pause, vibration) → Tasks 1, 4, 7; US3 (input buffer, countdown) → Tasks 2, 7; US4 (records, difficulty) → Tasks 1, 4, 7. FR-001 (canvas) → 6, 7; FR-002/003/004 (adapter, `moved`, tween time) → 3, 7; FR-005/006 (Lucky layer, palettes) → 5; FR-007/008 (sound, records) → 4; FR-009/010 (client features, server-side validation of presets) → 1, 2, 7; FR-011 (page and ids) → 6; FR-012/013 (no server/protocol/AI change) → 8 Step 2; FR-014 (contract) → 8. SC-001 → 7 (e2e) and 8 (manual); SC-002 → every task; SC-003 → 7; SC-004 → 8 Step 2; SC-005 → by construction.

**Rulings baked into the plan (recorded for the executor):** the `won` event is added; WASD is not mapped because S is the shop key; the status chip reads `GET READY` during the countdown so the W04 scenario M4 stays valid; the renderer's grid size is fixed when it is created (the client only ever creates 20 × 20 games); difficulty can change only in `ready`, `game_over` or `won`.

**Placeholder scan.** No TBD or "similar to" steps. The two conditional notes (Task 5 typecheck output, Task 7 Step 5 e2e failures) name exactly what to do and require a ledgered ruling.

**Type consistency.** `RenderEvent` kinds (`ate`, `lucky`, `levelUp`, `purchase`, `died`, `won`) are used identically in Tasks 3 and 7. `createInputBuffer(send).press(direction, heading)`, `createCountdown({ stepMs, onLabel, onHide }).start(onDone)`, `createRenderer(canvas, { gridSize, maxComboMultiplier })`, `gameClient.create(config?)` and `DIFFICULTY_CONFIGS` match across the tasks that define and consume them.

**Review Focus mapping.** (1) Task 3 duplicate/older/other-game/extra-life tests; (2) Task 1 settings tests and Task 4 records tests; (3) Task 2 countdown/buffer tests plus Task 7 C2; (4) Task 7 `setDifficulty` guard and C5; (5) Task 7 Step 5 note on M4.
