/** GET /api/health (public): what this deployment has configured, for the labels Réel / Simulé. */
import { Hono } from "hono";
import { env, providersOf, servicesOf, type Env } from "../env.js";
import { publicKeyHex } from "../sign.js";

export function healthOf(e: Env) {
  return {
    ok: true as const,
    backend: true as const,
    publicKey: publicKeyHex(e.SAWTI_SIGNING_SEED),
    providers: providersOf(e),
    services: servicesOf(e),
  };
}

export const health = new Hono().get("/health", (c) => c.json(healthOf(env())));
