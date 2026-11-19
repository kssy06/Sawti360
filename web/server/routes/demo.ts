/**
 * POST /api/demo/session (public) { account: "nour" | "lina" } → { token_hash, email }.
 * Opens one of the demo accounts listed in DEMO_EMAILS, without any password in the browser:
 * the browser finishes with supabase.auth.verifyOtp({ token_hash, type: "magiclink" }).
 */
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env.js";
import { ApiError, notFound, readBody } from "../errors.js";
import { rateLimit } from "../ratelimit.js";
import { supabaseAdmin } from "../supabase.js";

const Body = z.object({ account: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,32}$/) });

export const demo = new Hono().post("/demo/session", rateLimit(20), async (c) => {
  const { account } = await readBody(c, Body);
  const email = env().demoEmails[account];
  if (!email) throw notFound("Ce compte de démonstration n’est pas configuré (DEMO_EMAILS).");
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("[demo] generateLink", error?.message);
    throw new ApiError(502, "AUTH_INDISPONIBLE", "Le service de connexion n’a pas répondu. Réessayez.");
  }
  return c.json({ token_hash: tokenHash, email });
});
