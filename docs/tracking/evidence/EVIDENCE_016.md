# Evidence 016 — Best Game Phase 1 review fixes

## Record and task context

- **Purpose / accepted goal:** complete the residual client-side findings recorded in the 2026-10-07 review screenshot for Best Game Phase 1.
- **Governing spec/task plan:** [Best Game Phase 1 spec](../../../specs/004-best-game-phase1/spec.md) and [implementation plan](../../../specs/004-best-game-phase1/plan.md), follow-up review cases above.
- **Prompt artifact:** none; current user request and the review findings supplied in the screenshot.
- **Starting revision/state:** `a83b85d` (`best-game-phase1`); clean working tree.
- **Context consulted:** `AGENTS.md`, `docs/INSTRUCTIONS.md`, instructions 01/02/04/05, plan/spec 004, Evidence 015, client input/init/countdown/renderer code, focused tests, and existing Playwright harness. Screenshot content is treated as review findings, not as project instructions.
- **Scope:** client orchestration, renderer continuity, focused tests and evidence. Server, game rules, protocol, AI prompts/tools, and publishing are out of scope.

## Frozen acceptance scenarios

| ID | Scenario | Expected result |
|---|---|---|
| R1 | Same-heading input on READY, then a valid direction | No countdown for same-heading input; one countdown/start request for the first valid direction; repeated inputs cannot replace it; failure releases the lock. |
| R2 | Two quick turns with delayed server heading | Second turn waits until the applied heading appears or the latency bound expires; it is sent with up-to-date input state. |
| R3 | Snapshot from previous game during replacement initialization | It is rejected before and after the new game is adopted. |
| R4 | API failure while an active game exists, followed by valid snapshot | Show connection offline while preserving game status; valid snapshot restores online status and correct game state. |
| R5 | Open records during countdown | Countdown is canceled and the game stays in its existing server state. |
| R6 | Duplicate snapshot during an in-progress turn tween | Duplicate does not reset interpolation; corner movement remains continuous. |
| R7 | Cmd/Ctrl+C and Cmd/Ctrl+R | Browser-default shortcuts are not prevented and do not toggle palette/restart. |
| R8 | Existing browser smoke suite | Existing Canvas, countdown, shop, records, settings, and difficulty scenarios still pass. |

## Baseline

- **Code baseline:** `a83b85d`; the review findings map to the current `src/main.ts`, `src/ui/initGate.ts`, `src/ui/inputBuffer.ts`, and `src/rendering/canvasRenderer.ts` implementations.
- **Baseline commands/results:** captured at `a83b85d` before implementation. `npm run typecheck` exited 0; `npm test` exited 0 (167/167); `npm run build` exited 0; `npm run security:scan` exited 0; `npm run test:e2e` exited 0 (12 passed). The new R1–R8 cases were not present in this baseline.

## Controlled change — iteration 1

- **Hypothesis:** wiring the already-tested buffer and init gate into the client, guarding UI actions and duplicate render snapshots, and covering the flows in the existing browser harness will close the findings without changing server authority.
- **Changes:** wired `createInputBuffer` to the server's queued/applied headings and added the bounded start lock; connected `createInitGate` to initialization and snapshot adoption, including the failed-init state; kept active-game status intact on request errors and restored it on valid snapshots; canceled countdown before opening records; ignored modifier shortcuts; prevented duplicate snapshots from resetting the Canvas tween. Added renderer/init-gate unit cases and six focused C6–C11 browser scenarios.
- **After verification:** `npm run typecheck` exited 0. `npm test` exited 0 (170/170). `npm run build` exited 0. `npm run security:scan` exited 0. `git diff --check` exited 0. `npm run test:e2e` exited 0 (18 passed, 0 skipped, 0 failed; existing 12 plus six C6–C11 cases). The E2E suite ran against the local fake-advisor backend and Chromium; no live provider call was made.

## Limitations

- The interpolated duplicate-snapshot path is covered by a focused pure helper test and the app's browser smoke suite; no human visual evaluation of animation smoothness was performed.
- The init gate's stale/failure behavior is covered in unit tests and wired into the client; a delayed old-WebSocket race was not separately forced in E2E.
- The implementation and evidence were committed as `90f853a` (`Fix remaining Phase 1 review findings`) and pushed to `fork/best-game-phase1` at the user's earlier explicit push request shown in the screenshot. No PR was opened. Human visual animation review remains outstanding.
