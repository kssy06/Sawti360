/**
 * DEVELOPMENT ONLY — a tiny stand-in for Supabase (Auth, and Storage signed URLs) to try the
 * back-end mode locally without a Supabase project or any key. Never deployed, never used in
 * production: the real site talks to Supabase.
 *
 *   npx tsx scripts/dev/fake-supabase.ts          (listens on http://localhost:54321)
 *
 * It needs DEV_DATABASE_URL: a local Postgres database prepared with `npx tsx scripts/dev/dev-db.ts`
 * (schema.sql + the stand-ins of auth.users and storage.buckets). Users are rows of auth.users,
 * so the real on_auth_user_created trigger creates their accounts and jetons.
 * Tokens are HS256 JWTs signed with a fixed development secret; files go to a local folder.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import postgres from "postgres";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const SECRET = "sawti-dev-only-secret";
const FILES = process.env.FAKE_STORAGE_DIR ?? join(process.cwd(), ".fake-storage");
const dbUrl = process.env.DEV_DATABASE_URL;
if (!dbUrl) {
  console.error("DEV_DATABASE_URL manquant (base locale préparée par scripts/dev/dev-db.ts).");
  process.exit(1);
}
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });
await sql`create table if not exists auth.fake_passwords (id uuid primary key, password text not null)`;

const refresh = new Map<string, string>();
const magic = new Map<string, string>();
const uploads = new Map<string, { bucket: string; path: string; exp: number }>();

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function jwt(payload: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${head}.${body}.${b64(createHmac("sha256", SECRET).update(`${head}.${body}`).digest())}`;
}

function verify(token: string): Record<string, unknown> | null {
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  if (b64(createHmac("sha256", SECRET).update(`${h}.${b}`).digest()) !== s) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString()) as Record<string, unknown>;
  return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() ? payload : null;
}

interface UserRow {
  id: string;
  email: string;
  raw_user_meta_data: Record<string, unknown>;
  created_at: Date;
}

const userJson = (u: UserRow) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: u.created_at.toISOString(),
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: u.raw_user_meta_data ?? {},
  identities: [],
  created_at: u.created_at.toISOString(),
  updated_at: new Date().toISOString(),
});

function session(u: UserRow) {
  const now = Math.floor(Date.now() / 1000);
  const rt = randomBytes(16).toString("hex");
  refresh.set(rt, u.id);
  return {
    access_token: jwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: randomUUID() }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: rt,
    user: userJson(u),
  };
}

const byEmail = async (email: string) => (await sql<UserRow[]>`select * from auth.users where lower(email) = ${email.toLowerCase()}`)[0];
const byId = async (id: string) => (await sql<UserRow[]>`select * from auth.users where id = ${id}`)[0];

async function createUser(email: string, password: string, meta: Record<string, unknown>): Promise<UserRow> {
  const id = randomUUID();
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email.toLowerCase()}, ${sql.json(meta as never)})`;
  await sql`insert into auth.fake_passwords (id, password) values (${id}, ${hash(password)}) on conflict (id) do update set password = excluded.password`;
  return (await byId(id))!;
}

function send(res: ServerResponse, status: number, body?: unknown, type = "application/json") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-upsert, cache-control",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  res.end(body === undefined ? undefined : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, code: string, msg: string) => send(res, status, { code: status, error_code: code, msg });

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function auth(req: IncomingMessage, res: ServerResponse, url: URL, raw: Buffer) {
  const body = raw.length && (req.headers["content-type"] ?? "").includes("json") ? (JSON.parse(raw.toString()) as Record<string, any>) : {};
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  if (path === "/token" && url.searchParams.get("grant_type") === "password") {
    const u = await byEmail(String(body.email ?? ""));
    const [pw] = u ? await sql<{ password: string }[]>`select password from auth.fake_passwords where id = ${u.id}` : [];
    if (!u || !pw || pw.password !== hash(String(body.password ?? ""))) return fail(res, 400, "invalid_credentials", "Invalid login credentials");
    return send(res, 200, session(u));
  }
  if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const id = refresh.get(String(body.refresh_token ?? ""));
    const u = id ? await byId(id) : undefined;
    if (!u) return fail(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
    return send(res, 200, session(u));
  }
  if (path === "/verify" && req.method === "POST") {
    const id = magic.get(String(body.token_hash ?? ""));
    if (!id) return fail(res, 403, "otp_expired", "Email link is invalid or has expired");
    magic.delete(String(body.token_hash));
    return send(res, 200, session((await byId(id))!));
  }
  if (path === "/signup") {
    if (await byEmail(String(body.email ?? ""))) return fail(res, 422, "user_already_exists", "User already registered");
    return send(res, 200, session(await createUser(String(body.email), String(body.password ?? ""), body.data ?? {})));
  }
  if (path === "/user") {
    const claims = verify(bearer);
    const u = claims ? await byId(String(claims.sub)) : undefined;
    if (!u) return fail(res, 401, "bad_jwt", "invalid JWT");
    if (req.method === "PUT" && body.password) await sql`update auth.fake_passwords set password = ${hash(String(body.password))} where id = ${u.id}`;
    return send(res, 200, userJson(u));
  }
  if (path === "/logout") return send(res, 204);
  if (path === "/recover") {
    const u = await byEmail(String(body.email ?? ""));
    if (u) {
      const s = session(u);
      console.log(`[faux Supabase] lien de réinitialisation : http://localhost:5173/mot-de-passe-oublie#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=recovery`);
    }
    return send(res, 200, {});
  }
  if (path === "/admin/generate_link") {
    const u = await byEmail(String(body.email ?? ""));
    if (!u) return fail(res, 404, "user_not_found", "User not found");
    const th = randomBytes(20).toString("hex");
    magic.set(th, u.id);
    return send(res, 200, { ...userJson(u), action_link: "", email_otp: "", hashed_token: th, redirect_to: "", verification_type: "magiclink" });
  }
  if (path === "/admin/users" && req.method === "POST") {
    if (await byEmail(String(body.email ?? ""))) return fail(res, 422, "email_exists", "A user with this email address has already been registered");
    return send(res, 200, userJson(await createUser(String(body.email), String(body.password ?? ""), body.user_metadata ?? {})));
  }
  const m = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path);
  if (m && req.method === "PUT") {
    if (body.password) await sql`insert into auth.fake_passwords (id, password) values (${m[1]}, ${hash(String(body.password))}) on conflict (id) do update set password = excluded.password`;
    if (body.user_metadata) await sql`update auth.users set raw_user_meta_data = ${sql.json(body.user_metadata)} where id = ${m[1]}`;
    const u = await byId(m[1]);
    return u ? send(res, 200, userJson(u)) : fail(res, 404, "user_not_found", "User not found");
  }
  return fail(res, 404, "not_found", `faux Supabase : ${req.method} ${url.pathname} non pris en charge`);
}

/* ------------------------------------------------------------------ storage (signed URLs) */

async function storage(req: IncomingMessage, res: ServerResponse, url: URL, raw: Buffer) {
  const path = url.pathname.replace(/^\/storage\/v1/, "");
  let m = /^\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(path);
  if (m && req.method === "POST") {
    const token = randomBytes(16).toString("hex");
    uploads.set(token, { bucket: m[1], path: decodeURIComponent(m[2]), exp: Date.now() + 2 * 3600_000 });
    return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}`, token });
  }
  if (m && req.method === "PUT") {
    const t = uploads.get(url.searchParams.get("token") ?? "");
    if (!t || t.exp < Date.now() || t.path !== decodeURIComponent(m[2])) return fail(res, 400, "invalid_token", "Invalid upload token");
    const file = join(FILES, t.bucket, t.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, raw);
    return send(res, 200, { Key: `${t.bucket}/${t.path}`, path: t.path });
  }
  m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path);
  if (m && req.method === "POST") {
    const token = jwt({ url: `${m[1]}/${decodeURIComponent(m[2])}`, exp: Math.floor(Date.now() / 1000) + 600 });
    return send(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=${token}` });
  }
  if (m && req.method === "GET") {
    const claims = verify(url.searchParams.get("token") ?? "");
    const file = join(FILES, m[1], decodeURIComponent(m[2]));
    if (!claims || claims.url !== `${m[1]}/${decodeURIComponent(m[2])}` || !existsSync(file)) return fail(res, 400, "invalid_token", "Invalid or expired signed URL");
    return send(res, 200, readFileSync(file), "application/octet-stream");
  }
  m = /^\/object\/([^/]+)$/.exec(path);
  if (m && req.method === "DELETE") return send(res, 200, []);
  return fail(res, 404, "not_found", `faux Supabase : ${req.method} ${url.pathname} non pris en charge`);
}

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const raw = await readBody(req);
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url, raw);
    if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url, raw);
    return fail(res, 404, "not_found", "faux Supabase : route inconnue");
  } catch (err) {
    console.error(err);
    return fail(res, 500, "unexpected_failure", String(err));
  }
}).listen(PORT, () => console.log(`[faux Supabase] http://localhost:${PORT} (développement uniquement)`));
