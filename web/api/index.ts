/**
 * The only Vercel function of the project (Node runtime, maxDuration 300 s in vercel.json).
 * Every /api/* request is rewritten here and handed to the Hono application.
 */
import { app } from "../server/app.js";
import { withOriginalUrl } from "../server/vercel.js";

async function handler(request: Request): Promise<Response> {
  return app.fetch(await withOriginalUrl(request));
}

export { handler as DELETE, handler as GET, handler as HEAD, handler as OPTIONS, handler as PATCH, handler as POST, handler as PUT };
