import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { PROJECT, voiceById } from "../src/core/catalog.js";
import { verifyLicense } from "../src/core/crypto.js";
import type { VoiceLicense } from "../src/core/types.js";
import { setSynthesizerForTests } from "./ai/elevenlabs.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setBackgroundForTests } from "./jobs.js";
import { setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const PID = PROJECT.id;

describe.skipIf(!hasTestDb)("A10 · espace propriétaire vocal", () => {
  let t: TestDb;
  let nour: string;
  let lina: string;
  let sami: string;
  const running: Promise<unknown>[] = [];
  const stored = new Map<string, Uint8Array>();
  const fakeFiles: FileStore = {
    signUpload: async () => ({ signedUrl: "https://stockage/x", token: "t" }),
    signRead: async (b, p) => `https://stockage/${b}/${p}`,
    read: async (b, p) => stored.get(`${b}/${p}`) ?? Promise.reject(new Error(`absent ${p}`)),
    write: async () => undefined,
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({});
    setBackgroundForTests((p) => running.push(p));
    setFileStoreForTests(fakeFiles);
    setSynthesizerForTests(async (_v, text) => ({ bytes: new TextEncoder().encode(text), mime: "audio/mpeg", mock: false, ms: 5 }));
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    lina = await createUser(t.sql, "lina@exemple.tn", { name: "Lina M." });
    sami = await createUser(t.sql, "sami@exemple.tn", { name: "Sami Ben Ali" });
    await seedDatabase(t.sql, { nour, lina });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [lina]: "lina@exemple.tn", [sami]: "sami@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    for (const f of [setDbForTests, setEnvForTests, setBackgroundForTests, setFileStoreForTests, setSynthesizerForTests, setVerifierForTests]) (f as (x: null) => void)(null);
    await t?.drop();
  });
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const profile = { publicName: "Sami B.", pseudonym: true, languages: ["Français", "Arabe tunisien"], description: "Voix grave.", price: 80, conditions: "Pas de publicité.", availability: "disponible", sampleText: "Bonjour", tags: ["grave"] };
  const job = async (id: string) => {
    await Promise.all(running.splice(0));
    return (await call(sami, "GET", `/jobs/${id}`)).json();
  };
  const notices = async (id: string) => (await t.sql<{ title: string }[]>`select title from public.notifications where account_id = ${id} order by at desc, id desc`).map((n) => n.title);

  it("lecture trop courte (moins de 8 s) → refusée par le contrôle, aucun passeport", async () => {
    stored.set(`samples/${sami}/sample-1.webm`, new Uint8Array([1, 2, 3]));
    const r = await call(sami, "POST", "/owner/voice", { profile, samplePath: `${sami}/sample-1.webm`, duration: 5.2, peak: 0.6, rms: 0.1 });
    expect(r.status).toBe(202);
    const j = await job((await r.json()).jobId);
    expect(j.status).toBe("error");
    expect(j.error).toMatch(/8 s/);
    expect(await t.sql`select 1 from public.voice_profiles where account_id = ${sami}`).toHaveLength(0);
  });

  it("chemin d'échantillon d'un autre compte → 400", async () => {
    expect((await call(sami, "POST", "/owner/voice", { profile, samplePath: `${lina}/sample-1.webm`, duration: 12, peak: 0.6, rms: 0.1 })).status).toBe(400);
  });

  it("création : contrôle passé, profil publié, licence signée par le serveur, journal ; une seule voix par compte", async () => {
    stored.set(`samples/${sami}/sample-2.webm`, new Uint8Array([4, 5, 6, 7]));
    const r = await call(sami, "POST", "/owner/voice", { profile, samplePath: `${sami}/sample-2.webm`, duration: 12.4, peak: 0.6, rms: 0.12 });
    const j = await job((await r.json()).jobId);
    expect(j).toMatchObject({ status: "done", kind: "voice_check" });
    const boot = await (await call(sami, "GET", "/bootstrap")).json();
    const owned = boot.ownedVoices[sami];
    expect(owned.voiceId).toMatch(/^v_user_[0-9a-f]{8}$/);
    expect(owned.profile).toMatchObject({ publicName: "Sami B.", price: 80, availability: "disponible" });
    const lic = boot.licenses.find((l: VoiceLicense) => l.voice_id === owned.voiceId) as VoiceLicense;
    expect(lic).toMatchObject({ holder_name: "Sami B.", owner_share: 0.7, status: "active", demo: false });
    expect(verifyLicense(lic)).toBe(true);
    const [row] = await t.sql<{ eleven_voice_id: string; published: boolean }[]>`select eleven_voice_id, published from public.voice_profiles where account_id = ${sami}`;
    expect(row).toEqual({ eleven_voice_id: voiceById("v_neutre")!.eleven_voice_id, published: true });
    expect((await (await call(nour, "GET", "/voices")).json()).map((v: { voiceId: string }) => v.voiceId)).toContain(owned.voiceId);
    expect((await readJournal(t.sql)).at(-1)).toMatchObject({ action: "PASSEPORT_DE_VOIX_CREE", actor: "Sami Ben Ali", decision: "CREE" });
    expect((await call(sami, "POST", "/owner/voice", { profile, samplePath: `${sami}/sample-2.webm`, duration: 12, peak: 0.6, rms: 0.1 })).status).toBe(409);
  });

  it("profil et tarif modifiés ; champ inconnu → 400 ; sans passeport → 404", async () => {
    const r = await call(sami, "PATCH", "/owner/voice/profile", { price: 120, description: "Voix grave, rythme lent." });
    expect(r.status).toBe(200);
    expect((await r.json()).profile).toMatchObject({ price: 120, description: "Voix grave, rythme lent.", publicName: "Sami B." });
    expect((await readJournal(t.sql)).at(-1)?.action).toBe("PROFIL_PUBLIC_MIS_A_JOUR");
    expect((await call(sami, "PATCH", "/owner/voice/profile", { accountId: nour })).status).toBe(400);
    expect((await call(nour, "PATCH", "/owner/voice/profile", { price: 1 })).status).toBe(404);
  });

  it("règles signées à nouveau ; un usage interdit d'office reste refusé", async () => {
    const before = (await (await call(lina, "GET", "/bootstrap")).json()).licenses.find((l: VoiceLicense) => l.license_id === "VL-2026-0001") as VoiceLicense;
    const r = await call(lina, "PATCH", "/owner/voice/rules", { allowed_uses: ["doublage_film", "doublage_video_en_ligne", "contenu_politique"], forbidden_themes: ["politique", "religion", "alcool_paris"] });
    expect(r.status).toBe(200);
    const lic = (await r.json()) as VoiceLicense;
    expect(lic.allowed_uses).toEqual(["doublage_film", "doublage_video_en_ligne"]);
    expect(lic.forbidden_themes).toEqual(["politique", "religion", "alcool_paris"]);
    expect(lic.signature).not.toBe(before.signature);
    expect(verifyLicense(lic)).toBe(true);
    expect((await readJournal(t.sql)).at(-1)).toMatchObject({ action: "PASSEPORT_MIS_A_JOUR", decision: "SIGNE" });
    expect((await call(lina, "PATCH", "/owner/voice/rules", { allowed_uses: ["contenu_intime"], forbidden_themes: [] })).status).toBe(400);
  });

  it("révocation : créateurs notifiés, génération suivante refusée (LICENCE_REVOQUEE) ; rétablissement", async () => {
    await call(nour, "PATCH", `/projects/${PID}/segments/s1`, { validated: true });
    expect((await (await call(nour, "POST", `/projects/${PID}/segments/s1/synthesize`)).json()).gen.status).toBe("ok");
    expect((await call(sami, "POST", "/owner/licenses/VL-2026-0001/revoke")).status).toBe(403);

    const r = await call(lina, "POST", "/owner/licenses/VL-2026-0001/revoke");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "revoked", revoked_at: expect.any(String) });
    expect((await readJournal(t.sql)).at(-1)).toMatchObject({ action: "LICENCE_REVOQUEE", decision: "REVOQUEE" });
    expect((await notices(nour))[0]).toBe("Lina M. a révoqué sa licence");
    expect(await notices(lina)).not.toContain("Lina M. a révoqué sa licence");
    const refused = await (await call(nour, "POST", `/projects/${PID}/segments/s1/synthesize`)).json();
    expect(refused.gen).toMatchObject({ status: "refused", decision: { reason_code: "LICENCE_REVOQUEE" } });
    expect((await (await call(nour, "GET", "/voices")).json()).find((v: { voiceId: string }) => v.voiceId === "v_lina").availability).toBe("indisponible");

    const back = await call(lina, "POST", "/owner/licenses/VL-2026-0001/reinstate");
    expect(await back.json()).toMatchObject({ status: "active", revoked_at: null });
    expect((await readJournal(t.sql)).at(-1)?.action).toBe("LICENCE_RETABLIE");
    expect((await (await call(nour, "POST", `/projects/${PID}/segments/s1/synthesize`)).json()).gen.status).toBe("ok");
  });
});
