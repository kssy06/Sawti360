import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { verifyChain } from "../src/core/audit.js";
import type { AuditEntry } from "../src/core/types.js";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("A4 · routes du journal", () => {
  let t: TestDb;
  let nour: string;
  let other: string;
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    other = await createUser(t.sql, "autre@exemple.tn", { name: "Autre" });
    const lina = await createUser(t.sql, "lina@exemple.tn");
    await seedDatabase(t.sql, { nour, lina });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [other]: "autre@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    await t?.drop();
  });
  const h = (id: string) => ({ authorization: `Bearer ${id}`, "content-type": "application/json" });

  it("GET /api/journal rend la chaîne entière, vérifiable dans le navigateur", async () => {
    const r = await app.request("/api/journal", { headers: h(other) });
    expect(r.status).toBe(200);
    const chain = (await r.json()) as AuditEntry[];
    expect(chain.length).toBeGreaterThan(5);
    expect(verifyChain(chain).ok).toBe(true);
    expect(Object.keys(chain[0]).sort()).toEqual(["action", "actor", "decision", "entry_hash", "index", "payload_hash", "prev_hash", "timestamp"]);
  });

  it("POST /api/journal/export inscrit l'export au nom du compte", async () => {
    const r = await app.request("/api/journal/export", { method: "POST", headers: h(nour), body: JSON.stringify({ kind: "SOUS_TITRES_SRT", detail: { projet: "p_bledi_5" } }) });
    expect(r.status).toBe(201);
    const entry = (await r.json()) as AuditEntry;
    expect(entry).toMatchObject({ action: "EXPORT", actor: "Nour Films", decision: "OK" });
    const mine = (await (await app.request("/api/journal?projectId=p_bledi_5", { headers: h(nour) })).json()) as AuditEntry[];
    expect(mine.at(-1)?.entry_hash).toBe(entry.entry_hash);
  });

  it("refuse le journal ou l'export d'un projet d'un autre compte, et un type mal formé", async () => {
    expect((await app.request("/api/journal?projectId=p_bledi_5", { headers: h(other) })).status).toBe(403);
    expect((await app.request("/api/journal/export", { method: "POST", headers: h(other), body: JSON.stringify({ kind: "PASSEPORT_JSON", detail: { projet: "p_bledi_5" } }) })).status).toBe(403);
    expect((await app.request("/api/journal/export", { method: "POST", headers: h(nour), body: JSON.stringify({ kind: "drop table", detail: {} }) })).status).toBe(400);
    expect((await app.request("/api/journal")).status).toBe(401);
  });
});
