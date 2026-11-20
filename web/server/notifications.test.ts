import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { notify } from "./notify.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("A9 · notifications", () => {
  let t: TestDb;
  let nour: string;
  let lina: string;
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    lina = await createUser(t.sql, "lina@exemple.tn", { name: "Lina M." });
    await seedDatabase(t.sql, { nour, lina });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [lina]: "lina@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    await t?.drop();
  });
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("GET /notifications : les deux espaces du compte, les plus récentes d'abord ; rien des autres comptes", async () => {
    const mine = await (await call(lina, "GET", "/notifications")).json();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((n: { to: string }) => n.to === lina)).toBe(true);
    expect(new Set(mine.map((n: { space: string }) => n.space))).toContain("owner");
    const ats = mine.map((n: { at: string }) => n.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    expect((await call(null, "GET", "/notifications")).status).toBe(401);
  });

  it("?since= ne renvoie que les nouvelles ; une date invalide → 400", async () => {
    const since = new Date().toISOString();
    expect(await (await call(lina, "GET", `/notifications?since=${encodeURIComponent(since)}`)).json()).toEqual([]);
    await new Promise((r) => setTimeout(r, 15));
    await notify(t.sql, { accountId: lina, space: "owner", tone: "ok", title: "Votre voix a été utilisée", body: "Nour Films · essai" });
    const fresh = await (await call(lina, "GET", `/notifications?since=${encodeURIComponent(since)}`)).json();
    expect(fresh.map((n: { title: string }) => n.title)).toEqual(["Votre voix a été utilisée"]);
    expect((await call(lina, "GET", "/notifications?since=hier")).status).toBe(400);
  });

  it("« tout lu » : un espace à la fois, pour tous les appareils", async () => {
    await notify(t.sql, { accountId: lina, space: "creator", tone: "plain", title: "Côté créateur", body: "…" });
    expect((await call(lina, "POST", "/notifications/read", { space: "owner" })).status).toBe(204);
    const after = (await (await call(lina, "GET", "/notifications")).json()) as { space: string; read: boolean }[];
    expect(after.filter((n) => n.space === "owner").every((n) => n.read)).toBe(true);
    expect(after.some((n) => n.space === "creator" && !n.read)).toBe(true);
    expect((await call(lina, "POST", "/notifications/read", { space: "partout" })).status).toBe(400);
    const nours = (await (await call(nour, "GET", "/notifications")).json()) as { read: boolean }[];
    expect(nours.some((n) => !n.read)).toBe(true);
  });
});
