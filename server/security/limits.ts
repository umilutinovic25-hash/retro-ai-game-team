/** Server-owned security limits (W08). Clients and models cannot change them. */
export const SECURITY_LIMITS = {
  /** Maximum request body, counted in bytes before JSON parsing. */
  maxBodyBytes: 16_384,
  /** Global number of simultaneously running provider-backed requests in this process. */
  maxConcurrentRuns: 2,
  /** New provider-backed requests accepted per window. */
  maxRunsPerWindow: 5,
  windowMs: 60_000,
} as const;

export type SecurityLimits = { -readonly [K in keyof typeof SECURITY_LIMITS]: number };
