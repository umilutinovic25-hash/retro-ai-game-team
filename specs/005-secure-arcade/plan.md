# Plan — 005 Secure the Arcade

1. Checkpoint (`05456e3`): 175/175 tests, build OK, `npm audit --omit=dev` 0, e2e 18/18.
2. Inventory (done, see `EVIDENCE_W08.md` §2): W05 already had exact-key schemas, a closed tool registry, result validation, step/tool/attempt/deadline budgets and `textContent` rendering. Gaps found: no process-wide concurrency/rate limit, no Origin/Host/Content-Type guard, no security headers or production server, no security event log, no test of the above.
3. New module `server/security/` (limits, admission, guards, securityLog, staticFiles); `httpServer.ts` wires them in front of the existing handlers. Initial phase left the agent/tools/prompt/game engine unchanged; later targeted agent/provider fixes are recorded below.
4. Tests first for each gap (`tests/security/*`, `scripts/e2e/secureArcade.e2e.ts`), then implementation until green; existing tests stay unchanged except two that posted JSON as `text/plain` (now sent as `application/json`).
5. Evidence: pre/post probe against the baseline commit, dependency audit and its fix, `EVIDENCE_W08.md`.

## Review follow-up (2026-10-27)

New frozen regressions in agentBoundary.test.ts cover total deadline at -1/0/+1 ms for tool dispatch and final acceptance, and cancellation during provider resolution. websocketBoundary.test.ts probes malformed upgrade paths in a child process, then HTTP health and a valid snapshot stream. All four failed before the changes. Scope: agent/orchestrator.ts, agent/attempt.ts and HTTP upgrade parsing; existing engine/tool capabilities unchanged. Evidence: EVIDENCE_W08.md review follow-up.

An additional T13 probe measured 12 unfinished calls from two admitted agent runs (cap 2), and 6 unfinished calls from one shop-advice run: retries bypassed admission. Freeze both probes in budget.test.ts; classify timeout as terminal only while its previous provider work remains unsettled, preserve cooperative retries, retain orphan accounting until settlement.

## Adjacent boundary follow-up

Frozen failing tests in coachBoundary.test.ts and staticBoundary.test.ts isolate the coach's separate timeout/cancellation/cache path and real-path serving escape. Limit changes to gameCoach.ts, security/staticFiles.ts and focused regressions. Retain 3500ms coach attempt deadline and existing model chain; canonical path checks must preserve normal public assets and safe in-root aliases. Verify all prior W05, browser/CSP and resource regression cases.

## Final completeness audit

Map assignment sections A–G, I1–I8, T00–T17, delivery/pair work and the single optional property challenge to actual source/tests in EVIDENCE_W08.md §9. Strengthen proof only: production native audio/Canvas under CSP (S2a), two-container numerical data isolation, direct HTTP provider/tool counters and streaming byte-boundary validation. Add README navigation. Recheck baseline source at 05456e3 in a disposable worktree using current dependencies; label retrospective verification separately from original evidence. Do not rewrite historical SDD chronology or invent human contributions.
