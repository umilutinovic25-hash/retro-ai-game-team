import type { IncomingMessage } from "node:http";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** DNS-rebinding guard: a loopback-only server answers only to loopback host names. */
export function isAllowedHost(request: IncomingMessage): boolean {
  const host = request.headers.host;
  if (!host) return false;
  const name = hostnameOf(host);
  return name !== null && LOOPBACK.has(name);
}

/**
 * Browsers send Origin on cross-site POST and on WebSocket upgrades. Absent Origin (curl, tests) is allowed.
 * With sameOriginOnly (the production build served by this process) only the page's own origin is accepted;
 * in development any loopback origin is, because the Vite dev server proxies from another port.
 */
export function isAllowedOrigin(request: IncomingMessage, extra: readonly string[] = [], sameOriginOnly = false): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (extra.includes(origin)) return true;
  if (sameOriginOnly) return origin === `http://${request.headers.host}`;
  const name = hostnameOf(origin);
  return name !== null && LOOPBACK.has(name);
}

export function hasJsonContentType(request: IncomingMessage): boolean {
  const type = request.headers["content-type"];
  return typeof type === "string" && /^application\/json\s*(;|$)/i.test(type);
}

export function declaredLength(request: IncomingMessage): number | null {
  const raw = request.headers["content-length"];
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
