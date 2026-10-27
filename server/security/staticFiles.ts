import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json; charset=utf-8", ".map": "application/json",
};

/** Active (not Report-Only) policy for the production build. Scripts and connections only from this origin. */
export const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "media-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
].join("; ");

export const BASE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

/** Serves a built directory. Returns false when the path is not a file inside the root. */
export async function serveStatic(root: string, urlPath: string, response: ServerResponse): Promise<boolean> {
  const base = resolve(root);
  let relative: string;
  try {
    relative = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  // Never serve dot files or dot directories (.env, .git), even if the root is misconfigured to a project folder.
  if (relative.includes("\0") || relative.split(/[\\/]/).some((segment) => segment.startsWith("."))) return false;
  const wanted = relative === "/" ? "/index.html" : relative;
  const file = normalize(join(base, wanted));
  if (file !== base && !file.startsWith(base + sep)) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
  } catch {
    return false;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    ...BASE_HEADERS,
    "content-type": type,
    "content-security-policy": CSP,
    "cache-control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
  });
  createReadStream(file).pipe(response);
  return true;
}
