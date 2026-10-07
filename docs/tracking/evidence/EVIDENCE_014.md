# Evidence 014 — Week 05 Shop Strategist (bounded agentic feature)

Preserves the facts of this milestone. Anything not captured is marked **not recorded**. One live-provider run (L01) was done on 2026-10-07 by the user with their own free-tier key; the manual browser check was not yet done when this record was written.

## Record and task context

- **Purpose / accepted goal:** extend the W04 shop advisor into a bounded, read-only agentic run: the model proposes tool calls, the backend validates and executes allowlisted tools, validates results, and returns a validated structured plan. The model never buys or mutates anything.
- **Governing spec/task plan:** [spec](../../../specs/003-shop-agent/spec.md), [agent flow](../../../specs/003-shop-agent/agent-flow.md), [tool contracts](../../../specs/003-shop-agent/contracts/tool-contracts.md), [HTTP contract](../../../specs/003-shop-agent/contracts/shop-agent-api.md), [frozen evals](../../../specs/003-shop-agent/evals.md), [implementation plan](../../../specs/003-shop-agent/plan.md).
- **Exact prompt artifact and version:** no standalone prompt artifact; work followed the approved spec and plan. The runtime system prompt is `server/agent/prompt.ts` (`AGENT_SYSTEM_PROMPT`).
- **Starting source/revision or working-tree state:** `main` at `4c99cc3` (W04 review-fix PR merged), branch `week05-shop-agent`, clean tree.
- **Sources actually used:** W05 assignment PDF and addendum, existing W04 code (`server/ai/*`, `server/gameSession.ts`, `server/httpServer.ts`, client UI), `AGENTS.md`, workflow/testing instructions.
- **Relevant sources excluded and why:** `.env` and any credential store (never opened, per project rules).
- **Conflict priority and risks:** spec over plan over executor judgment. Rulings are in the work log.
- **Scope / out of scope:** read-only tools, fixed-enum goal, same Google model chain. No write/purchase actions, no new provider, no persistent history, no browser E2E.

## Baseline

- **New capability:** the agentic run did not exist before this milestone. All eval cases below are `N/A — capability absent` at baseline.
- **Starting verification state:** the baseline test command was not re-run before starting (the clone had no `node_modules`; `npm ci` was run first). First recorded green run: after Task 1, `npm test` with 0 failures. Earlier counts for the W04 suite are in Evidence 010–013 (55/55 at W04).

## Frozen eval scenarios and before/after results

Definitions are frozen in [evals.md](../../../specs/003-shop-agent/evals.md). All run on the scripted fake transport and in-process game (no network, no key).

| ID | Scenario / input | Expected | Baseline | After | Test (file → name) |
|---|---|---|---|---|---|
| E01 | get_shop_state → evaluate_perk_plan → final | completed, 3 steps, 2 tools | N/A | pass | `agentOrchestrator` → E01 success |
| E02 | unknown tool (also `constructor`, `__proto__`, non-string) | `unknown_tool`, 0 tool calls | N/A | pass | `agentOrchestrator` → E02; `agentTools` → lookup |
| E03 | bad evaluate arguments (enum, length, extra/proto key) | `invalid_tool_arguments`, 0 tool calls | N/A | pass | `agentOrchestrator` → E03/E15; `agentTools` |
| E04 | malformed envelopes / invalid structured output | rejected, nothing runs | N/A | pass | `agentOrchestrator` → E04; `agentReliability` → invalid structured output |
| E05 | tool throws, returns wrong shape or oversized result | `tool_failed`, nothing reaches the model | N/A | pass | `agentOrchestrator` → E05 |
| E06 | provider 400/401/403 | exactly 1 attempt, `provider_failed` | N/A | pass | `agentReliability` → E06 |
| E07 | 429 then success; 503 then fallback; persistent failures; Retry-After | bounded backoff and fallback within shared budget | N/A | pass | `agentReliability` → E07 (4 tests), Retry-After, capability, shared budget |
| E08 | provider never answers | abort propagates, `deadline` | N/A | pass | `agentReliability` → E08 |
| E09 | same tool+args twice at one state version | `repeated_action` | N/A | pass | `agentOrchestrator` → E09 |
| E10 | tool budget, evaluator cap, step limit | `tool_call_limit` / `step_limit`, no further call | N/A | pass | `agentOrchestrator` → E10 |
| E11 | premature final, invented evidence, no evidence, unevaluated plan, `completed:false`, control chars | `invalid_model_proposal`, no result | N/A | pass | `agentOrchestrator` → E11; `agentFinal` |
| E12 | client cancels mid-run | provider call aborted, `cancelled` | N/A | pass | `agentReliability` → E12 |
| E13 | injected text in a tool result | allowlist/limits unchanged, `buy_perk` → `unknown_tool` | N/A | pass | `agentOrchestrator` → E13 |
| E14 | rejected plan then corrected plan | 2 evaluator calls, completed; third refused | N/A | pass | `agentOrchestrator` → E14, E10 (evaluator cap) |
| E15 | `get_recent_runs` limit 6 / `"2"` / missing | `invalid_tool_arguments`, 0 tool calls | N/A | pass | `agentOrchestrator` → E03/E15; `agentTools` |
| E16 | claims about past games with empty vs real history | rejected vs accepted | N/A | pass | `agentOrchestrator` → E16; `agentFinal`; `runHistory` |
| E17 | purchase / resume / restart during the run | `stale`, result discarded | N/A | pass | `agentOrchestrator` → E17 |
| E18 | nothing affordable | completed, empty plan | N/A | pass | `agentOrchestrator` → E18/E19 |
| E19 | all perks capped | completed, empty plan | N/A | pass | `agentOrchestrator` → E18/E19 |
| E20 | unknown game / not paused / extra body field / concurrent run | 404 / 409 / 400 / busy, 0 extra provider calls | N/A | pass | `agentHttp` → preflight, no provider, busy |
| E21 | invariant: game unchanged by any run | revision and perk state identical | N/A | pass | asserted in every `agentOrchestrator` run (`run()` helper) and in `agentHttp` success test |
| L01 | one live run on a seeded paused shop, free-tier key | recorded: date, status, duration, steps, tools, outcome | N/A | pass (one run) | see L01 below |

## Controlled change — iteration 1

- **Hypothesis / reason:** a validated, budgeted, tool-proposal loop on top of the W04 provider boundary meets the W05 acceptance list without weakening W04.
- **Single bounded change:** new `server/agent/` module, one HTTP route, one UI panel, in-memory run history, shared types in `src/ai/shopAgent.ts`. W04 `server/ai/geminiTransport.ts` only gained `export` keywords on six helpers.
- **Files changed:** see `git log 4c99cc3..HEAD` below.
- **Out of scope preserved:** no write actions, no new provider, no persistence.

Commits (oldest first): `5af40a7` spec, `c2523e4` plan, `52dc51c` shared types + evaluator, `e632534` run history, `93b553a` tool registry, `6123a99` final-result validation, `a46e27a` orchestrator, `be33895` retry/fallback/deadline, `119cd86` Google transport + prompt, `2d487a9` HTTP route, `c4adf7d` client + UI, `1ce5ba5` contract and spec reconciliation.

## After verification

Run from the repository root on branch `week05-shop-agent` after the last code commit (output kept in a local, git-ignored file, not committed):

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | no errors |
| `npm test` | 0 | tests 119, pass 119, fail 0 |
| `npm run build` | 0 | Vite build succeeded |
| `npm run security:scan` | 0 | "Pre-push security scan passed: no known credential patterns or client secret references found." |
| `npm run agent:live` (without `AGENT_LIVE=1`) | 2 | refuses to run: "Set AGENT_LIVE=1 to run one live agent run" |

Per-file new test counts: `agentPerkRules` 6, `runHistory` 5, `agentTools` 5, `agentFinal` 9, `agentOrchestrator` 14, `agentReliability` 12, `agentGoogleTransport` 5, `agentHttp` 5, `shopAgentClient` 3 (64 new tests; the W04 suite was untouched and still passes).

Each task also followed red/green: every new test file was run first and failed for the expected reason (module or method missing, or retry logic absent) before the implementation was written; the one test defect found is a ledgered ruling in the work log.

### L01 live run

Run by the user with their own free-tier key held only in the terminal (`AGENT_LIVE=1 npm run agent:live`). Recorded facts only (no key, no prompt):

- **Date:** 2026-10-07. **Count against budget:** 2 of 15 development runs (the first attempt was rejected with HTTP 401 `unauthorized` after one provider call, ended `provider_failed` with 0 steps and no retry, as designed, because the pasted value was not a valid key).
- **Successful run:** status `completed`, stop reason `completed`, 4 steps, 3 tool calls (`get_shop_state`, `evaluate_perk_plan`, `evaluate_perk_plan`), 6 provider attempts, 24 717 ms.
- **Models:** `gemini-3.8-flash` timed out twice (HTTP 408 after the 10 s per-call limit), then the run fell back to `gemini-3.5-flash-lite`, which answered all 4 steps (latency 842, 1085, 890, 1006 ms) and stayed selected.
- **Result:** plan `[extra_xp, extra_xp]`, plan line `PLAN: EXTRA XP → EXTRA XP · COST 3 PT · 0 PT LEFT.` The seeded game had 3 perk points, so the plan is valid. Final step used 111 output tokens (cap 2048).
- **What it shows:** the JSON-envelope prompt, strict validation, evaluator-backed plan, fallback after provider timeouts and the shared budget all work against the real chain for this scenario.

### Manual browser check

**User-reported pass (2026-10-07):** the user opened the running game, tried the Shop Strategist in the browser, and confirmed that it works. In the requested flow, the plan appeared and no perk was automatically purchased. This is learner-reported manual evidence; no screenshot or independent browser automation was captured for this check.

## Honest limitations

- Everything above is fake-provider testing. It shows orchestration, validation, limits and failure handling, not live model quality, latency or free-tier quota behaviour.
- Live evidence is one successful run on one model (`gemini-3.5-flash-lite`) in one seeded scenario. `gemini-3.8-flash` timed out in that run, so its behaviour with this prompt is unobserved, and `gemma-4-26b-a4b-it` was never called live.
- After the whole-branch review, `maxOutputTokens` was raised from 512 to 2048 (test `agentGoogleTransport` → output-token budget, RED then GREEN) because thinking tokens count against the cap; whether 2048 is enough for the real models is still to be confirmed by L01.
- Review findings deliberately not fixed (model prose is not checked against tool results, per FR-020; disconnect race window; busy-message wording; trivial restarts recorded in history; bidi/C1 characters pass the text filter) are listed in the work log.
- The tool-time check (200 ms) is an elapsed-time guard after a synchronous call; synchronous pure tools cannot be interrupted.
- Run history is in memory, per container, last five, and lost on server restart.
- No browser E2E was added for the Strategist panel; UI behaviour is covered by typecheck, build and the pure validator tests only.
- The W04 baseline suite count was not re-run at the start of this milestone.
