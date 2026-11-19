/**
 * Access control. Every route outside /api/public/*, /api/health, /api/demo/* and the
 * transitional /api/tts needs `Authorization: Bearer <Supabase access token>`.
 * The token is verified by Supabase (getClaims: JWKS signature check, or a call to the Auth server).
 */
import type { MiddlewareHandler } from "hono";
import { unauthorized } from "./errors.js";
import { supabaseAdmin } from "./supabase.js";

export interface AuthUser {
  /** auth.users.id = accounts.id */
  id: string;
  email: string;
}

export interface AppEnv {
  Variables: { user: AuthUser };
}

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

const PUBLIC = [/^\/api\/health\/?$/, /^\/api\/public(\/|$)/, /^\/api\/demo(\/|$)/, /^\/api\/tts\/?$/];

export const isPublicPath = (path: string) => PUBLIC.some((re) => re.test(path));

/** Default verifier: the Supabase Auth server (or its JWKS) decides. */
export const supabaseVerifier: TokenVerifier = async (token) => {
  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; role?: string };
  if (claims.role && claims.role !== "authenticated") return null;
  return { id: claims.sub, email: (claims.email ?? "").toLowerCase() };
};

let verifier: TokenVerifier = supabaseVerifier;

/** Tests only: replace the verifier (e.g. "Bearer test:<uuid>" → that account). */
export function setVerifierForTests(v: TokenVerifier | null): void {
  verifier = v ?? supabaseVerifier;
}

export function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** Rejects protected routes without a valid token, before routing (so an unknown protected path is a 401 too). */
export const authGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "OPTIONS" || isPublicPath(c.req.path)) return next();
  const token = bearer(c.req.header("authorization"));
  if (!token) throw unauthorized();
  const user = await verifier(token);
  if (!user) throw unauthorized("Session expirée ou invalide : reconnectez-vous.");
  c.set("user", user);
  await next();
};
