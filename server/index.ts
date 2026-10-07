import { createGameHttpServer } from "./httpServer.ts";
import { GameSessionManager } from "./gameSession.ts";
import { createJsonAdviceTelemetrySink, createShopAdvisor } from "./ai/shopAdvice.ts";
import { createGeminiTransport } from "./ai/geminiTransport.ts";
import { createShopAgent, createJsonAgentTelemetrySink } from "./agent/shopAgent.ts";
import { createGoogleAgentTransport } from "./agent/googleTransport.ts";
import { createGameCoach } from "./ai/gameCoach.ts";
import { createGoogleGameCoachTransport } from "./ai/gameCoachTransport.ts";

const port = Number(process.env.PORT ?? 3001);
const apiKey = process.env.GEMINI_API_KEY;
const advisor = createShopAdvisor(apiKey ? createGeminiTransport(apiKey) : null, {
  telemetry: createJsonAdviceTelemetrySink(),
});
const agent = createShopAgent(apiKey ? createGoogleAgentTransport(apiKey) : null, {
  deps: { telemetry: createJsonAgentTelemetrySink() },
});
const coach = createGameCoach(apiKey ? createGoogleGameCoachTransport(apiKey) : null);
const server = createGameHttpServer(new GameSessionManager(), advisor, agent, coach);

server.listen(port, "127.0.0.1", () => {
  console.log(`RETRO SNAKE server listening on http://127.0.0.1:${port}`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
