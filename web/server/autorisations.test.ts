import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { setGeminiForTests, type GeminiLike } from "./ai/gemini.js";
import type { DossierOut } from "./ai/schemas.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setBackgroundForTests } from "./jobs.js";
import { setMailSenderForTests, type Mail } from "./mail.js";
import { setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("D2, D3 · autorisations sur Postgres", () => {
  let t: TestDb;
  let nour: string;
  const running: Promise<unknown>[] = [];
  const mails: Mail[] = [];
  const stored = new Map<string, Uint8Array>();
  let dossierAnswer: DossierOut;
  const fakeFiles: FileStore = {
    signUpload: async () => ({ signedUrl: "https://stockage/x", token: "t" }),
    signRead: async (b, p) => `https://stockage/${b}/${p}`,
    read: async (b, p) => stored.get(`${b}/${p}`) ?? Promise.reject(new Error(`absent ${p}`)),
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setBackgroundForTests((p) => running.push(p));
    setFileStoreForTests(fakeFiles);
    setMailSenderForTests(async (m) => (mails.push(m), true));
    setEnvForTests({ APP_URL: "https://sawti360.vercel.app", GEMINI_API_KEY: "k" });
    setGeminiForTests({ models: { generateContent: async () => ({ text: JSON.stringify(dossierAnswer) }) } } as GeminiLike);
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn") });
    setVerifierForTests(async (tok) => (tok === nour ? { id: nour, email: "nour@exemple.tn" } : null));
  }, 30_000);
  afterAll(async () => {
    await Promise.allSettled(running);
    for (const f of [setDbForTests, setBackgroundForTests, setFileStoreForTests, setVerifierForTests, setMailSenderForTests, setGeminiForTests]) (f as (x: null) => void)(null);
    setEnvForTests(null);
    await t?.drop();
  });
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const settle = () => Promise.allSettled(running);

  /* -------------------------------------------------------------- D2 */
  let token = "";
  it("D2 · demande envoyée : lien sécurisé par e-mail, rendu une seule fois, journal", async () => {
    const r = await call(nour, "POST", "/projects/p_bledi_5/characters/hamza/consent", { email: "Hamza@Exemple.tn", registered: false });
    expect(r.status).toBe(201);
    const body = await r.json();
    token = body.consentUrl.split("/consentement/")[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.mail).toBe(true);
    expect(body.project.characters.hamza.living).toMatchObject({ status: "en_attente", email: "hamza@exemple.tn", registered: false });
    expect(JSON.stringify(body.project)).not.toContain(token);
    expect(mails.at(-1)).toMatchObject({ to: "hamza@exemple.tn", subject: "Nour Films demande votre accord pour utiliser votre voix" });
    expect(mails.at(-1)!.text).toContain(`/consentement/${token}`);
    expect((await readJournal(t.sql, { projectId: "p_bledi_5" })).at(-1)).toMatchObject({ action: "CONSENTEMENT_DEMANDE", decision: "EN_ATTENTE" });
  });

  it("D2 · la page publique s'ouvre sans compte ; accepter exige d'abord le Passeport de voix", async () => {
    const page = await (await call(null, "GET", `/public/consents/${token}`)).json();
    expect(page).toMatchObject({ projectTitle: "Bledi, épisode 5", creatorName: "Nour Films", characterName: "Hamza", status: "en_attente", registered: false, voiceCreated: false });
    expect(page.paragraph.length).toBeGreaterThan(80);
    expect((await call(null, "POST", `/public/consents/${token}/decision`, { accept: true })).status).toBe(409);
  });

  it("D2 · la personne crée elle-même son Passeport de voix (échantillon contrôlé), non publié", async () => {
    const ticket = await (await call(null, "POST", "/public/uploads", { token, contentType: "audio/webm", size: 9000 })).json();
    stored.set(`samples/${ticket.path}`, new Uint8Array([26, 69, 223, 163]));
    const short = await (await call(null, "POST", `/public/consents/${token}/voice-passport`, { samplePath: ticket.path, duration: 1.2, peak: 0.5, rms: 0.1 })).json();
    await settle();
    expect((await (await call(null, "GET", `/public/jobs/${short.jobId}`)).json()).error).toContain("trop court");
    expect((await call(null, "POST", `/public/consents/${token}/voice-passport`, { samplePath: "autre/sample.webm", duration: 5, peak: 0.5, rms: 0.1 })).status).toBe(400);
    const ok = await (await call(null, "POST", `/public/consents/${token}/voice-passport`, { samplePath: ticket.path, duration: 6.4, peak: 0.62, rms: 0.18 })).json();
    await settle();
    expect(await (await call(null, "GET", `/public/jobs/${ok.jobId}`)).json()).toMatchObject({ status: "done" });
    expect((await (await call(null, "GET", `/public/consents/${token}`)).json()).voiceCreated).toBe(true);
    const [profile] = await t.sql<{ published: boolean; account_id: string | null }[]>`select published, account_id from public.voice_profiles where voice_id like 'v_c_%'`;
    expect(profile).toEqual({ published: false, account_id: null });
    const voices = await (await call(nour, "GET", "/voices")).json();
    expect(voices.some((v: { voiceId: string }) => v.voiceId.startsWith("v_c_"))).toBe(false);
  });

  it("D2 · accord → « Autorisée » chez le créateur, notifié et prévenu par e-mail ; deuxième réponse → 409", async () => {
    expect(await (await call(null, "POST", `/public/consents/${token}/decision`, { accept: true })).json()).toEqual({ status: "autorisee" });
    const p = await (await call(nour, "GET", "/projects/p_bledi_5")).json();
    expect(p.characters.hamza.living).toMatchObject({ status: "autorisee", registered: true });
    expect(mails.at(-1)).toMatchObject({ to: "nour@exemple.tn", subject: "Hamza a accepté votre demande" });
    const [n] = await t.sql<{ title: string }[]>`select title from public.notifications where account_id = ${nour} order by at desc limit 1`;
    expect(n.title).toBe("Hamza a donné son consentement");
    expect((await call(null, "POST", `/public/consents/${token}/decision`, { accept: false })).status).toBe(409);
  });

  it("D2 · un nouvel envoi remplace l'ancien lien (404) ; un refus bloque", async () => {
    const first = (await (await call(nour, "POST", "/projects/p_bledi_5/characters/selma/consent", { email: "s@x.tn", registered: true })).json()).consentUrl.split("/consentement/")[1];
    const second = (await (await call(nour, "POST", "/projects/p_bledi_5/characters/selma/consent", { email: "s@x.tn", registered: true })).json()).consentUrl.split("/consentement/")[1];
    expect((await call(null, "GET", `/public/consents/${first}`)).status).toBe(404);
    expect(await (await call(null, "POST", `/public/consents/${second}/decision`, { accept: false })).json()).toEqual({ status: "refusee" });
    const p = await (await call(nour, "GET", "/projects/p_bledi_5")).json();
    expect(p.characters.selma.living.status).toBe("refusee");
  });

  /* -------------------------------------------------------------- D3 */
  const base: DossierOut = {
    documentReadable: true,
    extractedPerson: "Mohamed B.",
    extractedRole: "le conteur de l’épisode (le grand-père)",
    nameMatchesDeclared: true,
    matchedCharacterKey: "jeddi",
    proposedOutcome: "correspondance",
    videoFinding: "Le grand-père raconte ses souvenirs du souk.",
    explanation: "Le rôle écrit correspond à Jeddi.",
  };
  const send = async (hash: string) => {
    const path = `${nour}/p_hkeyet_jeddi/jeddi/${hash}.pdf`;
    stored.set(`dossiers/${path}`, new Uint8Array([37, 80, 68, 70]));
    const r = await call(nour, "POST", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier", {
      path,
      deceasedName: "Mohamed B.",
      declaredRole: "Le conteur de l’épisode",
      fileName: "autorisation.pdf",
      fileSize: 1200,
      fileType: "application/pdf",
      fileHash: hash,
    });
    return { status: r.status, body: await r.json() };
  };

  it("D3 · (1) correspondance → validation humaine ; journal ; document jamais renvoyé", async () => {
    dossierAnswer = base;
    const { status, body } = await send("a".repeat(64));
    expect(status).toBe(202);
    expect(body.project.characters.jeddi.dossier).toMatchObject({ status: "recu", reference: expect.stringMatching(/^DF-2026-\d{5}$/) });
    await settle();
    let p = await (await call(nour, "GET", "/projects/p_hkeyet_jeddi")).json();
    expect(p.characters.jeddi.dossier).toMatchObject({ status: "correspondance", check: { outcome: "correspondance", simulated: false, provider: "gemini-3.8-flash" } });
    expect(JSON.stringify(p)).not.toContain(`${nour}/p_hkeyet_jeddi/jeddi/`);
    p = await (await call(nour, "POST", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier/validate")).json();
    expect(p.characters.jeddi.dossier).toMatchObject({ status: "valide", validatedBy: "Nour Films" });
    const actions = (await readJournal(t.sql, { projectId: "p_hkeyet_jeddi" })).map((e) => `${e.action}:${e.decision}`);
    expect(actions.slice(-3)).toEqual(["DOSSIER_FAMILIAL_RECU:RECU", "CONTROLE_COHERENCE:CORRESPONDANCE", "DOSSIER_FAMILIAL_VALIDE:VALIDE"]);
  });

  it("D3 · (2) rôle de la narratrice → incohérence, validation refusée ; (3) document sans rôle → vérification", async () => {
    dossierAnswer = { ...base, extractedRole: "la narratrice", matchedCharacterKey: "narr" };
    await send("b".repeat(64));
    await settle();
    let p = await (await call(nour, "GET", "/projects/p_hkeyet_jeddi")).json();
    expect(p.characters.jeddi.dossier.status).toBe("incoherence");
    expect((await call(nour, "POST", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier/validate")).status).toBe(409);
    dossierAnswer = { ...base, documentReadable: false, extractedRole: "" };
    await send("c".repeat(64));
    await settle();
    p = await (await call(nour, "GET", "/projects/p_hkeyet_jeddi")).json();
    expect(p.characters.jeddi.dossier.status).toBe("verification");
    p = await (await call(nour, "POST", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier/complementary")).json();
    expect(p.characters.jeddi.dossier.complementaryRequestedAt).toBeTruthy();
    p = await (await call(nour, "DELETE", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier")).json();
    expect(p.characters.jeddi.dossier).toEqual({ status: "manquant", deceasedName: "Mohamed B.", declaredRole: "Le conteur de l’épisode" });
  });

  it("D3 · un chemin hors du personnage est refusé", async () => {
    const r = await call(nour, "POST", "/projects/p_hkeyet_jeddi/characters/jeddi/dossier", {
      path: `${nour}/p_hkeyet_jeddi/narr/${"d".repeat(64)}.pdf`,
      deceasedName: "X",
      declaredRole: "Y",
      fileName: "x.pdf",
      fileSize: 10,
      fileType: "application/pdf",
      fileHash: "d".repeat(64),
    });
    expect(r.status).toBe(400);
  });
});
