# Week 5 Contribution Record — Tim 1 (Retro Snake)

The team completed two separate W05 implementations on individual branches. This record distinguishes Uroš's Shop Strategist on `main` from Matija's `PLAN DO +1 LIFE` workflow on `week05`; they are different bounded agentic scenarios, not shared authorship of the same feature.

**Sources:** Git histories on `main` and `week05`, [Evidence 014](evidence/EVIDENCE_014.md), [Uroš's Week 05 report](reports/WEEKLY_REPORT_week05.md), [Matija's Week 05 report](reports/WEEKLY_REPORT_week05_Matija.md), and [WORK_LOG](WORK_LOG.md).

## Contribution map

| Area | Who | Where to verify |
|---|---|---|
| W05 Shop Strategist scenario selection, bounded scope and specification | Uroš Milutinović | `specs/003-shop-agent/spec.md`, `specs/003-shop-agent/plan.md`, commits `5af40a7`, `c2523e4` |
| Agent types, perk evaluator, run history, read-only tool registry, final-result validation and bounded orchestrator | Uroš Milutinović | `server/agent/`, `server/gameSession.ts`, `tests/agent*.test.ts`, commits `52dc51c` through `be33895` |
| Google provider transport, prompt, HTTP integration and Strategist UI | Uroš Milutinović | `server/agent/`, `server/httpServer.ts`, `src/ai/shopAgent.ts`, `src/api/gameClient.ts`, `src/main.ts`, commit `c4adf7d` and preceding W05 commits |
| Reliability correction after review, live smoke harness and L01 evidence | Uroš Milutinović | `server/agent/googleTransport.ts`, `scripts/live/agentSmoke.ts`, [Evidence 014](evidence/EVIDENCE_014.md), commits `a56ad40`, `dd26833`, `7e92b6f` |
| Manual browser acceptance | Uroš Milutinović (user-reported) | The user confirmed the Strategist plan appeared and no perk was purchased automatically; [Evidence 014](evidence/EVIDENCE_014.md) |
| `PLAN DO +1 LIFE`: bounded goal, requirements, Spec Kit spec/plan/contracts/evals, and implementation | Matija Radulović | Matija's separate [W05 report](reports/WEEKLY_REPORT_week05_Matija.md), [branch `week05`](https://github.com/MatijaRadulovic/retro-ai-game/tree/week05), commits `84e68cb`, `229f827`, `39f7c8d`, and `d858830`; Feature `specs/003-ai-plan-to-next-life/` |
| Recovery/fallback and player-facing text refinements on `PLAN DO +1 LIFE` | Matija Radulović | [Recovery prompt](https://github.com/MatijaRadulovic/retro-ai-game/blob/week05/docs/prompts/week5/CHANGE_PROMPT_LIFE_PLAN_RECOVERY_V1.md), [copy prompt](https://github.com/MatijaRadulovic/retro-ai-game/blob/week05/docs/prompts/week5/CHANGE_PROMPT_LIFE_PLAN_COPY_V1.md), Evidence 016–017 on Matija's `week05` branch; details and verification results in his report |
| Matija's reported verification for his separate scenario | Matija Radulović | His report records typecheck, 94/94 tests, build, security scan, 10/10 browser checks, and manual gameplay check. These are his report claims and are not substituted for Uroš's Evidence 014. |

## Attribution limits

- The Shop Strategist commits through its live-run evidence are authored under Uroš's Git identity. Matija's independent `PLAN DO +1 LIFE` commits are authored under his Git identity on `week05`.
- Matija's separate W05 feature lives under `specs/003-ai-plan-to-next-life/` on his `week05` branch; it is not part of the Shop Strategist feature on `main`.
- Week 04 attribution remains in [CONTRIBUTIONS_WEEK04.md](CONTRIBUTIONS_WEEK04.md).
- The manual browser check is learner-reported; no screenshot or independent Strategist browser E2E run was saved.
