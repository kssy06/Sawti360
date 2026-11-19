/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

/** Serves every /api/* request with the same entry point as the Vercel function (api/index.ts → server/app.ts). */
function localApi(): Plugin {
  return {
    name: "sawti-local-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse, next: (err?: unknown) => void) => {
        const url = req.originalUrl ?? req.url ?? "/";
        if (url !== "/api" && !url.startsWith("/api/") && !url.startsWith("/api?")) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
            else if (v !== undefined) headers.set(k, v);
          }
          const method = req.method ?? "GET";
          const request = new Request(`http://${req.headers.host ?? "localhost"}${url}`, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const entry = (await server.ssrLoadModule("/api/index.ts")) as Record<string, (r: Request) => Promise<Response>>;
          const response = await (entry[method] ?? entry.GET)(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // The local API reads the same variables as the Vercel function: load .env, .env.local… into process.env.
  // Not under vitest (mode "test"): tests never see the real keys of .env.local.
  if (mode !== "test") Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  // `npm run dev:demo`: the voice engine answers with short silent test audio, clearly flagged as such.
  if (mode === "demo") process.env.SAWTI_TTS_MOCK = "1";
  return {
    plugins: [react(), localApi()],
    test: { environment: "node", include: ["src/**/*.test.ts", "server/**/*.test.ts", "api/**/*.test.ts", "scripts/**/*.test.ts"] },
  };
});
