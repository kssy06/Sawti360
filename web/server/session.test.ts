import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { resetRateLimitForTests, routeKey, take } from "./ratelimit.js";
import { setSupabaseForTests } from "./supabase.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const DEMO = { DEMO_EMAILS: "nour=equipe+nour@gmail.com,lina=equipe+lina@gmail.com" };

afterEach(() => {
  setEnvForTests(null);
  setSupabaseForTests(null);
  resetRateLimitForTests();
});

describe("A2 · session de démonstration", () => {
  const fakeAdmin = (calls: string[]) =>
    ({
      auth: {
        admin: {
          generateLink: async ({ email }: { email: string }) => {
            calls.push(email);
            return { data: { properties: { hashed_token: "hash-de-test" } }, error: null };
          },
        },
      },
    }) as unknown as SupabaseClient;

  it("ouvre seulement les comptes listés dans DEMO_EMAILS", async () => {
    setEnvForTests(DEMO);
    const calls: string[] = [];
    setSupabaseForTests(fakeAdmin(calls));
    const ok = await app.request("/api/demo/session", { method: "POST", body: JSON.stringify({ account: "Nour" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ token_hash: "hash-de-test", email: "equipe+nour@gmail.com" });
    const unknown = await app.request("/api/demo/session", { method: "POST", body: JSON.stringify({ account: "admin" }) });
    expect(unknown.status).toBe(404);
    const bad = await app.request("/api/demo/session", { method: "POST", body: JSON.stringify({ account: "a b" }) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("REQUETE_INVALIDE");
    expect(calls).toEqual(["equipe+nour@gmail.com"]);
  });

  it("sans Supabase configuré : 503 NON_CONFIGURE, pas de plantage", async () => {
    setEnvForTests(DEMO);
    const r = await app.request("/api/demo/session", { method: "POST", body: JSON.stringify({ account: "lina" }) });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("NON_CONFIGURE");
  });

  it("limite de 20 requêtes par minute et par adresse sur les routes publiques", async () => {
    setEnvForTests(DEMO);
    setSupabaseForTests(fakeAdmin([]));
    const call = () => app.request("/api/demo/session", { method: "POST", headers: { "x-forwarded-for": "10.0.0.9" }, body: JSON.stringify({ account: "nour" }) });
    for (let i = 0; i < 20; i++) expect((await call()).status).toBe(200);
    const r = await call();
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("TROP_DE_REQUETES");
  });

  it("la clé de limite ignore les jetons et identifiants variables", () => {
    expect(routeKey("GET", "/api/public/consents/0123456789abcdef0123456789abcdef")).toBe("GET /api/public/consents/:id");
    expect(routeKey("GET", "/api/public/passports/S360-ABCD-EFGH")).toBe("GET /api/public/passports/:id");
    expect(take("k", 1, 0)).toBe(true);
    expect(take("k", 1, 10)).toBe(false);
    expect(take("k", 1, 60_000)).toBe(true);
  });

  it("GET /api/me sans base configurée : 503 lisible", async () => {
    setEnvForTests({});
    setVerifierForTests(async () => ({ id: "00000000-0000-0000-0000-000000000001", email: "a@b.c" }));
    const r = await app.request("/api/me", { headers: { authorization: "Bearer x" } });
    expect(r.status).toBe(503);
    expect((await r.json()).message).toContain("DATABASE_URL");
    setVerifierForTests(null);
  });
});

describe.skipIf(!hasTestDb)("A2 · comptes sur Postgres (schema.sql)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    await t?.drop();
  });

  const as = (id: string, email: string) => {
    setVerifierForTests(async (tok) => (tok === id ? { id, email } : null));
    return { authorization: `Bearer ${id}` };
  };

  it("inscription : le déclencheur crée le compte et 100 000 jetons", async () => {
    const id = await createUser(t.sql, "studio@exemple.tn", { name: "Studio Hkeyet", org: "Sfax" });
    const r = await app.request("/api/me", { headers: as(id, "studio@exemple.tn") });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      id,
      name: "Studio Hkeyet",
      email: "studio@exemple.tn",
      org: "Sfax",
      initials: "SH",
      plan: "createur",
      isDemo: false,
      demoKey: null,
      balance: 100000,
    });
  });

  it("PATCH /api/me met à jour nom, initiales et organisation", async () => {
    const id = await createUser(t.sql, "nour@exemple.tn", { name: "Nour" });
    setEnvForTests({ DEMO_EMAILS: "nour=nour@exemple.tn" });
    const r = await app.request("/api/me", { method: "PATCH", headers: as(id, "nour@exemple.tn"), body: JSON.stringify({ name: "Nour Films", org: "Studio de création · Tunis" }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: "Nour Films", initials: "NF", org: "Studio de création · Tunis", isDemo: true, demoKey: "nour" });
    const bad = await app.request("/api/me", { method: "PATCH", headers: as(id, "nour@exemple.tn"), body: JSON.stringify({ plan: "studio" }) });
    expect(bad.status).toBe(400);
  });

  it("une ligne de compte manquante est recréée avec ses jetons", async () => {
    const id = await createUser(t.sql, "perdu@exemple.tn");
    await t.sql`delete from public.accounts where id = ${id}`;
    const r = await app.request("/api/me", { headers: as(id, "perdu@exemple.tn") });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ name: "perdu", balance: 100000 });
  });
});
