# Tasks — 005 Secure the Arcade

- [x] T-01 Checkpoint baseline (commit, commands, results)
- [x] T-02 Threat model, data inventory, six risks (`EVIDENCE_W08.md` §2)
- [x] T-03 Admission control: global concurrency 2, 5 per 60 s (`server/security/admission.ts`) — tests `budget.test.ts`
- [x] T-04 Request guards: Host, Origin (same-origin in prod), Content-Type, early body cap — tests `http.test.ts`
- [x] T-05 Security event log with closed field set — tests `leakage.test.ts`
- [x] T-06 Production server `--serve-dist` with active CSP + nosniff + no-referrer — `secureArcade.e2e.ts` S1–S4
- [x] T-07 Agent boundary regression tests (T06–T12) — `agentBoundary.test.ts`
- [x] T-08 Browser XSS/DOM, CSP block proof, forged localStorage, sentinel in dist — `secureArcade.e2e.ts` S2–S7
- [x] T-09 Dependency audit + non-forced in-range update (vite 6.4.3→6.4.5, source-map-js 1.2.1→1.2.2)
- [x] T-10 Evidence document
- [x] T-12 Second pass: security review, insecure-defaults audit, sharp-edges fixes (`resolveLimits`, dot-file deny, origin validation, default log), property test
- [ ] T-11 Pair review: second member challenges each claim with a new variant; swap roles
