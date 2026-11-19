/**
 * vercel.json rewrites every /api/<path> to the single function /api, and passes <path> in the
 * query (`/api?__path=<path>`). Vercel normally keeps the original URL for the function; this
 * puts it back in any case, so Hono always routes /api/projects/… and never sees __path.
 */
export const PATH_PARAM = "__path";

export function originalUrl(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has(PATH_PARAM)) return url;
  const rest = (u.searchParams.get(PATH_PARAM) ?? "").replace(/^\/+/, "");
  u.searchParams.delete(PATH_PARAM);
  u.pathname = rest ? `/api/${rest}` : "/api";
  return u.toString();
}

export async function withOriginalUrl(req: Request): Promise<Request> {
  const url = originalUrl(req.url);
  if (url === req.url) return req;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
  });
}
