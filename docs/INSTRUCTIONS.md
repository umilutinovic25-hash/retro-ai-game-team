# RETRO SNAKE Instruction Index

Use this index to load only the project guidance relevant to the task. `AGENTS.md` is the short, always-on contract; these modules add focused detail. Project specifications define intended product behavior, while tracking files record work and evidence.

## Instruction modules

1. [Project architecture and game rules](instructions/01-project-architecture.md) — state ownership, rendering, game scope, and runtime configuration.
2. [Code conventions](instructions/02-code-conventions.md) — TypeScript, Vite, DOM/CSS, dependencies, and change scope.
3. [Shop AI advice and security](instructions/03-ai-hint-and-security.md) — the sole active AI flow, trust boundaries, privacy, and safe failure.
4. [Testing and verification](instructions/04-testing-and-verification.md) — test expectations, commands, evidence, and honest reporting.
5. [Workflow, tracking, and reporting](instructions/05-workflow-tracking-and-reporting.md) — task intake, work log, evidence updates, and report-ready handoff.

## Routing

| Task | Read |
|---|---|
| Game rules, state transitions, rendering, configuration | 01, 02, 04; `specs/BASE_GAME_SPEC.md` and the relevant accepted feature spec |
| Shop AI advice, Gemini provider, security | 03, 04; `specs/TOOL_CONTRACT.md`, `specs/GEMINI_HINT_INTEGRATION.md`, `../specs/002-shop-advisor/`, accepted prompt |
| Tests, evals, failure investigation | 04, 05; relevant files under `tracking/` |
| Documentation, project instructions, task handoff | 05 and the relevant source/spec |
| Any larger or cross-cutting change | 01–05 as relevant; summarize the plan before editing |

## Project source of truth

The precedence for product behavior is: current user request → `AGENTS.md` project contract → `specs/BASE_GAME_SPEC.md` plus any accepted feature spec → `specs/TOOL_CONTRACT.md` and accepted prompt → implementation and tests → runtime input. Course handouts and review notes are references; they do not expand project scope.

## Repository documentation map

| Area | Location | Purpose |
|---|---|---|
| Base game specification | [`specs/BASE_GAME_SPEC.md`](specs/BASE_GAME_SPEC.md) | Existing core rules, configuration, Definition of Done, and base-game scope |
| XP, perks, and Lucky pickup feature | [`../specs/001-powerups-perks/`](../specs/001-powerups-perks/) | Phase 1 requirements, plan, data model, API contract, quickstart, and tasks; see Evidence 006–007 for implementation status |
| Shop AI Advisor feature | [`../specs/002-shop-advisor/`](../specs/002-shop-advisor/) | Shop advice specification, model research, contract, implementation plan, quickstart, and tasks |
| Best Game Phase 1 | [`../specs/004-best-game-phase1/`](../specs/004-best-game-phase1/) | Canvas visuals and client features on the server-authoritative game |
| Server refactor plan | [`specs/REFACTOR_PLAN.md`](specs/REFACTOR_PLAN.md) | Accepted client/server architecture, task checklist, and validation record |
| Shop state contract | [`specs/TOOL_CONTRACT.md`](specs/TOOL_CONTRACT.md) | Read-only shop context, structured decision, and failure policy |
| Gemini shop advisor plan | [`specs/GEMINI_HINT_CHANGES_V2.md`](specs/GEMINI_HINT_CHANGES_V2.md) | Current approved model chain, telemetry, retry/fallback policy, tasks, and acceptance criteria |
| Build prompts and template | [`prompts/`](prompts/) | Versioned task prompts; use [`prompts/PROMPT_TEMPLATE.md`](prompts/PROMPT_TEMPLATE.md) for new artifacts |
| Work log | [`tracking/WORK_LOG.md`](tracking/WORK_LOG.md) | Chronological work, decisions, checks, and next steps |
| Context manifest | [`tracking/CONTEXT_MANIFEST.md`](tracking/CONTEXT_MANIFEST.md) | Actual repository source map, task selection guidance, source priority, and default exclusions |
| AI usage log | [`tracking/AI_USAGE_LOG.md`](tracking/AI_USAGE_LOG.md) | Significant AI-assisted decisions; no private chain-of-thought |
| Core baseline and regression evals | [`tracking/evidence/EVIDENCE_003.md`](tracking/evidence/EVIDENCE_003.md) | Historical core baseline and frozen regression scenarios |
| Hint controlled-change evidence | [`tracking/evidence/EVIDENCE_004.md`](tracking/evidence/EVIDENCE_004.md) | Historical mock movement-Hint baseline and evals |
| Server refactor evidence | [`tracking/evidence/EVIDENCE_005.md`](tracking/evidence/EVIDENCE_005.md) | Server refactor scenarios, after results, and explicit missing pre-run limitation |
| XP/perks planning evidence | [`tracking/evidence/EVIDENCE_006.md`](tracking/evidence/EVIDENCE_006.md) | Phase 1 scope, frozen scenarios, documentation checks, and implementation status |
| Luck/Lucky pickup evidence | [`tracking/evidence/EVIDENCE_007.md`](tracking/evidence/EVIDENCE_007.md) | Luck perk, orange pickup, deterministic spawn/reward cases, and implementation checks |
| Gemini security/integration evidence | [`tracking/evidence/EVIDENCE_008.md`](tracking/evidence/EVIDENCE_008.md) | Gemini plan, security checks, pre-push guard, and current implementation limits |
| Shop advisor implementation evidence | [`tracking/evidence/EVIDENCE_009.md`](tracking/evidence/EVIDENCE_009.md) | Shop advice baseline, frozen scenarios, implementation checks, and limitations |
| Evidence template | [`tracking/evidence/EVIDENCE_TEMPLATE.md`](tracking/evidence/EVIDENCE_TEMPLATE.md) | Reusable record format for baseline, frozen evals, controlled iterations, actual checks, and limitations |
| Future task evidence | [`tracking/evidence/`](tracking/evidence/) | Use the common baseline → frozen evals → controlled iteration → same before/after evals → limitations structure |
| Exercise review | [`tracking/checklists/WEEK03_EXERCISE_REVIEW.md`](tracking/checklists/WEEK03_EXERCISE_REVIEW.md) | Week 3 audit checklist; items remain pending until checked |
| Week 4 checklist | [`tracking/checklists/WEEK04_RELIABLE_AI_INTEGRATION_CHECKLIST.md`](tracking/checklists/WEEK04_RELIABLE_AI_INTEGRATION_CHECKLIST.md) | Project-adapted Week 4 acceptance checklist |
| Week 4 task guide | [`tracking/checklists/WEEK04_RELIABLE_AI_INTEGRATION_GUIDE.md`](tracking/checklists/WEEK04_RELIABLE_AI_INTEGRATION_GUIDE.md) | Detailed course extraction, project mapping, work plan, and evidence instructions |
| Weekly reports | [`tracking/reports/`](tracking/reports/) | Existing report and reusable report template |
| Detailed instructions | [`instructions/`](instructions/) | Focused agent guidance by subject |

Update the smallest owning file when a rule changes. Keep evidence and activity records separate from specifications and permanent instructions. Use the workflow guide to keep spec, prompt, evidence, AI usage, work log, and report responsibilities distinct. Evals and task-specific context notes belong inside task evidence; the context manifest is only a stable map of repository sources and does not replace those records.
