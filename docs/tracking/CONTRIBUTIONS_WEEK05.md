# Week 5 Contribution Record — Tim 1 (Retro Snake)

This record describes the W05 Shop Strategist implementation reviewed at commit `7e92b6f` on the official team repository's `main` branch. W05 work in this repository was an individual implementation; this record does not attribute unverified work from any separate project copy.

**Sources:** Git history on `main`, [Evidence 014](evidence/EVIDENCE_014.md), [Uroš's Week 05 report](reports/WEEKLY_REPORT_week05.md), and [WORK_LOG](WORK_LOG.md).

## Contribution map

| Area | Who | Where to verify |
|---|---|---|
| W05 Shop Strategist scenario selection, bounded scope and specification | Uroš Milutinović | `specs/003-shop-agent/spec.md`, `specs/003-shop-agent/plan.md`, commits `5af40a7`, `c2523e4` |
| Agent types, perk evaluator, run history, read-only tool registry, final-result validation and bounded orchestrator | Uroš Milutinović | `server/agent/`, `server/gameSession.ts`, `tests/agent*.test.ts`, commits `52dc51c` through `be33895` |
| Google provider transport, prompt, HTTP integration and Strategist UI | Uroš Milutinović | `server/agent/`, `server/httpServer.ts`, `src/ai/shopAgent.ts`, `src/api/gameClient.ts`, `src/main.ts`, commit `c4adf7d` and preceding W05 commits |
| Reliability correction after review, live smoke harness and L01 evidence | Uroš Milutinović | `server/agent/googleTransport.ts`, `scripts/live/agentSmoke.ts`, [Evidence 014](evidence/EVIDENCE_014.md), commits `a56ad40`, `dd26833`, `7e92b6f` |
| Manual browser acceptance | Uroš Milutinović (user-reported) | The user confirmed the Strategist plan appeared and no perk was purchased automatically; [Evidence 014](evidence/EVIDENCE_014.md) |
| W05 contribution to this implementation | Matija Radulović | No W05 authoring or review contribution is recorded in the reviewed W05 commit history. The team repository's `main` now contains the W05 implementation at `7e92b6f`; this record makes no claim about separate work outside this repository. |

## Attribution limits

- The W05 commits from the feature spec through the live-run evidence are authored under Uroš's Git identity; the commit history is directly verifiable.
- Matija's work on Week 04 is documented separately in [CONTRIBUTIONS_WEEK04.md](CONTRIBUTIONS_WEEK04.md). No separate Matija W05 artifact or contribution details were present in this repository when this record was prepared.
- The manual browser check is learner-reported; no screenshot or independent Strategist browser E2E run was saved.
