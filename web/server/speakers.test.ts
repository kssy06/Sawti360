import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase, type DemoIds } from "../scripts/lib/seed-db.js";
import type { Project } from "../src/state/store.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

/** The creator corrects the speaker detection: who says a line, a missed voice, one person split in two. */
describe.skipIf(!hasTestDb)("Personnages · corriger le nombre d'intervenants", () => {
  let t: TestDb;
  let ids: DemoIds;
  const PID = "p_bledi_5";

  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({ DEMO_EMAILS: "nour=equipe+nour@gmail.com,lina=equipe+lina@gmail.com" });
    ids = { nour: await createUser(t.sql, "equipe+nour@gmail.com"), lina: await createUser(t.sql, "equipe+lina@gmail.com") };
    const emails: Record<string, string> = { [ids.nour]: "equipe+nour@gmail.com", [ids.lina]: "equipe+lina@gmail.com" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
    await seedDatabase(t.sql, ids);
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    setEnvForTests(null);
    await t?.drop();
  });

  const send = (method: string, path: string, id: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { authorization: `Bearer ${id}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("ajouter un intervenant manqué, lui donner une réplique : l'ancien audio de la réplique est retiré", async () => {
    let r = await send("POST", `/projects/${PID}/characters`, ids.nour);
    expect(r.status).toBe(201);
    let p = (await r.json()) as Project;
    const added = Object.keys(p.characters).find((k) => !["selma", "hamza"].includes(k))!;
    expect(added).toMatch(/^p\d+$/);
    expect(p.characters[added]).toMatchObject({ name: "Intervenant C", confirmed: false });
    expect(p.gens.s2).toBeDefined();
    r = await send("PATCH", `/projects/${PID}/segments/s2`, ids.nour, { speaker: added });
    p = (await r.json()) as Project;
    expect(p.segments.find((s) => s.id === "s2")?.speaker).toBe(added);
    expect(p.gens.s2).toBeUndefined();
    expect(p.gens.s1).toBeDefined();
    expect((await readJournal(t.sql)).some((e) => e.action === "PERSONNAGE_AJOUTE")).toBe(true);
  });

  it("fusionner deux personnages qui sont la même personne : répliques déplacées, personnage retiré, journal", async () => {
    const before = (await (await send("GET", `/projects/${PID}`, ids.nour)).json()) as Project;
    const added = Object.keys(before.characters).find((k) => !["selma", "hamza"].includes(k))!;
    const r = await send("POST", `/projects/${PID}/characters/${added}/merge`, ids.nour, { into: "hamza" });
    expect(r.status).toBe(200);
    const p = (await r.json()) as Project;
    expect(Object.keys(p.characters).sort()).toEqual(["hamza", "selma"]);
    expect(p.speakers[added]).toBeUndefined();
    expect(p.segments.find((s) => s.id === "s2")?.speaker).toBe("hamza");
    expect((await readJournal(t.sql)).at(-1)).toMatchObject({ action: "PERSONNAGES_FUSIONNES", decision: "HUMAIN" });
  });

  it("refus : un personnage déjà engagé (licence demandée), lui-même, inconnu, un autre compte", async () => {
    const r = await send("POST", `/projects/${PID}/characters/selma/merge`, ids.nour, { into: "hamza" });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("PERSONNAGE_ENGAGE");
    expect((await send("POST", `/projects/${PID}/characters/hamza/merge`, ids.nour, { into: "hamza" })).status).toBe(400);
    expect((await send("POST", `/projects/${PID}/characters/zz/merge`, ids.nour, { into: "hamza" })).status).toBe(404);
    expect((await send("POST", `/projects/${PID}/characters`, ids.lina)).status).toBe(403);
  });
});
