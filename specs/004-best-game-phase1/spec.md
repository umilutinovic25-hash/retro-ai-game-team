# Feature Specification: Best Game, Phase 1 (Canvas visuals and client features)

**Feature directory**: `004-best-game-phase1` (branch `best-game-phase1`, cut from `main` = `7e92b6f`, which includes W04 and the W05 Shop Strategist)
**Created**: 2026-10-07
**Status**: Draft for review (design approved in chat 2026-10-07; implementation plan not yet written)
**Input**: User request to merge two Retro Snake lines into one best game: the team game (server-authoritative, XP/perk shop, Gemini advisor, Shop Strategist) and the user's private local branch `feature/modern-graphics` (Canvas renderer, sound, records, accessibility, extra rules). Decided: the team game is the base; the merge is delivered in two phases. This spec covers **Phase 1 only**.

Source of ported code (read-only reference, local): git ref `modern-graphics-src` (= `feature/modern-graphics` @ `32a13c5`, fetched from `~/retro-ai-game`). It is never pushed or published by this work.

## Summary

Phase 1 replaces the DOM board with the Canvas renderer and adds the client-only features of the modern branch, **without changing the server, the game rules or the snapshot protocol**. The server keeps owning all game state. The renderer is fed through an adapter that turns a `GameSnapshot` into the state the renderer expects, and derives visual events by comparing consecutive snapshots. The result is the best-looking version of the game, with the shop, perks, Gemini advisor and Strategist intact.

Phase 2 (separate spec, not covered here) moves the new rules (obstacles, gold/gem bonuses, combo, SLOW-MO/GHOST, richer difficulty presets) into the shared engine and the server protocol. The renderer already contains the layers for them.

## Decisions taken in the design session

1. Base = team game; the user's branch is a source of ported modules, not a base.
2. Approach A: adapter in front of the existing renderer; the server and protocol are untouched.
3. Phase 1 includes the countdown, difficulty presets (speed only) and the input buffer as **client-side** features.
4. The orange Lucky pickup gets its own visual in the renderer; the gold/gem look is reserved for Phase 2 bonuses.
5. The work lives on a new branch and is not pushed or published until the user asks.

## User Scenarios & Testing

### User Story 1 — Play on the Canvas board (P1)

The player sees the neon Canvas board with smooth snake movement, glow, particles, floating score text, a pulsing red food, an orange Lucky pickup, a death burst, screen shake and flash on game over, and a starfield background. All of it renders from the server snapshot.

**Independent test**: render a sequence of snapshots into the adapter and assert the produced render states and events; browser smoke confirms the canvas draws and the game is playable against the real server.

**Acceptance scenarios**

1. **Given** a running game, **when** snapshots arrive each tick, **then** the snake moves with a tween whose duration is the game tick time and never jumps more than one cell per tick.
2. **Given** the snake eats red food, **when** the next snapshot has a higher score and a longer snake, **then** particles and floating `+score` text appear at the food cell.
3. **Given** a Lucky pickup exists, **then** it is drawn as an orange orb distinct from the red food; collecting it produces a distinct burst and `+1 PT` text.
4. **Given** the status becomes `game_over`, **then** the death burst, shake and flash play once.
5. **Given** `prefers-reduced-motion`, **then** shake is off and particles are reduced.
6. **Given** the shop is open, **then** the Canvas stays visible under the shop overlay and the shop DOM works exactly as before.

### User Story 2 — Sound, feedback and accessibility (P2)

Generated sound effects (no audio files), a mute toggle, vibration on supported phones, a colorblind palette, swipe controls, and auto-pause when the tab loses focus.

**Acceptance scenarios**

1. Sound events fire from snapshot diffs (eat, lucky, level up, pause, resume, death), and `M` or the ♪ button toggles and persists mute locally.
2. `C` toggles the Okabe-Ito colorblind palette with extra shapes, persisted locally; color is never the only signal.
3. A swipe on the board changes direction like the arrow keys.
4. When the tab or window loses focus during play, the client pauses through the existing pause API.
5. Vibration follows events and is silenced together with sound.

### User Story 3 — Smoother controls (P2)

**Acceptance scenarios**

1. Two direction presses inside one tick: the first is sent immediately, the second is held and sent after the next snapshot, never opposite to the first.
2. A 3-2-1-GO countdown runs before the first move and before resuming from pause; pausing during the countdown cancels it. The server stays paused or ready during the countdown (client-only overlay).
3. Presses during the countdown do not move the snake.

### User Story 4 — Records and difficulty (P3)

**Acceptance scenarios**

1. A local top-10 table (initials A–Z/0–9, up to 3 chars) and stats (games, food eaten, longest snake, best combo field shown as `—` until Phase 2) are stored in `localStorage`, validated on read, rendered with `textContent` only.
2. A name prompt appears only when the final score qualifies.
3. EASY / NORMAL / HARD select speed presets (`startingSpeedMs`, `speedIncreaseEvery`, `speedDecreaseMs`, `minimumSpeedMs`); changing difficulty is allowed only outside an active game, starts a new server game through `POST /api/games {config}` (validated server-side by `parseGameConfig`), is remembered locally, and the best score is kept per difficulty.

### Edge cases

- Snapshots can arrive late or twice; the adapter ignores a snapshot with a revision not greater than the last one.
- A server restart or reconnect replaces the game; the renderer resets its tween and effects.
- Level-up and perk purchase change the snapshot without moving the snake; `moved` must be false then so the snake does not tween.
- With `localStorage` unavailable or corrupted, everything works with defaults.
- The extra life collision resets the snake to the centre in one tick; the renderer must not tween across the board for that tick.

## Requirements

### Functional requirements

**Rendering and adapter**

- **FR-001**: `<canvas id="board">` replaces the DOM cell grid. The renderer is render-only and never mutates state or calls the API.
- **FR-002**: A pure `snapshotAdapter` converts a `GameSnapshot` (and the previous one) into the renderer's state and a `moved` flag, and returns derived events (`ate`, `lucky`, `levelUp`, `died`, `won`, `purchase`). Missing Phase 2 entities are neutral values (no bonus, no obstacles, combo 1, no effects).
- **FR-003**: `moved` is true only when the head position changed to an adjacent cell between consecutive snapshots of the same game; it is false on level-up, purchase, pause, reset and extra-life respawn.
- **FR-004**: Tween duration is `getTickMs(config, score)` from shared code; no new server timing field is added.
- **FR-005**: The renderer draws the Lucky pickup with a dedicated style and keeps the gold/gem and obstacle layers dormant but present.
- **FR-006**: Colors and shapes come from two palettes (normal, colorblind); the canvas stays legible at small sizes and respects `prefers-reduced-motion`.

**Client features**

- **FR-007**: Sound is synthesized with Web Audio; no audio files or third-party assets. Mute is persisted locally.
- **FR-008**: Records and stats are stored locally, treated as untrusted on read (shape, bounds, name sanitation) and rendered only through `textContent`.
- **FR-009**: Input buffer, swipe, focus auto-pause, vibration, countdown and difficulty presets are client-side only and use the existing API (`move`, `pause`, `resume`, `restart`, `POST /api/games`). While the countdown runs the status chip reads GET READY. Keyboard: arrows, P/Space pause, R restart, S shop, M sound, C colors; WASD is not mapped because S is the shop key.
- **FR-010**: Difficulty presets pass through the existing server-side `parseGameConfig` validation; the client never trusts its own presets as authoritative.

**Page and compatibility**

- **FR-011**: The modern neon theme becomes the base styling. All HTML ids used by the current client logic (HUD, shop, advisor, Strategist) are preserved; the shop overlay keeps working over the board.
- **FR-012**: No change to `server/`, `src/game/gameProtocol.ts`, the snapshot shape, perk rules or the AI flows. All existing tests stay green.
- **FR-013**: Phase 1 must not use any secret or call any provider; AI behaviour is unchanged.

**Project contract**

- **FR-014**: `AGENTS.md` and `docs/INSTRUCTIONS.md` routing are updated for this repo variant: Canvas rendering, generated sound, local records and accessibility are allowed; server authority, read-only AI, secret rules and "no third-party assets" stay. The "small game, no music or broad refactors" wording is replaced with the new scope.

### Key entities

- **RenderState**: the modern renderer's state shape with Phase 2 fields neutral.
- **RenderEvent**: `ate | lucky | levelUp | died | won | purchase` plus position and score delta.
- **ClientSettings**: mute, colorblind, difficulty, best score per difficulty (localStorage).
- **Records**: top-10 entries and aggregate stats (localStorage, validated).

## Success criteria

- **SC-001**: The game is fully playable on the Canvas against the real server: start, play, pause, shop open/close, buy a perk, game over, restart.
- **SC-002**: The adapter, records module and input buffer have unit tests; `npm run typecheck`, `npm test`, `npm run build` and `npm run security:scan` pass.
- **SC-003**: A browser smoke test runs the happy path in headless Chromium without console errors.
- **SC-004**: `git diff` shows no change under `server/` and none to the snapshot validators.
- **SC-005**: The phase can be reviewed and shipped on its own; Phase 2 starts from it.

## Risks and mitigations

- **Tween over the network**: snapshots arrive with jitter. Mitigation: tween duration is capped to the tick time, a late snapshot snaps, and a snapshot with an old revision is dropped.
- **Style collision**: two large stylesheets with overlapping class names. Mitigation: modern CSS is the base, team shop/HUD rules are re-added under their existing ids, and a manual visual check plus smoke test guard the result.
- **Client-side countdown vs server state**: the server stays `ready` or `paused` during the countdown, so a refresh mid-countdown simply returns to that state. No server change needed.
- **Event derivation by snapshot diff** can miss an event if two ticks are coalesced; effects are cosmetic only, never authoritative.
- **Large port**: about 800 lines of renderer plus modules. Mitigation: port module by module, each with tests, from `modern-graphics-src`.

## Out of scope (Phase 1)

Obstacles, gold/gem bonuses, combo, SLOW-MO/GHOST, obstacle/bonus difficulty fields, server-side countdown or input buffer, any change to `server/`, the snapshot or the AI prompts and tools, publishing the user's private branch, online leaderboard, multiplayer.

## Assumptions

- The user's private branch stays local; this work only reads it through the local ref `modern-graphics-src`.
- The team Playwright E2E (`npm run test:e2e`) is updated or extended for the Canvas where it touched board cells; the old modern `e2e/smoke.spec.ts` is adapted, not copied verbatim.
- Phase 2 will extend the adapter instead of replacing it.
