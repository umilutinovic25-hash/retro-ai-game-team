import { ADVICE_MODELS, type AdviceModel } from "../../src/ai/shopAdvice.ts";
import type { GameCoachContext } from "../gameSession.ts";
import {
  GEMINI_ORIGIN, classifyStatus, extractCandidateText, readLimitedResponse, retryAfterMs,
} from "./geminiTransport.ts";
import { ProviderFailure, type ProviderResponse } from "./shopAdvice.ts";
import type { GameCoachTransport } from "./gameCoach.ts";

const COACH_PROMPT = [
  "You are the concise post-game coach for an arcade snake game.",
  "Use only the supplied numeric run summary. Give one encouraging, specific gameplay tip and a short headline.",
  "Never claim facts absent from the summary, blame the player, recommend purchases as if they happened, or include markdown, HTML, links, or personal data.",
  'Return only a JSON object with exactly two string fields: {"headline":"...","tip":"..."}.',
  "Keep headline under 50 characters and tip under 150 characters. Respond in English.",
].join("\n");

function buildBody(context: Omit<GameCoachContext, "runNumber">): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: COACH_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
    generationConfig: { maxOutputTokens: 160, temperature: 0.3 },
  };
}

export function createGoogleGameCoachTransport(apiKey: string, fetchImpl: typeof fetch = fetch): GameCoachTransport {
  if (!apiKey.trim()) throw new Error("Gemini key is not configured.");
  return async (model: AdviceModel, context, signal): Promise<ProviderResponse> => {
    if (!ADVICE_MODELS.includes(model)) throw new ProviderFailure("terminal", 400, undefined, "bad_request");
    let response: Response;
    try {
      response = await fetchImpl(`${GEMINI_ORIGIN}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        redirect: "error",
        signal,
        body: JSON.stringify(buildBody(context)),
      });
    } catch {
      throw new ProviderFailure("transient", undefined, undefined, "network");
    }
    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const retryAfter = retryAfterMs(response.headers.get("retry-after"));
      await response.body?.cancel();
      throw new ProviderFailure(classification.kind, response.status, retryAfter, classification.errorClass);
    }
    const payload = await readLimitedResponse(response);
    const text = extractCandidateText(payload);
    try {
      return { value: JSON.parse(text) as unknown };
    } catch {
      throw new ProviderFailure("invalid_output", undefined, undefined, "invalid_json");
    }
  };
}
