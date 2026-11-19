/**
 * Best-effort limit for public routes: 20 requests per minute per IP address and per route,
 * kept in the memory of the instance (ARCHITECTURE.md § 7). Not a security boundary.
 */
import type { MiddlewareHandler } from "hono";
import { ApiError } from "./errors.js";

const WINDOW_MS = 60_000;
const hits = new Map<string, { start: number; count: number }>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "inconnue";
}

/** Returns true when the call is allowed. Exported for tests. */
export function take(key: string, limit: number, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || now - h.start >= WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start >= WINDOW_MS) hits.delete(k);
    return true;
  }
  h.count += 1;
  return h.count <= limit;
}

export function resetRateLimitForTests(): void {
  hits.clear();
}

/** Route key without its variable parts (tokens, ids), so one link cannot be hammered by changing it. */
export function routeKey(method: string, path: string): string {
  return `${method} ${path.replace(/\/[0-9a-f]{16,}|\/S360-[A-Z0-9-]+|\/[0-9a-f-]{36}/gi, "/:id")}`;
}

export function rateLimit(limit = 20): MiddlewareHandler {
  return async (c, next) => {
    if (!take(`${clientIp(c.req.raw.headers)} ${routeKey(c.req.method, c.req.path)}`, limit)) {
      throw new ApiError(429, "TROP_DE_REQUETES", "Trop de requêtes : réessayez dans une minute.");
    }
    await next();
  };
}
