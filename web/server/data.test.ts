import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase, type DemoIds } from "../scripts/lib/seed-db.js";
import { verifyChain } from "../src/core/audit.js";
import { seed } from "../src/state/seed.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("A3 · données partagées sur Postgres", () => {
  let t: TestDb;
  let ids: DemoIds;
  let stranger: string;
  const emails: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({ DEMO_EMAILS: "nour=equipe+nour@gmail.com,lina=equipe+lina@gmail.com" });
    ids = { nour: await createUser(t.sql, "equipe+nour@gmail.com"), lina: await createUser(t.sql, "equipe+lina@gmail.com") };
    stranger = await createUser(t.sql, "autre@exemple.tn", { name: "Autre Studio" });
    Object.assign(emails, { [ids.nour]: "equipe+nour@gmail.com", [ids.lina]: "equipe+lina@gmail.com", [stranger]: "autre@exemple.tn" });
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    setEnvForTests(null);
    await t?.drop();
  });

  const as = (id: string) => ({ authorization: `Bearer ${id}`, "content-type": "application/json" });
  const get = (path: string, id: string) => app.request(`/api${path}`, { headers: as(id) });
  const send = (method: string, path: string, id: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: as(id), body: body === undefined ? undefined : JSON.stringify(body) });

  it("npm run seed est idempotent et écrit le journal d'exemple une seule fois", async () => {
    const first = await seedDatabase(t.sql, ids);
    expect(first).toMatchObject({ projects: 3, requests: 4, profiles: 4, consents: 1, dossiers: 1, passports: 1, journal: "écrit" });
    const second = await seedDatabase(t.sql, ids);
    expect(second.journal).toBe("conservé");
    const [{ n }] = await t.sql<{ n: number }[]>`select count(*)::int as n from public.projects`;
    expect(n).toBe(3);
    expect(verifyChain(await readJournal(t.sql)).ok).toBe(true);
  });

  it("connecté en Nour Films, le bootstrap rend les projets de la version simulée", async () => {
    const r = await get("/bootstrap", ids.nour);
    expect(r.status).toBe(200);
    const b = await r.json();
    const sim = seed();
    expect(b.account).toMatchObject({ id: ids.nour, name: "Nour Films", initials: "NF", isDemo: true, demoKey: "nour" });
    expect(b.balance).toBe(100000);
    expect(b.order.sort()).toEqual([...sim.order].sort());
    for (const pid of sim.order) {
      const a = b.projects[pid];
      const s = sim.projects[pid];
      expect(a.accountId).toBe(ids.nour);
      expect(a.title).toBe(s.title);
      expect(a.segments).toEqual(s.segments);
      expect(a.reviews).toEqual(s.reviews);
      expect(a.proposals).toEqual(s.proposals);
      expect(a.speakerVoices).toEqual(s.speakerVoices);
      expect(a.generation).toEqual(s.generation);
      for (const [k, c] of Object.entries(s.characters)) {
        const { living, dossier: _dossier, ...rest } = c;
        expect(a.characters[k]).toMatchObject(rest);
        if (living) {
          const got = a.characters[k].living;
          expect(got).toMatchObject({ status: living.status, email: living.email, registered: living.registered });
          expect(got.token).toBeUndefined();
          expect(Math.abs(new Date(got.sentAt).getTime() - new Date(living.sentAt!).getTime())).toBeLessThan(10_000);
        }
      }
    }
    expect(b.projects.p_hkeyet_jeddi.characters.jeddi.dossier).toMatchObject({ status: "verification", reference: sim.projects.p_hkeyet_jeddi.characters.jeddi.dossier!.reference });
    expect(JSON.stringify(b)).not.toContain("exemple/autorisation");
    expect(b.requests.map((x: { id: string }) => x.id)).toEqual(["r_bledi_lina", "r_demo_lina", "r_demo_sami"]);
    expect(b.requests.every((x: { token: string }) => x.token === "")).toBe(true);
    expect(b.notifications).toHaveLength(3);
    expect(b.usage.map((u: { id: string }) => u.id)).toEqual(["u3"]);
    expect(b.licenses.length).toBe(sim.licenses.length);
    expect(b.profiles.find((p: { voiceId: string }) => p.voiceId === "v_hedi").availability).toBe("indisponible");
    expect(Object.keys(b.passports)).toEqual(["p_bledi_5"]);
    expect(b.ownedVoices).toEqual({});
    expect(b.journalHead.count).toBe(sim.journal.length);
  });

  it("connectée en Lina M., elle voit sa voix, les demandes reçues et ses usages", async () => {
    const b = await (await get("/bootstrap", ids.lina)).json();
    expect(Object.keys(b.ownedVoices)).toEqual([ids.lina]);
    expect(b.ownedVoices[ids.lina]).toMatchObject({ voiceId: "v_lina", published: true, sample: { duration: 31.4 } });
    expect(b.requests.map((x: { id: string }) => x.id).sort()).toEqual(["r_bledi_lina", "r_demo_lina", "r_ext_lina"]);
    expect(b.usage).toHaveLength(3);
    expect(b.notifications).toHaveLength(2);
    expect(b.order).toEqual([]);
  });

  it("une traduction modifiée est rendue par la base ; l'approbation est inscrite au journal", async () => {
    const pid = "le_dernier_car_extrait";
    let r = await send("PATCH", `/projects/${pid}/segments/s3`, ids.nour, { translation: "Je l’ai payé 300 dinars, ce n’est pas rien !" });
    expect(r.status).toBe(200);
    expect((await r.json()).segments.find((s: { id: string }) => s.id === "s3")).toMatchObject({ translation: "Je l’ai payé 300 dinars, ce n’est pas rien !", validated: false });
    r = await send("PATCH", `/projects/${pid}/segments/s3`, ids.nour, { validated: true });
    expect((await r.json()).segments[2].validated).toBe(true);
    const fresh = await (await get(`/projects/${pid}`, ids.nour)).json();
    expect(fresh.segments[2]).toMatchObject({ validated: true, translation: "Je l’ai payé 300 dinars, ce n’est pas rien !" });
    const journal = await readJournal(t.sql, { projectId: pid });
    expect(journal.at(-1)).toMatchObject({ action: "TEXTE_VALIDE", actor: "Nour Films", decision: "VALIDE" });
    r = await send("PATCH", `/projects/${pid}/segments/s3`, ids.nour, { translation: "Autre texte" });
    expect((await r.json()).segments[2].validated).toBe(false);
    expect((await send("PATCH", `/projects/${pid}/segments/s9`, ids.nour, { validated: true })).status).toBe(404);
    expect((await send("PATCH", `/projects/${pid}/segments/s1`, ids.nour, { start: 3, end: 3.1 })).status).toBe(400);
  });

  it("le projet d'un autre compte est refusé (403), un projet inconnu est introuvable (404)", async () => {
    expect((await get("/projects/le_dernier_car_extrait", stranger)).status).toBe(403);
    expect((await send("PATCH", "/projects/le_dernier_car_extrait/segments/s1", stranger, { validated: true })).status).toBe(403);
    expect((await get("/projects/v_inconnu", ids.nour)).status).toBe(404);
  });

  it("créer puis supprimer un projet importé ; supprimer un exemple est refusé", async () => {
    const r = await send("POST", "/projects", ids.nour, {
      title: "",
      format: "podcast",
      video: { name: "mon_extrait-derja.mp4", size: 1200, type: "video/mp4", duration: 95.5, width: 1280, height: 720, privacy: "inedite", sha256: "a".repeat(64) },
    });
    expect(r.status).toBe(201);
    const p = await r.json();
    expect(p).toMatchObject({ title: "mon extrait derja", kind: "video", format: "podcast", use: "doublage_video_en_ligne", subtitle: "Podcast vidéo · inédite", example: false, accountId: ids.nour });
    expect(p.id).toMatch(/^v_[0-9a-z]{8}$/);
    expect(p.pipeline).toEqual({ status: "running", step: 0, simulated: true });
    const journal = await readJournal(t.sql, { projectId: p.id });
    expect(journal.map((e) => e.action)).toEqual(["VIDEO_IMPORTEE"]);
    expect((await send("DELETE", `/projects/${p.id}`, stranger)).status).toBe(403);
    expect((await send("DELETE", `/projects/${p.id}`, ids.nour)).status).toBe(204);
    expect((await get(`/projects/${p.id}`, ids.nour)).status).toBe(404);
    const ex = await send("DELETE", "/projects/le_dernier_car_extrait", ids.nour);
    expect(ex.status).toBe(403);
    expect((await ex.json()).message).toContain("exemple");
  });

  it("personnages : confirmation, statut de vie et voix attribuée, chacun au journal", async () => {
    const pid = "p_bledi_5";
    let r = await send("PATCH", `/projects/${pid}/characters/hamza`, ids.nour, { name: "Hamza B.", description: "Frère cadet.", confirmed: true });
    let p = await r.json();
    expect(p.characters.hamza).toMatchObject({ name: "Hamza B.", confirmed: true });
    expect(p.speakers.hamza.name).toBe("Hamza B.");
    r = await send("PATCH", `/projects/${pid}/characters/hamza`, ids.nour, { useOriginal: true, lifeStatus: "vivant" });
    p = await r.json();
    expect(p.characters.hamza.living).toEqual({ status: "a_obtenir", email: "", registered: false });
    r = await send("POST", `/projects/${pid}/characters/hamza/voice`, ids.nour, { voiceId: "v_base_omar" });
    p = await r.json();
    expect(p.speakerVoices.hamza).toBe("v_base_omar");
    expect(p.characters.hamza.useOriginal).toBe(false);
    expect((await send("POST", `/projects/${pid}/characters/hamza/voice`, ids.nour, { voiceId: "v_pirate" })).status).toBe(400);
    expect((await send("PATCH", `/projects/${pid}/characters/zz`, ids.nour, { confirmed: true })).status).toBe(404);
    const actions = (await readJournal(t.sql, { projectId: pid })).map((e) => `${e.action}:${e.decision}`);
    expect(actions).toEqual(["PERSONNAGE_CONFIRME:HUMAIN", "STATUT_DE_VIE_RENSEIGNE:VIVANT", "VOIX_ATTRIBUEE:IA"]);
    const stored = await t.sql<{ characters: Record<string, unknown> }[]>`select characters from public.projects where id = ${pid}`;
    expect(JSON.stringify(stored[0].characters)).not.toContain("living");
  });

  it("la chaîne entière reste valide après toutes ces écritures", async () => {
    expect(verifyChain(await readJournal(t.sql)).ok).toBe(true);
  });
});
