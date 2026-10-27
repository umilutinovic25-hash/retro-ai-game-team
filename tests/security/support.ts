import { once } from "node:events";
import { createGameHttpServer } from "../../server/httpServer.ts";
import { createShopAdvisor } from "../../server/ai/shopAdvice.ts";
import { createShopAgent } from "../../server/agent/shopAgent.ts";
import type { AgentLimits, AgentTelemetrySink, AgentTransport } from "../../server/agent/types.ts";
import { createAdmissionControl } from "../../server/security/admission.ts";
import { createSecurityLog } from "../../server/security/securityLog.ts";
import type { SecurityLimits } from "../../server/security/limits.ts";
import { FAST, pausedGame } from "../support/agentFixtures.ts";

export const GOAL = { goal: "plan_next_purchases" };
export const JSON_HEADERS = { "content-type": "application/json" };

export type App = Awaited<ReturnType<typeof startApp>>;

/** Real HTTP server, real agent loop, real tools; only the provider is faked. */
export async function startApp(options: {
  transport: AgentTransport | null;
  points?: number;
  limits?: Partial<AgentLimits>;
  admission?: Partial<SecurityLimits>;
  now?: () => number;
}) {
  const { manager, id } = pausedGame(options.points ?? 3);
  const admission = createAdmissionControl(options.admission, options.now);
  const securityLines: string[] = [];
  const telemetryLines: string[] = [];
  const telemetry: AgentTelemetrySink = (event) => telemetryLines.push(JSON.stringify(event));
  const server = createGameHttpServer(manager, createShopAdvisor(null),
    createShopAgent(options.transport, { limits: options.limits, deps: { ...FAST, telemetry } }), undefined, {
      admission,
      securityLog: createSecurityLog((line) => securityLines.push(line)),
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("no address");
  const base = `http://127.0.0.1:${address.port}`;
  return {
    manager, id, base, securityLines, telemetryLines, admission,
    /** Another paused game in the same server, so concurrent runs are not blocked by the per-game guard. */
    extraPausedGame: () => {
      const game = manager.create();
      manager.move(game.id, "up");
      manager.pause(game.id);
      return `${base}/api/games/${game.id}/shop-agent`;
    },
    agentUrl: `${base}/api/games/${id}/shop-agent`,
    post: (url: string, body: unknown, headers: Record<string, string> = JSON_HEADERS, signal?: AbortSignal) =>
      fetch(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body), signal }),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
