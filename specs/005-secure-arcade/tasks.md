# Tasks — 005 Secure the Arcade

- [x] T-01 Checkpoint baseline (commit, commands, results)
- [x] T-02 Threat model, data inventory, six risks (`EVIDENCE_W08.md` §2–§3)
- [x] T-03 Admission control: global concurrency 2, 5 per 60 s (`server/security/admission.ts`) — tests `budget.test.ts`
- [x] T-04 Request guards: Host, Origin (same-origin in prod), Content-Type, early body cap — tests `http.test.ts`
- [x] T-05 Security event log with closed field set — tests `leakage.test.ts`
- [x] T-06 Production server `--serve-dist` with active CSP + nosniff + no-referrer — `secureArcade.e2e.ts` S1–S4
- [x] T-07 Agent boundary regression tests (T06–T12) — `agentBoundary.test.ts`
- [x] T-08 Browser XSS/DOM, CSP block proof, forged localStorage, sentinel in dist — `secureArcade.e2e.ts` S2–S7 (including S3b)
- [x] T-09 Dependency audit + non-forced in-range update (vite 6.4.3→6.4.5, source-map-js 1.2.1→1.2.2)
- [x] T-10 Evidence document — official 11-section Serbian template, ef3f6a5 results reverified 2026-10-27, repeatable demo in §8; solo authorship confirmed; unperformed pair-format requirement disclosed in T-11
- [x] T-12 Second pass: security review, insecure-defaults audit, sharp-edges fixes (`resolveLimits`, dot-file deny, origin validation, default log), property test
- [ ] T-11 Course pair-review/role-swap requirement was not performed: user confirmed individual W08 work on 2026-10-27. Explicitly disclosed in evidence/report; no second-member contribution or instructor-approved exception is claimed.

- [x] T-13 Adversarial review follow-up: absolute deadline/cancellation boundary checks; no overlapping retries after ignored abort (agent and advice); malformed WebSocket URL rejection. Eight new regression tests; before/after evidence in EVIDENCE_W08.md §6.

- [x] T-14 Adjacent boundary review: bounded coach cancellation/timeout and orphan accounting, success-only coach cache, resource/status checks before coach admission; canonical static symlink containment. Seven new tests in coachBoundary.test.ts/staticBoundary.test.ts; evidence F5–F8 in EVIDENCE_W08.md §6.

- [x] T-15 Full assignment completeness audit: map all required areas/invariants/T00–T17 and the optional challenge; add native production audio/Canvas proof, distinct two-container scope test, exact streaming size and real HTTP tool/provider counters. Final 225/225 full, 50/50 security, 18/18 W05 browser, 9/9 production browser. Preserve historical SDD chronology limitation in evidence §9.
- [x] T-16 Local delivery checkpoint: runtime/tests committed as cbc273c; documentation checkpoint recorded in the submission manifest. Individual report, PDF, reproducible source/Git package and ready-to-copy message prepared locally. No remote push or email sending implied.

- [x] T-17 Personal functional verification: user explicitly confirmed gameplay, controls, sound, shop and AI plan (H01). Added separate guided UI observation/screenshot V01. User explicitly chose fake-provider-only; no live run or Windows pass is claimed.
