import { ADVICE_MODELS, type AdviceModel } from "./shopAdvice.ts";

export type GameCoachResult =
  | { status: "coaching"; headline: string; tip: string; model: AdviceModel }
  | { status: "unavailable"; code: "not_configured" | "busy" | "cancelled" | "temporarily_unavailable"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlainText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 2 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateGameCoachResult(value: unknown): GameCoachResult | null {
  if (!isRecord(value)) return null;
  if (value.status === "coaching") {
    if (Object.keys(value).length !== 4 || !Object.keys(value).every((key) => ["status", "headline", "tip", "model"].includes(key))
      || !isPlainText(value.headline, 60) || !isPlainText(value.tip, 180)
      || !ADVICE_MODELS.includes(value.model as AdviceModel)) return null;
    return value as GameCoachResult;
  }
  if (value.status === "unavailable") {
    if (Object.keys(value).length !== 3 || !Object.keys(value).every((key) => ["status", "code", "message"].includes(key))
      || !["not_configured", "busy", "cancelled", "temporarily_unavailable"].includes(String(value.code))
      || !isPlainText(value.message, 120)) return null;
    return value as GameCoachResult;
  }
  return null;
}
