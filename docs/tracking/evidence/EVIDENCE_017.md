# Evidence 017 — Restore obstacles and score bonuses; check Week 5 live agent

## Record and task context

- **Purpose / accepted goal:** restore the obstacle and extra-score bonus mechanics visible in the earlier Retro Snake implementation, carry them through the authoritative server snapshot and Canvas renderer, and check that the Week 5 Shop Strategist reaches Gemini.
- **Governing spec/task plan:** [base game spec](../../specs/BASE_GAME_SPEC.md), [Shop Strategist spec](../../../specs/003-shop-agent/spec.md), current user request.
- **Exact prompt artifact and version:** no standalone prompt artifact applies.
- **Starting source/revision or working-tree state:** clean `best-game-phase1` at `0d54666`; initial baseline `npm test` passed 170/170. The then-current snapshot adapter returned `obstacles: []` and `bonus: null`; the game engine and snapshot contract had no such entities.
- **Sources actually used:** current user request; earlier implementation at `32a13c5` (obstacle safety/connectivity, obstacle counts, gold/gem point values and expiry); active game spec, engine, protocol, session manager, Canvas snapshot adapter and renderer; testing/security/workflow instructions; W05 HTTP contract and live smoke script.
- **Relevant sources excluded and why:** `.env` and credential stores were not opened, per `AGENTS.md`. The historical commit's combo and temporary power-up features were outside the user's request and were not restored.
- **Conflict priority and risks:** the user's explicit restore request updates the current base-game feature scope. The current server-authoritative boundary remains in force. The first local probe had no provider configured; a later user-run hidden-input smoke test completed successfully with a replacement key.
- **Scope / out of scope:** restore static/spawned obstacles and temporary gold/gem score bonuses; validate and render them; update game spec, tests and evidence. No combo, temporary power-ups, map choice, AI write action, new provider, commit or push.

## Baseline

- `npm test` — exit 0; 170 tests passed, 0 failed.
- At baseline, the game engine, snapshot schema and server exposed neither obstacles nor score bonuses. The renderer adapter explicitly replaced both fields with neutral values, so they could not appear in the browser.
- W05 live baseline for this task: `AGENT_LIVE=1 npm run agent:live` exited 2 with `GEMINI_API_KEY is not set in this terminal.` This indicates that this command environment cannot test the secret; it does not establish that a stored key is invalid.

## Frozen eval scenarios and results

| ID | Scenario / input | Expected result | Baseline | After iteration 1 | Evidence / notes |
|---|---|---|---|---|---|
| G1 | Create a default game | 4 safe obstacles; no overlap with snake, food or each other; all free board cells remain connected | N/A — capability absent | pass | `tests/snake.test.ts` → initial obstacle assertions |
| G2 | Move the snake into an obstacle | Authoritative game ends or consumes a life according to the existing collision rule | N/A — obstacle collision absent | pass | `tests/snake.test.ts` → bonus expiry and obstacle collision |
| G3 | Cross an 8-point score milestone | Add one safe obstacle, bounded by 14 | N/A — capability absent | pass | `tests/snake.test.ts` → milestone placement |
| G4 | Eat ordinary food; then collect or let a bonus expire | 30% chance to spawn gold (+3) or gem (+5), 45-tick lifetime; collection grows snake and adds score only | N/A — capability absent | pass | `tests/snake.test.ts` → timed bonus spawn/collect/expiry |
| G5 | Deliver valid and malformed server snapshots to the adapter | Server fields validate, copy to renderer; invalid positions/overlaps are rejected | N/A — fields absent | pass | `tests/gameProtocol.test.ts`; `tests/snapshotAdapter.test.ts` |
| G6 | Open a new game in the browser | Purple obstacle blocks are visible on the Canvas, with a legend for hazards and bonus values | N/A — renderer received empty fields | pass | Browser screenshot inspected during task; not saved as a file |
| A1 | Invoke the W05 live smoke harness with a valid runtime key | Real provider steps and a completed validated agent result | Not recorded before this task | pass | User-run live output completed 3 steps, accepted 2 read-only tool calls, and returned a validated plan; see live result below |

## Controlled change — iteration 1

- **Hypothesis / reason:** the omitted mechanics were already supported visually by the renderer and existed in the prior game implementation. Restoring them in the authoritative engine and snapshot restores gameplay without moving rules into the client.
- **Single bounded change:** add static and score-milestone obstacles, safe placement with board-connectivity checks, timed gold/gem bonuses, snapshot validation/rendering, and visible legend; update the active game spec.
- **Files changed:** `src/game/snakeConfig.ts`, `src/game/snakeEngine.ts`, `src/game/gameProtocol.ts`, `server/gameSession.ts`, `src/rendering/snapshotAdapter.ts`, `src/rendering/renderState.ts`, `index.html`, `docs/specs/BASE_GAME_SPEC.md`, `tests/snake.test.ts`, `tests/gameProtocol.test.ts`, `tests/gameSession.test.ts`, `tests/httpServer.test.ts`, `tests/snapshotAdapter.test.ts`, `tests/pageMarkup.test.ts`.
- **Out of scope preserved:** no combo multiplier, collectible slow/ghost powers, or AI purchases.

## After verification

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 175 tests passed, 0 failed.
- `npm run build` — exit 0; Vite production build succeeded.
- `npm run security:scan` — exit 0; no known credential patterns or client secret references found.
- `npm run test:e2e` — exit 0; 18 passed, 0 skipped, 0 failed.
- `git diff --check` — exit 0.
- Local API snapshot check — HTTP 201; default game returned 4 obstacles and a bonus field; config reported `obstacleStartCount: 4`, `bonusChance: 0.3`.
- Initial local W05 probe — `AGENT_LIVE=1 npm run agent:live` exited 2 because `GEMINI_API_KEY` was absent from the invoking environment; the already-running backend returned safe `provider_failed` before step 1. This was an environment limitation, not a key-validity result.
- User-run live smoke with a replacement key — completed successfully in 23,910 ms: 3 steps, 2 accepted read-only tool calls, 5 provider attempts. `gemini-3.8-flash` timed out twice (HTTP 408); retry/fallback reached `gemini-3.5-flash-lite` and completed all steps. The accepted tools were `get_shop_state` and `evaluate_perk_plan`; the validated plan was `extra_xp → luck`, costing 2 perk points and leaving 1. The output was supplied in the user's terminal screenshot; no key value was needed for this record.
- An earlier user-run attempt returned HTTP 401 Unauthorized. The old key appeared in a screenshot/terminal command, so it should be considered exposed and revoked. The successful run used the replacement key entered through a hidden terminal prompt. The assistant did not read or store either key.
- Browser observation: the current Canvas visibly rendered the starting obstacle blocks. The revised five-item legend was checked by the markup test; a final visual review of its wrapped layout was not recorded.

## Honest limitations / next action

- This verifies that the W05 live harness can authenticate with the replacement key, exercise the read-only tool loop, validate a final plan, and fall back after primary-model timeouts. It is one scenario, not a broad quality or quota guarantee, and it does not replace browser validation of the Strategist UI.
- The W05 automated suite continues to prove deterministic behavior with fake transports. Credentials must remain in the hidden terminal prompt and out of chat, source files, and evidence.
