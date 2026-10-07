# Work Log

Append one concise entry for each substantive implementation, review, or documentation task. Every entry links the prompt/specification that guided the work and the evidence used or created. If there was no standalone prompt artifact, say so. Keep results factual and do not rewrite history.

## 2026-09-30 — Make the browser E2E portable and deterministic (PR #1 re-review)

- **Goal:** address the PR #1 re-review: `spawn("npx")` fails on Windows, `stop()` did not wait for the real backend process (EADDRINUSE on 3001 before M6), fixed API port, and M5 skipped in a fresh run.
- **Prompt/spec/evidence:** reviewer re-review of PR #1; no standalone prompt applies. Results in [Evidence 013](evidence/EVIDENCE_013.md).
- **Outcome:** `scripts/e2e/shopAdvisor.e2e.ts` now spawns `process.execPath` directly (`--import tsx` for the fake API, Vite's resolved CLI entry for the client), picks free API/web ports, and awaits process exit in `stop()` with a SIGKILL fallback. `vite.config.ts` reads the proxy target port from `API_PORT` (default 3001). `scripts/e2e/fakeAdvisorServer.ts` gained an opt-in `E2E_SEED_PERK_POINTS=1` fixture that grants one perk point on a game's first pause, so M5 always runs.
- **Verification:** `npm run test:e2e` → 7 passed, 0 skipped, 0 failed (also with port 3001 occupied; no leftover processes). `npm test` (55/55), `npm run build`, `npm run security:scan` passed.
- **Open:** re-run the unmodified `npm run test:e2e` on Windows; only macOS was available here.

## 2026-09-30 — Add reproducible browser E2E for the shop advisor

- **Goal:** replace the documented-only manual browser scenario with an executed, repeatable check, as requested in the Week 4 review.
- **Prompt/spec/evidence:** reviewer feedback; [quickstart manual flow](../../specs/002-shop-advisor/quickstart.md); no standalone prompt applies. Results in [Evidence 013](evidence/EVIDENCE_013.md).
- **Outcome:** added `scripts/e2e/fakeAdvisorServer.ts` (real server/advisor, scripted provider: Flash 503 → Flash-Lite answer, or no provider) and `scripts/e2e/shopAdvisor.e2e.ts` (headless Chromium via `playwright`), plus `npm run test:e2e`. Offline `npm test` is unchanged.
- **Verification:** `npm run test:e2e` → 6 passed, 1 skipped (M5, no affordable perk in a fresh run), 0 failed. `npm run typecheck`, `npm test` (55/55), `npm run build`, `npm run security:scan`, `git diff --check` passed.
- **Finding:** the Vite dev/preview proxy does not forward browser aborts to the backend, so a cancelled request behind the proxy still completes its provider call; the UI discards it and direct backend cancellation works (M4b).

## 2026-09-30 — Address Week 4 review feedback

- **Goal:** resolve the reviewer's Week 4 remarks: stale research record, contribution evidence, smoke/manual scenario, README navigation.
- **Prompt/spec/evidence:** reviewer feedback on the Week 4 submission; no standalone prompt applies. See [Evidence 013](evidence/EVIDENCE_013.md) and [CONTRIBUTIONS_WEEK04](CONTRIBUTIONS_WEEK04.md).
- **Outcome:** collapsed the superseded reliability policy in `specs/002-shop-advisor/research.md` to a pointer to Reliability V2 (85 s, Flash ×1 → Flash-Lite ×2 → Gemma ×3); aligned task T013 in `tasks.md`; added the Week 4 contribution record; added Evidence 013 (real-server HTTP smoke S1–S3 executed, manual browser scenario M1–M6 documented, not executed); added a Week 3 vs Week 4 section and evidence chain to the README.
- **Verification:** `npm run typecheck`, `npm test` (55/55), `npm run build`, `npm run security:scan`, and `git diff --check` passed; HTTP smoke S1–S3 in Evidence 013.
- **Limitations:** browser scenario M1–M6 not run; attribution rows for Uroš's local work come from the team reports, not from Git authorship.

## 2026-09-30 — Prepare Week 4 learner report

- **Goal:** prepare the Week 4 report from the learner's confirmed identity, team, contribution, and next step, cross-checked against project tracking records.
- **Prompt/spec/evidence:** no standalone prompt applies; used the [Week 4 report](reports/WEEKLY_REPORT_week04.md), [AI usage log](AI_USAGE_LOG.md), [Evidence 005–007](evidence/), and [Evidence 009–012](evidence/).
- **Outcome:** saved the confirmed Serbian report with links to relevant prompts and evidence. The report distinguishes recorded automated results from learner-reported manual testing and retains known limitations.
- **Verification:** reviewed the saved Markdown structure and links; no code checks run because this was a report-only change.

## 2026-09-30 — Audit repository completion and Week 3/4 checklists

- **Goal:** check current implementation, documentation, tracked tasks, and validation status; review both weekly checklists.
- **Prompt/spec/evidence:** current user request; no standalone prompt applies. Reviewed `AGENTS.md`, `docs/INSTRUCTIONS.md`, instructions 04–05, current feature specs/plans, task lists, tracking records, and source/tests.
- **Outcome:** appended dated audit results to the [Week 3 review](checklists/WEEK03_EXERCISE_REVIEW.md) and [Week 4 checklist](checklists/WEEK04_RELIABLE_AI_INTEGRATION_CHECKLIST.md). Automated implementation tasks are checked off in the owning feature plans; the current browser and shop flow were subsequently confirmed by the user. Week 3 movement-Hint and Week 4 movement-Hint checklist rows are historical/superseded.
- **Verification:** `npm run typecheck`, `npm test` (55/55), `npm run build`, `npm run security:scan`, and `git diff --check` passed. The HTTP integration tests and security scan first encountered sandbox `EPERM` restrictions and passed on rerun with the required local binding / `git` process access.
- **Limitations / next step:** no implementation changes were made in this audit; current behavior and evidence are ready for submission.

## 2026-09-30 — Fix Gemini structured-output MIME enum

- **Goal:** diagnose the recurring HTTP 400 and verify the structured Gemini request against the live API.
- **Prompt/spec references:** current user request; [Shop Advisor API contract](../../specs/002-shop-advisor/contracts/shop-advice-api.md), [V2 plan](../specs/GEMINI_HINT_CHANGES_V2.md), and official [Google GenerateContent API reference](https://ai.google.dev/api/generate-content). No standalone prompt artifact applies.
- **Finding/outcome:** Google rejected `responseFormat.text.mimeType: "application/json"` as an invalid enum. Changed it to `APPLICATION_JSON` and updated the adapter test and request examples.
- **Live check:** corrected Flash request passed payload validation but Flash returned HTTP 503 for high demand. Flash-Lite returned HTTP 200 and the adapter parsed a valid structured advice pair. See [Evidence 012](evidence/EVIDENCE_012.md).
- **Verification:** focused 26/26 tests, typecheck, full 55/55 tests, build, security scan, and `git diff --check` passed.
- **Security:** key was used only for the explicitly authorized check and was not recorded in files; because it was pasted into chat, revoke it and create a new one.

## 2026-09-30 — Fix Gemini REST system instruction field

- **Goal:** resolve the Gemini `400 bad_request` reported at runtime.
- **Prompt/spec references:** current user request and runtime log; [Shop Advisor API contract](../../specs/002-shop-advisor/contracts/shop-advice-api.md), [V2 plan](../specs/GEMINI_HINT_CHANGES_V2.md), and official [Google GenerateContent API reference](https://ai.google.dev/api/generate-content). No standalone prompt artifact applies.
- **Starting state:** dirty `main` worktree with prior shop-advisor changes; focused test passed while asserting the incorrect `system_instruction` field.
- **Outcome:** corrected Gemini REST payload and adapter test to use camelCase `systemInstruction`; synchronized the research note and API contract.
- **Verification:** focused suite 26/26, `npm run typecheck`, `npm test` 55/55, `npm run build`, `npm run security:scan`, and `git diff --check` passed. See [Evidence 011](evidence/EVIDENCE_011.md).
- **Limitations / next step:** live provider checks were not run because the project contract prohibits them. The key pasted into chat was not used; revoke it and create a replacement.

## 2026-09-29 — Add Luck perk and orange Lucky pickup

- **Goal:** extend the existing XP/perks feature with a Luck perk (0–5) and one orange pickup that awards one perk point.
- **Prompt/spec references:** current user request; [build prompt v3](../prompts/week4/BUILD_PROMPT_POWERUPS_PERKS_V3.md) and [feature spec](../../specs/001-powerups-perks/spec.md).
- **Starting state:** prior XP/perks implementation present with 31/31 tests passing, typecheck and build passing; Lucky pickup capability absent. Worktree contains prior user-requested docs/code changes; those are being preserved.
- **Assumptions:** base spawn probability 5%, increased by 5 percentage points per Luck level (max 30%); one active Lucky pickup; roll after red food is eaten; Luck upgrade cost 1–5 points; Lucky pickup grants one point without score, XP, or growth.
- **Spec Kit:** `specify check` reports the CLI ready. No installed Spec Kit workflow is available; update only the existing feature artifacts and keep `BASE_GAME_SPEC.md` unchanged.
- **Outcome:** added a capped Luck perk and rare orange Lucky pickup that awards one perk point; added a Luck meter/shop card and moved perk meters into their own HUD row below run stats. Red food stays red; shop-overlay close/resume behavior is preserved.
- **Verification:** `npm run typecheck`, `npm test` (33/33), `npm run build`, `git diff --check`, and `specify check` passed. Base-spec SHA-256 is unchanged. Manual browser QA remains pending because no browser connection was available.
- **Evidence/next step:** [Evidence 007](evidence/EVIDENCE_007.md); T026 remains pending until browser QA is available.

## 2026-09-29 — Fix Lucky pickup snapshot rejection

- **Goal:** resolve the apparent freeze/crash after collecting the orange Lucky pickup and document the cause.
- **Prompt/spec references:** user-reported failure; [feature spec](../../specs/001-powerups-perks/spec.md) and [data model](../../specs/001-powerups-perks/data-model.md).
- **Cause/fix:** snapshot validation incorrectly capped perk points at levels earned. Lucky pickups add bonus points, so a level-1/1-point snapshot was rejected and silently ignored by the browser. Removed only that outdated upper bound while retaining safe nonnegative-integer validation and the ready-state invariant.
- **Verification/evidence:** added a protocol regression test; `npm run typecheck`, `npm test` (33/33), `npm run build`, and `git diff --check` passed. Details and before/after behavior are in [Evidence 007](evidence/EVIDENCE_007.md).

## 2026-09-29 — Show perk shop over the board and resume on close

- **Goal:** apply the requested small UX adjustment: render the shop as an overlay over the game and resume immediately when the open shop is closed.
- **Prompt/spec references:** latest user clarification; [build prompt v2](../prompts/week4/BUILD_PROMPT_POWERUPS_PERKS_V2.md), [feature specification](../../specs/001-powerups-perks/spec.md), and [quickstart](../../specs/001-powerups-perks/quickstart.md).
- **Outcome:** moved the shop into the board overlay layer; S, SHOP, and CLOSE SHOP now close an open shop and resume, while S/SHOP opens the shop without resuming when the run was paused separately.
- **Verification/evidence:** [Evidence 006](evidence/EVIDENCE_006.md) records the revised Q4-v2 expectation; typecheck, 31 tests, production build, and `git diff --check` passed. Manual browser QA remains pending because no browser is available.
- **Scope preserved:** no progression, purchase, collision, persistence, or base-game spec rules changed.

## 2026-09-29 — Implement XP and perks Phase 1

- **Goal:** implement the approved XP, Extra XP, and +1 Life feature while keeping game state server-authoritative and the base game spec unchanged.
- **Prompt/spec references:** [XP/perks build prompt](../prompts/week4/BUILD_PROMPT_POWERUPS_PERKS_V1.md), [feature spec](../../specs/001-powerups-perks/spec.md), [implementation plan](../../specs/001-powerups-perks/plan.md), and [base game spec](../specs/BASE_GAME_SPEC.md).
- **Spec Kit review:** `specify check` reported the local CLI ready. No automation workflow was installed, so the artifact consistency/quality pass was reviewed manually against the available Spec Kit structure and project source-of-truth rules.
- **Starting state:** feature docs present; gameplay capability absent. Pre-implementation gates passed: 26/26 tests, typecheck, and build.
- **Outcome:** implemented food XP and level-up points, capped Extra XP/Extra Life purchases through a paused-only endpoint, collision recovery, validated snapshots, HUD/shop rendering, and deterministic tests. Collectible powerups, persistence, accounts, new modes, and base-spec content changes remain out of scope.
- **Verification:** final command results are in [Evidence 006](evidence/EVIDENCE_006.md). Automated checks passed (31/31 tests, typecheck, production build, diff check). Browser visual QA remains pending: the browser runtime exposed no available browser.
- **Next step:** perform T016 browser QA when a browser is available; no automated failures are outstanding.

## 2026-09-29 — Narrow XP and perks feature to Phase 1

- **Goal:** simplify the proposed feature to run XP, Extra XP, and +1 Life; remove collectible powerups and rename the unchanged core rules document to the Base Game Specification.
- **Prompt/spec references:** current user clarification; the earlier powerups/perks prompt from conversation is not present in this checkout. New scoped prompt and feature artifacts will be created under `docs/prompts/week4/` and `specs/001-powerups-perks/`.
- **Starting state:** `main` is at `091fe25`, ahead of `origin/main` by two commits; worktree was clean apart from an untracked `.specify/feature.json` pointer. IDE-listed feature artifacts and the powerups prompt are absent from the current checkout.
- **Outcome:** renamed `GAME_SPEC.md` to `BASE_GAME_SPEC.md` and confirmed identical SHA-256 content. Recreated the scoped prompt and Spec Kit feature package for XP, Extra XP, and +1 Life only. Removed all collectible powerup mechanics from this phase.
- **Verification:** `git diff --check` passed; all relative Markdown links resolve across 16 files; 15/15 task lines match the required format; no trailing whitespace. Code checks and manual gameplay checks were skipped because no implementation changed.
- **Evidence:** [Evidence 006](evidence/EVIDENCE_006.md) records frozen Q1–Q5 and actual document checks.
- **Limitations/next step:** feature behavior remains unimplemented. Begin implementation at T001 after reviewing the five unchecked product questions in `feature-quality.md`.

## 2026-09-29 — Server-authoritative single-player refactor

- **Goal:** preserve current Snake gameplay while moving authority to a TypeScript Node backend, with multiple independent in-memory single-player containers and a path to extend player/session state later.
- **Prompt/spec references:** [Server refactor prompt](../prompts/week4/BUILD_PROMPT_SERVER_REFACTOR.md), [refactor plan](../specs/REFACTOR_PLAN.md), [base game specification](../specs/BASE_GAME_SPEC.md), and [Hint tool contract](../specs/TOOL_CONTRACT.md).
- **Task context:** consulted the source, current implementation, tests, and instructions in `docs/INSTRUCTIONS.md`; current user request and clarification supersede the prior browser-only/backend prohibition. Existing unrelated working-tree changes are being preserved.
- **Evidence:** [Evidence 005](evidence/EVIDENCE_005.md) owns acceptance scenarios, command output, and limitations for this refactor.
- **Starting state:** existing browser-only implementation; repository contained pre-existing modified, deleted, and untracked documentation files. Core test history is recorded in [Evidence 003](evidence/EVIDENCE_003.md), and Hint cases in [Evidence 004](evidence/EVIDENCE_004.md).
- **Outcome:** added Node HTTP endpoints for game creation/read and direction, pause, resume, and restart actions; WebSocket sends versioned authoritative snapshots. The browser now submits actions and renders validated snapshots; local Hint remains sanitized and read-only. Added multiple isolated in-memory containers, one player per container, and no room/join or multiplayer flow. Added a detailed checked plan, implementation prompt, updated project contract, and task evidence.
- **Files changed:** server manager/API/entrypoint; shared snapshot protocol and browser API/render flow; Vite proxy, package scripts/dependencies, tests, README, game spec, architecture guidance, work log, AI usage log, and Evidence 005.
- **Verification:** `npm run typecheck` passed; `npm test` passed 26/26; `npm run build` passed; `git diff --check` and focused Markdown link scan passed. Vite proxied `/api/health` and returned HTTP 200. The user later reported a successful manual check; see [Evidence 005](evidence/EVIDENCE_005.md).
- **Limitations/next step:** sessions are in memory and disappear at server restart. Each container has one player and there is no room/join endpoint. The user reported manual success but did not provide individual scenarios.

## 2026-09-29 — Document build and local run steps

- **Goal:** explain development startup and how to build and preview the client with the API server running.
- **Prompt/spec references:** user request; [`README.md`](../../README.md), [`vite.config.ts`](../../vite.config.ts), and the package scripts in [`package.json`](../../package.json).
- **Outcome:** added development and build/preview steps to the README and verification instructions; configured Vite preview to proxy API and WebSocket requests to the local TypeScript backend.
- **Verification:** `npm run typecheck` passed; `npm test` passed 26/26; `npm run build` passed; built preview `/api/health` returned HTTP 200 through the preview proxy; `git diff --check` passed. Details are in [Evidence 005](evidence/EVIDENCE_005.md).

## 2026-09-20 to 2026-09-23 — Snake core and local AI Hint milestones

- **Goal:** build the scoped Snake game, preserve a core baseline, then add one controlled read-only local Hint flow.
- **Prompt/spec references:** [Initial build prompt](../prompts/week3/BUILD_PROMPT_V1.md), [mock Hint prompt](../prompts/week3/BUILD_PROMPT_FINAL_VERSION.md), [base game specification](../specs/BASE_GAME_SPEC.md), [tool contract](../specs/TOOL_CONTRACT.md).
- **Task context:** task-specific included/excluded sources, priority, and risks are recorded in [Evidence 003](evidence/EVIDENCE_003.md); no live provider, network, credentials, or unrelated project code were in scope.
- **Evidence:** [Evidence 003 — baseline, core evals, controlled change, and command outputs](evidence/EVIDENCE_003.md); [Evidence 004 — Hint success, negative, read-only, and failure cases](evidence/EVIDENCE_004.md).
- **Recorded outcome:** baseline test output was 9/9 passing; after the Hint change the recorded test output was 16/16 passing, with typecheck and build outputs in Evidence 003.
- **Limitations:** the model is a local fake/mock; these records do not establish live-provider or real-LLM quality.

## 2026-09-29 — Organize project instructions and tracking records

- **Goal:** replace the crowded root guidance and scattered Markdown files with a concise `AGENTS.md`, routed topic instructions, and organized specifications, prompts, and tracking records.
- **Prompt/spec references:** no standalone build prompt applied to this documentation-only reorganization; followed the user's request, [`AGENTS.md`](../../AGENTS.md), and the existing [instruction index](../INSTRUCTIONS.md).
- **Evidence used:** existing [Evidence 003](evidence/EVIDENCE_003.md), [Evidence 004](evidence/EVIDENCE_004.md), and [Week 3 review checklist](checklists/WEEK03_EXERCISE_REVIEW.md).
- **Outcome:** added the instruction index and topic modules; grouped specs, prompts, and tracking records; preserved the audit checklist; removed the redundant general guidance note.
- **Verification:** relative Markdown link scan passed. Code checks were skipped because no implementation changed.
- **Limitations:** no game behavior was changed or re-audited.

## 2026-09-29 — Consolidate context, baseline, and eval records

- **Goal:** remove standalone context-manifest, baseline, and global eval files while preserving the required information in task-specific records.
- **Prompt/spec references:** no standalone implementation prompt applied; consulted [project instructions](../INSTRUCTIONS.md), [initial build prompt](../prompts/week3/BUILD_PROMPT_V1.md), [mock Hint prompt](../prompts/week3/BUILD_PROMPT_FINAL_VERSION.md), [base game specification](../specs/BASE_GAME_SPEC.md), and [tool contract](../specs/TOOL_CONTRACT.md).
- **Evidence used/updated:** [Evidence 003](evidence/EVIDENCE_003.md) now contains the baseline, context record, core eval cases, and verification output; [Evidence 004](evidence/EVIDENCE_004.md) contains the Hint-specific evals and outcomes.
- **Outcome:** removed the standalone context manifest, global eval file, and separate baseline file. Evidence 003 now owns the core baseline, task context, core eval cases, and command outputs; Evidence 004 owns Hint-specific evals. Work-log entries now link prompts/specs and evidence.
- **Verification:** Python 3 Markdown link scan passed (`All relative Markdown links resolve.`); stale-path search found no references to the removed files. Code checks were skipped because this was documentation-only.
- **Limitations:** the course context-manifest content is preserved inline in Evidence 003; no standalone `CONTEXT_MANIFEST.md` remains.

## 2026-09-29 — Extract Week 4 assignment and reliability guidance

- **Goal:** create a Week 4 checklist and detailed task guide from the supplied assignment, session material, AI API addendum, and provider-reliability addendum.
- **Prompt/spec references:** no separate implementation prompt applies; project boundary references are [base game spec](../specs/BASE_GAME_SPEC.md), [tool contract](../specs/TOOL_CONTRACT.md), and [mock Hint prompt](../prompts/week3/BUILD_PROMPT_FINAL_VERSION.md).
- **Course sources reviewed:** [W04 assignment](</home/matija/Downloads/SITA_AI_Bootcamp_2026_W04_Assignment_Reliable_AI_Integration.md>), [provider errors and fallback](</home/matija/Downloads/week-04-provider-errors-reliability-and-fallback.md>), [AI API integration addendum](</home/matija/Downloads/week-04-ai-api-integration-addendum.md>), [W04 Session 1 material](</home/matija/Downloads/week-03-week-04-materials-package/week-03-week-04-pdf-review/materijali-za-studente/week-04-session-01-session-material.md>).
- **Evidence created:** [Week 4 checklist](checklists/WEEK04_RELIABLE_AI_INTEGRATION_CHECKLIST.md) and [detailed task guide](checklists/WEEK04_RELIABLE_AI_INTEGRATION_GUIDE.md).
- **Outcome:** extracted scenario design, contracts, trust boundaries, runtime/schema/semantic validation, error classification, retry versus fallback, offline fake testing, privacy, evidence, demo, rubric, and stretch boundaries. Live provider/backend requirements are labeled course-specific and out of scope under the current project contract.
- **Verification:** Python 3 link scan passed (`All relative and absolute local Markdown links resolve.`). Code checks were skipped because this was documentation-only.
- **Limitations:** checklist statuses are pending; the current implementation has not been re-audited.

## 2026-09-29 — Restore repository context manifest

- **Goal:** provide a repository-level map of actual context files, their usual inclusion, source priority, and default exclusions.
- **Prompt/spec references:** no standalone prompt artifact applies; followed the user's request, [`AGENTS.md`](../../AGENTS.md), the [instruction index](../INSTRUCTIONS.md), and the [workflow guidance](../instructions/05-workflow-tracking-and-reporting.md).
- **Evidence used/updated:** reviewed the current repository file list and existing project guidance; created [context manifest](CONTEXT_MANIFEST.md) and linked it from the [instruction index](../INSTRUCTIONS.md).
- **Outcome:** restored the manifest while distinguishing stable repository mapping from task-specific context records. Updated workflow guidance so actual sources used/excluded remain recorded per task.
- **Verification:** Python 3 Markdown link scan passed (`All relative Markdown links resolve.`); `git diff --check` passed. Code checks skipped because this was documentation-only.
- **Limitations:** a listed source is not evidence it was included or reviewed for a particular task.

## 2026-09-29 — Standardize evidence and tracking workflow

- **Goal:** make Evidence 003–005 follow one controlled-change structure and clarify where specifications, prompts, evidence, AI usage, and work-log facts belong.
- **Prompt/spec references:** no standalone prompt artifact applied; followed the user's request, [workflow guidance](../instructions/05-workflow-tracking-and-reporting.md), [testing guidance](../instructions/04-testing-and-verification.md), and relevant [specs](../specs/).
- **Evidence used/updated:** reorganized [Evidence 003](evidence/EVIDENCE_003.md), [Evidence 004](evidence/EVIDENCE_004.md), and [Evidence 005](evidence/EVIDENCE_005.md); historical missing baseline details in Evidence 005 remain explicitly unrecorded.
- **Outcome:** standardized record/context, baseline, frozen eval scenarios, controlled change, after-verification, and limitations. Added [prompt](../prompts/PROMPT_TEMPLATE.md) and [evidence](evidence/EVIDENCE_TEMPLATE.md) templates, defined record ownership and the same-before/after eval rule in workflow guidance, and clarified the testing guide. Normalized the AI usage log while marking uncaptured historical prompt/review details.
- **Verification:** Python 3 Markdown link scan passed (`All relative Markdown links resolve.`); no trailing whitespace found; `git diff --check` passed. Code checks skipped because this was documentation-only.
- **Limitations:** historical E005 has no immediate pre-refactor test output or immutable source revision; E005 therefore reports after-only checks for new server capabilities. Older prompt artifacts remain historical and do not retroactively meet the new template.

## 2026-09-29 — Simplify prompt template

- **Goal:** keep prompt versioning minimal and separate prompt-writing guidance from evidence/reporting requirements.
- **Prompt/spec references:** no standalone prompt artifact applies; followed the user's clarification and the [tracking workflow](../instructions/05-workflow-tracking-and-reporting.md).
- **Evidence used/updated:** simplified [prompt template](../prompts/PROMPT_TEMPLATE.md); evidence and reporting requirements remain in the [evidence template](evidence/EVIDENCE_TEMPLATE.md) and workflow.
- **Outcome:** reduced prompt metadata to a single version label (`v1`, incrementing on revision); retained goal, context priority, scope/constraints, allowed files, acceptance criteria, and verification guidance; removed evidence/reporting fields.
- **Verification:** Python 3 Markdown link scan passed (`All relative Markdown links resolve.`); no trailing whitespace found; `git diff --check` passed. Code checks skipped because this was documentation-only.
- **Limitations:** no historical prompt artifacts were rewritten or retroactively versioned.

## 2026-09-29 — Bring Spec Kit and Gemini planning artifacts onto main

- **Goal:** retain useful workflow and security artifacts from `test` while preserving `main`'s implemented powerups/perks specifications and evidence.
- **Prompt/spec references:** [Gemini Hint prompt](../prompts/week4/BUILD_PROMPT_GEMINI_HINT_V1.md), [Gemini integration plan](../specs/GEMINI_HINT_INTEGRATION.md), [security instructions](../instructions/03-ai-hint-and-security.md), and the project instruction index.
- **Evidence used/updated:** [Evidence 008](evidence/EVIDENCE_008.md); `main`'s existing Evidence 006–007 remain authoritative for the powerups/perks implementation.
- **Outcome:** added Spec Kit skills/scaffolding, Gemini security/reliability planning and push guard, and updated Week 4 guidance. Excluded the stale broad powerups research draft because it includes mechanics outside the implemented Phase 1 scope. Kept the base game spec unchanged.
- **Verification:** `npm run security:scan` passed; the configured pre-push hook scanned 3 outgoing and 7 additional locally reachable commits; `git diff --cached --check` passed; all Markdown links in 28 changed files resolve. Application tests/build were skipped because no application implementation changed. No live provider code or credentials were added.
- **Limitations:** Gemini provider implementation remains pending; the push scanner detects known patterns and cannot prove absence of unknown credential formats.

## 2026-09-30 — Replace movement Hint with shop AI advice

- **Goal:** implement read-only shop recommendations with structured validation, bounded Gemini retries, and an approved lower-cost fallback model.
- **Starting state:** clean `main` at `ba3174e`; current browser Hint uses a local fake model for movement advice. The shop and perk purchases already exist.
- **Prompt/spec/evidence:** user request and pending user system prompt; [Shop AI Advisor spec](../../specs/002-shop-advisor/spec.md), the existing [Gemini integration plan](../specs/GEMINI_HINT_INTEGRATION.md), and [Evidence 009](evidence/EVIDENCE_009.md).
- **Acceptance checks:** legal and current buy/wait advice only; no automatic purchases; bounded attempts and deadline; safe unavailability; server-only key; offline fake transport; required typecheck, tests, build, and security scan.
- **Baseline:** `npm run typecheck` passed; `npm test` passed 33/33; `npm run build` passed (Vite 6.4.3, 9 modules). No live provider or shop advisor is implemented yet.
- **Decision:** user confirmed a free-tier model pair; researching Gemini 3.8 Flash primary and Gemini 3.5 Flash-Lite fallback. Exact project quotas are unknown until viewed in the user's AI Studio account.
- **Outcome:** Spec Kit feature 002, the paused shop endpoint, server-only Gemini transport, exact decision validation, bounded retry/fallback, asynchronous shop UI, and security/documentation updates are implemented offline. The active movement-Hint path and its obsolete tests were replaced. The user approved [system prompt v1](../prompts/week4/SHOP_ADVISOR_SYSTEM_PROMPT_V1.md), and it is active in `server/ai/shopPrompt.ts`.
- **Verification:** initial implementation typecheck passed; full suite passed 44/44; production build passed; `npm run security:scan` and a simulated configured pre-push hook passed; `git diff --check` and changed-Markdown link scan passed. See [Evidence 009](evidence/EVIDENCE_009.md) for subsequent retry-policy and prompt-approval checks. No real key or live provider call was used.
- **Limitations / next step:** browser runtime had no available browser for visual QA. Live Gemini behavior, real latency, and exact project quotas remain unverified. The model-selection UI preference was asked; current implementation automatically selects the two server-side models.
- **Reliability revision:** user set two 10-second Flash calls, then up to three 10-second Flash-Lite calls, with 1/3/5/5-second delays. Two transient Flash failures now open a process-local 15-minute congestion window that sends following requests directly to Flash-Lite. The overall bound is 65 seconds. Added a separate [system-prompt draft](../prompts/week4/SHOP_ADVISOR_SYSTEM_PROMPT_V1.md) for user review before runtime adoption.
- **Reliability revision verification:** typecheck passed; full suite passed 47/47; production build, worktree security scan, and `git diff --check` passed. Fake transport tests cover exact order, delays, congestion skip/expiry, and the five-call cap. Live latency and provider behavior remain unverified.
- **Prompt approval:** user approved system prompt v1. Integrated it with accurate current rules; completed Spec Kit T011 and T020. Final verification recorded in Evidence 009 iteration 3.

## 2026-09-30 — Document secret-safe local Gemini setup

- **Goal:** explain how to run the backend with `GEMINI_API_KEY` while keeping the key out of project files and the browser.
- **Prompt/spec/evidence:** current user request; [shop security instructions](../instructions/03-ai-hint-and-security.md), [Gemini plan](../specs/GEMINI_HINT_INTEGRATION.md), and [Evidence 009](evidence/EVIDENCE_009.md).
- **Outcome:** added hidden-input Bash and PowerShell commands plus cleanup steps to the README; linked the setup from the feature quickstart, and documented why backend-only runtime configuration protects secrecy.
- **Verification:** changed-Markdown relative links resolve; `git diff --check` passed. Application tests/build were skipped because this was documentation-only.
- **Limitations:** no key was provided, read, or used; the live provider path remains unverified.

## 2026-09-30 — Start Gemini Hint reliability V2

- **Goal:** add sanitized provider-attempt telemetry, separate structured-output failure coverage, safe `Retry-After` handling, and Gemma 4 as a final fallback using a 1/2/3 attempt chain.
- **Starting state:** existing dirty `main` worktree containing the uncommitted shop-advisor feature; user and unrelated changes are preserved. Baseline typecheck and 18 focused shop-advisor tests pass.
- **Prompt/spec/evidence:** [build prompt v2](../prompts/week4/BUILD_PROMPT_GEMINI_HINT_CHANGES_V2.md), [Gemini Hint Changes V2](../specs/GEMINI_HINT_CHANGES_V2.md), and [Evidence 010](evidence/EVIDENCE_010.md).
- **Acceptance checks:** exact Flash ×1 → Flash-Lite ×2 → Gemma ×3 routing; separate Gemma adapter; bounded timeout/deadline/backoff; safe `Retry-After`; one redacted structured event per attempt; four distinct output-failure tests; full project/security verification.
- **Limitations:** no credential or secret file will be read and no live provider call is authorized; real availability, quality, latency, and account limits remain unverified.
- **Outcome:** completed the [V2 plan](../specs/GEMINI_HINT_CHANGES_V2.md). The server now uses Flash ×1, Flash-Lite ×2, then Gemma 4 ×3; Gemma has a separate text-JSON capability branch; long `Retry-After` values skip same-model retries; two transient Flash failures accumulate across requests; and every attempt produces a sanitized structured JSON log with normalized usage when available.
- **Verification:** `npm run typecheck`, `npm test` (55/55), `npm run build`, `npm run security:scan`, `git diff --check`, the configured pre-push guard, and a 57-file Markdown link scan passed. Detailed scenario results are in [Evidence 010](evidence/EVIDENCE_010.md).
- **Remaining limits:** no live provider or browser manual check was run. Model availability, generated advice quality, real latency, and account-specific limits remain unverified.

## 2026-09-30 — Final review cleanup and verification

- **Goal:** remove credential-exposure wording from project records, keep the approved private identity/contribution record, and reconcile active model allowlist documentation with the implemented chain.
- **Files updated:** the active Gemini build prompt, shop-advisor plan/evidence, AI usage log, and browser model label. Credential values and claims about credentials appearing in chat were removed from project records; no secret files were opened.
- **Verification:** `git diff --check`, `npm run typecheck`, `npm test` (55/55), `npm run build`, and `npm run security:scan` all passed with elevated local-server/git permissions. The earlier HTTP test and security failures were sandbox permission failures, not application assertion failures.
- **Outcome:** documentation now consistently describes Flash ×1 → Flash-Lite ×2 → Gemma ×3; Gemma is displayed with its own label; runtime allowlist tests and safe failure tests remain green.
- **Manual verification update:** the user manually checked gameplay, shop behavior, and the live provider flow in the browser and reported that they work correctly. This closes the browser and exercised-live-path gaps as user-reported evidence. Forced provider failures and full fallback reliability remain covered by offline fake tests.

## 2026-10-07 — Start Week 05 Shop Strategist (spec)

- **Goal:** extend the W04 shop advisor into a bounded agentic run (read-only tools, validated proposals, step/tool/deadline limits) per the W05 assignment and addendum.
- **Starting state:** `main` at `4c99cc3` (W04 review-fix PR merged); new branch `week05-shop-agent`; no W05 code yet.
- **Prompt/spec/evidence:** [spec](../../specs/003-shop-agent/spec.md), [flow](../../specs/003-shop-agent/agent-flow.md), [tool contracts](../../specs/003-shop-agent/contracts/tool-contracts.md), [HTTP contract](../../specs/003-shop-agent/contracts/shop-agent-api.md), [frozen evals](../../specs/003-shop-agent/evals.md). No standalone prompt artifact yet; no evidence record yet.
- **Outcome:** spec drafted from an interactive design session (approach A: new `server/agent/` module, JSON envelope for all models, fixed-enum goal, layered Core + `get_recent_runs` + one revise). Awaiting review before the implementation plan.
- **Verification:** documentation only; code checks not applicable. No key was read or used.
- **Limitations:** history hook points in `GameSessionManager` and initial limit values are unconfirmed until the plan; live provider quality is unverified.

## 2026-10-07 — Week 05 Shop Strategist implemented (fake-provider verified)

- **Goal:** implement the approved spec and plan in `specs/003-shop-agent/`.
- **Outcome:** `server/agent/` module (types, perk evaluator, tool registry, final-result validation, orchestrator with budgets and retry/fallback, Google transport, facade), `POST /api/games/:id/shop-agent`, per-container run history, Shop Strategist panel, `AGENTS.md` and `TOOL_CONTRACT.md` updated, README section, `npm run agent:live` smoke script.
- **Prompt/spec/evidence:** [spec](../../specs/003-shop-agent/spec.md), [plan](../../specs/003-shop-agent/plan.md), [Evidence 014](evidence/EVIDENCE_014.md). No standalone prompt artifact.
- **Verification:** `npm run typecheck`, `npm test` (119/119, 64 new), `npm run build`, `npm run security:scan` all exit 0; live script refuses to run without `AGENT_LIVE=1`.
- **Rulings:** (1) the history entry stores `perksAtEnd` instead of `perksBought` because the engine does not track purchases per game; (2) `completed:false` is rejected as an unusable final; (3) the plan test compared W04 `extractUsage` output with `deepEqual`, but it returns undefined-valued keys, so the test compares the three token fields individually; (4) spec/contract wording updated to match.
- **Limitations:** no live provider run and no browser check yet (needs the user's free-tier key); no browser E2E for the new panel.
- **Next step:** user runs L01 and the manual browser check, then records them in Evidence 014; then push the branch to the user's fork and open a PR if wanted.
- **Whole-branch review (fresh reviewer):** no Critical findings. Fixed: output-token cap 512 → 2048. Deferred minors: disconnect-before-listener race (httpServer, same pattern in W04), busy message wording, score-0/level-1 restarts recorded in history, bidi/C1 characters pass the text filter. Accepted per spec: `summary`/`finding` are bounded model prose not checked against tool results (FR-020).

## 2026-10-07 — Shop Strategist live run (L01)

- **Outcome:** user ran `AGENT_LIVE=1 npm run agent:live` with their own free-tier key: `completed`, 4 steps, 3 tool calls, 6 provider attempts, 24 717 ms; `gemini-3.8-flash` timed out twice (408) and the run fell back to `gemini-3.5-flash-lite`; plan `extra_xp, extra_xp` (3 of 3 points). Details in [Evidence 014](evidence/EVIDENCE_014.md).
- **Limitations:** one run, one scenario, one answering model; browser check still pending. No key was read or stored by the assistant; the user's earlier mis-pasted value caused one `unauthorized` run that stopped safely.

## 2026-10-07 — Best Game Phase 1 spec

- **Goal:** merge the user's private `feature/modern-graphics` (Canvas renderer, sound, records, accessibility) into the team game, delivered in two phases; Phase 1 = visuals and client features with no server change.
- **Starting state:** branch `best-game-phase1` cut from `main` (`7e92b6f`); user branch fetched read-only as local ref `modern-graphics-src` (not pushed).
- **Prompt/spec/evidence:** [spec](../../specs/004-best-game-phase1/spec.md). No prompt artifact, no evidence yet.
- **Outcome:** spec drafted from an interactive design session (approach A: snapshot adapter in front of the renderer; countdown, difficulty presets and input buffer client-side).
- **Verification:** documentation only; code checks not applicable.
- **Limitations:** implementation plan not written; `AGENTS.md` contract change is a requirement (FR-014), not done yet.
