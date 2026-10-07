# Evidence 015 — Best Game Phase 1 (Canvas visuals and client features)

## Record and task context

- **Purpose / accepted goal:** merge the user's private `feature/modern-graphics` (Canvas renderer, sound, records, accessibility) into the server-authoritative team game without changing the server, protocol, rules or AI. Phase 1 of two; Phase 2 (obstacles, bonuses, combo, power-ups in engine and server) is not part of this record.
- **Governing spec/task plan:** [spec](../../../specs/004-best-game-phase1/spec.md), [plan](../../../specs/004-best-game-phase1/plan.md).
- **Exact prompt artifact and version:** none; the approved spec and plan drove the work.
- **Starting source/revision or working-tree state:** branch `best-game-phase1` cut from `7e92b6f` (W05 on the user's `main`), clean tree. The user's private branch was read only through the local ref `modern-graphics-src` (`32a13c5`) and was never pushed.
- **Sources actually used:** the team client (`src/main.ts`, `index.html`, `src/styles.css`, `src/api/gameClient.ts`), the private branch's renderer, sound, records, page and styles, the existing e2e harness.
- **Scope / out of scope:** see the spec. No change under `server/` or to `src/game/gameProtocol.ts`.

## Baseline

New capability. At the start the suite was 119/119 (Evidence 014 end state) and the e2e script had the seven W04 scenarios M1–M6 (incl. M4b). The five new browser checks C1–C5 were added first and failed against the old client (C1: the Canvas drew nothing), then passed after the rewrite.

## Frozen scenarios and results

| ID | Scenario | Result | Where |
|---|---|---|---|
| U1 | Difficulty presets are valid and ordered; unknown names rejected | pass | `tests/difficulty.test.ts` (3) |
| U2 | localStorage helpers: round trip, missing/throwing storage, per-difficulty best, corrupted values | pass | `tests/settings.test.ts` (4) |
| U3 | Swipe thresholds and axis choice | pass | `tests/swipe.test.ts` (3) |
| U4 | Input buffer: immediate first turn, held second, opposite/duplicate drops, reset | pass | `tests/inputBuffer.test.ts` (7) |
| U5 | Countdown 3-2-1-GO, cancel, restart, idle cancel | pass | `tests/countdown.test.ts` (4) |
| U6 | Adapter: first snapshot, move, pause, eat, lucky, level up, purchase, death/won, extra-life respawn, duplicate, other game, no mutation | pass | `tests/snapshotAdapter.test.ts` (12) |
| U7 | Records validation (ported tests) | pass | `tests/records.test.ts` (4) |
| U8 | Page ids, canvas, controls, shop inside the board frame | pass | `tests/pageMarkup.test.ts` (3) |
| C1 | Canvas draws, no page errors | pass | `npm run test:e2e` |
| C2 | Arrow starts 3-2-1, status `GET READY`, then `PLAYING` | pass | e2e |
| C3 | `M`/`C` toggle and persist across reload | pass | e2e |
| C4 | Records dialog opens/closes | pass | e2e |
| C5 | HARD sends `startingSpeedMs: 125` and is remembered | pass | e2e |
| M1–M6 | All W04 shop/advisor scenarios | pass (no change needed) | e2e |

## Controlled change — iteration 1

- **Single bounded change:** adapter + ported renderer/sound/records + client modules + merged page and rewritten `main.ts`; no server change.
- **Rulings:** `won` event added; WASD not mapped (S is the shop key); status reads `GET READY` during the countdown (keeps M4 valid); difficulty can change only in `ready`, `game_over`, `won`; SC-004 checked against the phase base `7e92b6f`, not local `main`.
- **Late fix:** the control row wrapped badly when the shop made the buttons wider; added wrapping CSS and re-checked by screenshot.

## After verification

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | no errors |
| `npm test` | 0 | tests 159, pass 159, fail 0 (119 before, 40 new) |
| `npm run build` | 0 | succeeded |
| `npm run security:scan` | 0 | no credential patterns or client secret references |
| `npm run test:e2e` | 0 | 12 passed, 0 skipped, 0 failed |
| `git diff --stat 7e92b6f..HEAD -- server src/game/gameProtocol.ts` | — | empty |

**Visual check:** headless Chromium screenshots of the ready, countdown, playing, shop and colorblind states against the running dev server showed the neon Canvas board with the snake, food and starfield, the team HUD above it and the shop, advisor and Strategist panels over it, with no page errors.

## Honest limitations

- The Canvas renderer cannot be unit-tested in Node; it is covered by the pixel check (C1), the screenshots and typecheck. Animation smoothness, sound output and vibration were not judged by a human here.
- The orange Lucky pickup visual was not seen on screen: no screenshot caught a Lucky pickup (it appears at random).
- A mobile swipe was not exercised on a real device; only the pure helper is tested.
- AI behaviour was not changed or re-tested live; only the unchanged W04/W05 paths ran in the fake-provider e2e.
- Phase 2 rules (obstacles, bonuses, combo, power-ups) and server-side countdown are not implemented; `best combo` shows `—`.
- The private branch stays local; nothing from it was published.
