/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

/** Runs api/tts.ts locally under /api/tts, exactly as the Vercel function runs in production. */
function localApi(): Plugin {
  return {
    name: "sawti-local-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/tts", async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const mod = await server.ssrLoadModule("/api/tts.ts");
        const request = new Request("http://localhost/api/tts", {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        });
        const handler = req.method === "POST" ? mod.POST : mod.GET;
        const response: Response = handler ? await handler(request) : new Response(null, { status: 405 });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
