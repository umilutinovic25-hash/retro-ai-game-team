/**
 * Merges limit overrides onto server defaults and fails closed on a bad value. An `undefined` override keeps the
 * default (a plain spread would replace it), and anything that is not a positive safe integer throws: NaN,
 * Infinity, 0 or a negative number would otherwise turn a `count >= limit` check into "never".
 */
export function resolveLimits<T extends Record<string, number>>(defaults: T, overrides: Partial<Record<keyof T, unknown>> = {}): T {
  const merged: Record<string, number> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown limit: ${key}`);
    merged[key] = value as number;
  }
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`Limit ${key} must be a positive integer.`);
  }
  return merged as T;
}
