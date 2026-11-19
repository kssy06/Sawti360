import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendEntry, verifyChain } from "../src/core/audit.js";
import { appendAudit, journalHead, readJournal } from "./audit.js";
import { createTestDb, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("A4 · journal d'audit en base", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 30_000);
  afterAll(async () => t?.drop());

  it("10 ajouts en parallèle donnent une chaîne liée que verifyChain() du navigateur valide", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendAudit(t.sql, `acteur ${i}`, "TEST_PARALLELE", { i }, "OK", { projectId: i % 2 ? "p1" : "p2" })));
    const chain = await readJournal(t.sql);
    expect(chain.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(verifyChain(chain)).toEqual({ ok: true, brokenAt: null });
    expect(await journalHead(t.sql)).toEqual({ count: 10, head: chain[9].entry_hash });
    expect((await readJournal(t.sql, { projectId: "p1" })).length).toBe(5);
    expect((await readJournal(t.sql, { uptoIndex: 3 })).length).toBe(4);
  });

  it("même hachage que appendEntry() du navigateur, falsification détectée", async () => {
    const before = await readJournal(t.sql);
    const at = new Date("2026-11-20T10:00:00Z");
    const entry = await appendAudit(t.sql, "Nour Films", "TEXTE_VALIDE", { segment: "s1" }, "VALIDE", { at });
    const local = appendEntry(before, "Nour Films", "TEXTE_VALIDE", { segment: "s1" }, "VALIDE", at);
    expect(entry).toEqual(local[local.length - 1]);
    const tampered = (await readJournal(t.sql)).map((e, i) => (i === 4 ? { ...e, actor: "falsifié" } : e));
    expect(verifyChain(tampered)).toEqual({ ok: false, brokenAt: 4 });
  });

  it("dans une transaction annulée, l'entrée disparaît avec le reste", async () => {
    const { count } = await journalHead(t.sql);
    await expect(
      t.sql.begin(async (tx) => {
        await appendAudit(tx, "x", "ANNULE", {}, "");
        throw new Error("annulation");
      }),
    ).rejects.toThrow("annulation");
    expect((await journalHead(t.sql)).count).toBe(count);
  });
});
