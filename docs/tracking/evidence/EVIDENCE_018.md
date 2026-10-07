# Evidence 018 — AI Coach and VS AI rival

## Record and task context

- **Purpose / accepted goal:** add an optional server-owned AI rival mode and an on-demand post-run Gemini coach.
- **Governing spec and prompt:** [Feature 005](../../specs/005-ai-coach-and-rival.md); [Build prompt v1](../../prompts/AI_COACH_AND_RIVAL_V1.md).
- **Starting revision/state:** `0d54666` on `best-game-phase1`, with existing uncommitted obstacle/bonus restoration in the worktree. Those user changes are preserved and are not part of this feature's baseline.
- **Sources actually used:** current project instructions, base-game/Phase 1 architecture, engine/protocol/session/client/renderer, existing Google provider and W05 Strategist, and Evidence 015–017.
- **Conflict ruling:** current request supersedes the previous prohibition on new modes only for a server-owned AI rival; no human multiplayer is added.
- **Verification constraint:** this task's operating instructions prohibit adding/running tests unless explicitly requested. Typecheck/build and direct browser play-checks will be recorded if run; automated test suites will be marked not run for this reason.

## Frozen scenarios

| ID | Scenario | Expected result | Baseline | After |
|---|---|---|---|---|
| F1 | Create Classic game | No rival; original game behavior | Pass by code inspection; existing defaults have no rival mode | Default remains Classic; initial browser UI showed no AI score chip |
| F2 | Create VS AI game | Safe visible rival, score shown, server advances bot | Capability absent | Browser showed VS AI selected, `AI 0`, and rendered rival; one run completed |
| F3 | Bot movement through obstacles and snakes | Bot avoids blocked cells and reverse turns; dies independently | Capability absent | Not verified in an automated scenario; manual run was too short to assess pathfinding |
| F4 | End VS AI run | Winner/tie reflects final scores | Capability absent | Browser displayed `TIE GAME` for a completed 0–0 run |
| F5 | Request coach before run ends or with extra input | Rejected; no Gemini request | Capability absent | Not exercised |
| F6 | Request coach after run ends with valid provider output | Short validated text; no game-state mutation | Capability absent | Coach panel appeared after run end; provider response was not requested |
| F7 | Coach provider absent/fails or returns invalid data | Safe unavailable message; game remains usable | Capability absent | Not exercised against the endpoint/provider |
| F8 | Mode, rival, and coach UI on browser | Controls and rendered state are accessible and responsive | Capability absent | Browser inspection showed mode selector, rival, score, legend, and post-run coach UI |

## Controlled change — iteration 1

- **Hypothesis:** a separate server-owned rival entity preserves the single human-player architecture, while an on-demand post-run coach reuses the existing server-only Gemini boundary.
- **Changes:** added validated `classic`/`vs_ai` configuration; a server-owned pathfinding rival with independent score/death; rival score and winner rendering; and a post-run coach route that sends only sanitized run statistics, uses the existing Google model allowlist with bounded attempts, validates a short exact result, caches one result per run, and never mutates game state. Added the selectable mode, canvas rival, score/legend, coach panel, feature spec, and project architecture note. Preserved the pre-existing obstacle/bonus restoration.
- **Files changed for this feature:** `AGENTS.md`, `docs/instructions/01-project-architecture.md`, `docs/specs/005-ai-coach-and-rival.md`, `docs/prompts/AI_COACH_AND_RIVAL_V1.md`, this evidence file, `docs/tracking/WORK_LOG.md`, `docs/tracking/AI_USAGE_LOG.md`, `src/game/snakeConfig.ts`, `src/game/snakeEngine.ts`, `src/game/gameProtocol.ts`, `server/gameSession.ts`, `server/httpServer.ts`, `server/index.ts`, `server/ai/gameCoach.ts`, `server/ai/gameCoachTransport.ts`, `src/ai/gameCoach.ts`, `src/api/gameClient.ts`, `src/rendering/renderState.ts`, `src/rendering/snapshotAdapter.ts`, `src/rendering/canvasRenderer.ts`, `src/ui/settings.ts`, `src/main.ts`, `index.html`, `src/styles.css`, and the existing snapshot fixture in `tests/snapshotAdapter.test.ts` (schema compatibility only).
- **Verification:** `npm run typecheck` passed; `npm run build` passed; `npm run security:scan` passed; `git diff --check` passed. Browser inspection confirmed the VS AI selector, server-provided `AI 0` score, rendered rival, and post-run coach panel. A manual start ended in a 0–0 tie after the human snake reached a wall; this confirmed the end-of-run comparison UI, not the bot's pathfinding quality.
- **Not run:** automated test suites were not added or run under this task's operating constraint. No live Gemini coach call was made; successful coaching requires a backend started with `GEMINI_API_KEY`.

## Limitations

- The automated scenarios F3, F5, and F6 were not exercised; the bot's long-run pathfinding and live provider response remain unverified. The user can test the visible game now; a live coach response requires the server-runtime key.
