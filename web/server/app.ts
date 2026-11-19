/**
 * The whole API: one Hono application under /api, served by the single Vercel function
 * (api/index.ts) and, in development, by the Vite plugin localApi() (vite.config.ts).
 * Contracts: docs/backend/API.md. Server-only code: never imported by src/.
 * Relative imports end with .js (Node ESM on Vercel requires it).
 */
import { Hono } from "hono";
import { authGate, type AppEnv } from "./auth.js";
import { ApiError, errorBody, json } from "./errors.js";
import { rateLimit } from "./ratelimit.js";
import { bootstrap } from "./routes/bootstrap.js";
import { characters } from "./routes/characters.js";
import { demo } from "./routes/demo.js";
import { health } from "./routes/health.js";
import { jobs } from "./routes/jobs.js";
import { journal } from "./routes/journal.js";
import { me } from "./routes/me.js";
import { projects } from "./routes/projects.js";
import { tts } from "./routes/tts.js";
import { uploads } from "./routes/uploads.js";

export function createApp() {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
  });
  app.use("*", authGate);
  app.use("/public/*", rateLimit(20));

  app.route("/", health);
  app.route("/", tts);
  app.route("/", demo);
  app.route("/", me);
  app.route("/", bootstrap);
  app.route("/", projects);
  app.route("/", characters);
  app.route("/", journal);
  app.route("/", uploads);
  app.route("/", jobs);

  app.notFound(() => json(404, { error: "INTROUVABLE", message: "Route inconnue." }));
  app.onError((err) => {
    if (err instanceof ApiError) return json(err.status, errorBody(err));
    console.error("[api]", err);
    return json(500, { error: "ERREUR_SERVEUR", message: "Erreur inattendue du serveur. Réessayez dans un instant." });
  });
  return app;
}

export const app = createApp();
export type App = typeof app;
