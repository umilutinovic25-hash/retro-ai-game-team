// W08 before/after probe. Uses only APIs that exist at the baseline commit, so the same file runs on both.
// Counts provider calls with a fake transport; prints one JSON line. Run via `npm run security:prepost`.
import { once } from "node:events";
import { createGameHttpServer } from "../../server/httpServer.ts";
import { createShopAdvisor } from "../../server/ai/shopAdvice.ts";
import { createShopAgent } from "../../server/agent/shopAgent.ts";
import { GameSessionManager } from "../../server/gameSession.ts";

let providerCalls = 0;
const transport = async () => { providerCalls += 1; return { value: { kind: "bogus" } }; };
const manager = new GameSessionManager();
const server = createGameHttpServer(manager, createShopAdvisor(null), createShopAgent(transport as never, { deps: { backoffScheduleMs: [0] } }));
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const J = { "content-type": "application/json" };
const ids: string[] = [];
const mk = async () => { const g = (await (await fetch(`${base}/api/games`, { method: "POST", headers: J, body: "{}" })).json() as any).game.id; await fetch(`${base}/api/games/${g}/move`, { method: "POST", headers: J, body: '{"direction":"up"}' }); await fetch(`${base}/api/games/${g}/pause`, { method: "POST" }); ids.push(g); return g; };
const out: Record<string, unknown> = {};
const before = (manager as any).sessions.size;
out.crossSiteCreate = (await fetch(`${base}/api/games`, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" })).status;
out.sessionsCreatedByForeignOrigin = (manager as any).sessions.size - before;
out.textPlainBody = (await fetch(`${base}/api/games`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })).status;
const g = await mk();
const statuses: number[] = [];
for (let i = 0; i < 8; i++) statuses.push((await fetch(`${base}/api/games/${g}/shop-agent`, { method: "POST", headers: J, body: '{"goal":"plan_next_purchases"}' })).status);
out.eightSequentialAgentRuns = statuses.join(",");
out.providerCallsAfterEight = providerCalls;
out.declared40KBody = (await fetch(`${base}/api/games`, { method: "POST", headers: J, body: JSON.stringify({ pad: "x".repeat(40000) }) })).status;
out.extraMaxStepsField = (await fetch(`${base}/api/games/${g}/shop-agent`, { method: "POST", headers: J, body: '{"goal":"plan_next_purchases","maxSteps":999}' })).status;
const h = (await fetch(`${base}/api/health`)).headers;
out.nosniffHeader = h.get("x-content-type-options");
console.log(JSON.stringify(out));
server.close(); process.exit(0);
