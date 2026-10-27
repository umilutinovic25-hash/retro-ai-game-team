# Plan — 005 Secure the Arcade

1. Checkpoint (`05456e3`): 175/175 tests, build OK, `npm audit --omit=dev` 0, e2e 18/18.
2. Inventory (done, see `EVIDENCE_W08.md` §2): W05 already had exact-key schemas, a closed tool registry, result validation, step/tool/attempt/deadline budgets and `textContent` rendering. Gaps found: no process-wide concurrency/rate limit, no Origin/Host/Content-Type guard, no security headers or production server, no security event log, no test of the above.
3. New module `server/security/` (limits, admission, guards, securityLog, staticFiles); `httpServer.ts` wires them in front of the existing handlers. No change to agent, tools, prompt or game engine.
4. Tests first for each gap (`tests/security/*`, `scripts/e2e/secureArcade.e2e.ts`), then implementation until green; existing tests stay unchanged except two that posted JSON as `text/plain` (now sent as `application/json`).
5. Evidence: pre/post probe against the baseline commit, dependency audit and its fix, `EVIDENCE_W08.md`.
