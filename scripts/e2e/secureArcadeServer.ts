// Backend for the W08 browser checks: the real game server serving the production build (dist/) with
// its CSP and security headers, and a scripted fake provider instead of Gemini. Needs no API key.
// W08_SERVER_SECRET is a synthetic marker loaded into server memory only; the browser checks prove it never leaves.
import { createGameHttpServer } from "../../server/httpServer.ts";
import { GameSessionManager, type GameSnapshot } from "../../server/gameSession.ts";
import { createShopAgent, createJsonAgentTelemetrySink } from "../../server/agent/shopAgent.ts";
import type { AgentTransport } from "../../server/agent/types.ts";
import { createSecurityLog } from "../../server/security/securityLog.ts";
import { awardXp, type GameState } from "../../src/game/snakeEngine.ts";

const port = Number(process.env.PORT ?? 3001);
const secret = process.env.W08_SERVER_SECRET ?? "";

const SUMMARY = "Kupi Extra XP: čćžšđ, a < b, 'ok' & done.";

// get_shop_state -> evaluate_perk_plan -> final: two model decisions around real tool executions.
const transport: AgentTransport = async (_model, request) => {
  const { transcript } = request;
  if (transcript.length === 0) return { value: { kind: "tool_request", tool: "get_shop_state", arguments: {} } };
  if (transcript.length === 1) return { value: { kind: "tool_request", tool: "evaluate_perk_plan", arguments: { plan: ["extra_xp"] } } };
  return {
    value: {
      kind: "final",
      result: {
        summary: SUMMARY, plan: ["extra_xp"], confidence: "medium", completed: true,
        evidence: [{ source: "get_shop_state", step: 1, finding: "1 perk point is available." }],
      },
    },
  };
};

// Test-only fixture: the first pause of each game grants one perk point so the plan is always affordable.
class SeededSessionManager extends GameSessionManager {
  private readonly seeded = new Set<string>();

  override pause(id: string): GameSnapshot {
    super.pause(id);
    if (!this.seeded.has(id)) {
      this.seeded.add(id);
      const internals = this as unknown as { sessions: Map<string, { gameState: GameState }>; publish(session: unknown): void };
      const session = internals.sessions.get(id)!;
      session.gameState = awardXp(session.gameState, 50);
      internals.publish(session);
    }
    return this.get(id);
  }
}

const agent = createShopAgent(transport, { deps: { telemetry: createJsonAgentTelemetrySink(), backoffScheduleMs: [0, 0, 0, 0, 0] } });
const server = createGameHttpServer(new SeededSessionManager(), undefined, agent, undefined, {
  securityLog: createSecurityLog(),
  staticRoot: "dist",
});
server.listen(port, "127.0.0.1", () => {
  console.log(`secure-arcade server listening on http://127.0.0.1:${port} (secretLoaded=${secret.length > 0}, secretLength=${secret.length})`);
});
process.once("SIGTERM", () => server.close(() => process.exit(0)));
process.once("SIGINT", () => server.close(() => process.exit(0)));
