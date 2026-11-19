import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import type { Segment } from "../src/core/types.js";
import { setGeminiForTests, type GeminiLike } from "./ai/gemini.js";
import { setGroqForTests, type GroqLike } from "./ai/groq.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setBackgroundForTests } from "./jobs.js";
import { setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const WHISPER = { segments: [{ start: 0.4, end: 3.1, text: "يا ياسين", no_speech_prob: 0.01 }, { start: 3.4, end: 6.2, text: "ماعنديش", no_speech_prob: 0.02 }] };
const GEMINI = {
  speakers: [
    { key: "p1", proposedName: "Intervenante A", nameEvidence: "aucun", proposedDescription: "Voix féminine pressée.", gender: "femme" },
    { key: "p2", proposedName: "Intervenant B", nameEvidence: "aucun", proposedDescription: "Voix masculine.", gender: "homme" },
  ],
  segments: [
    { id: "s1", speaker: "p1", source: "يا ياسين، الكار يخرج على الخمسة و نص.", certainty: 0.93, translation: "Yassine, le car part à 17 h 30.", context: "Elle l’appelle." },
    { id: "s2", speaker: "p2", source: "خلّصت فيه 300 دينار", certainty: 0.8, translation: "Je l’ai payé 30 dinars.", context: "Il répond." },
  ],
};

describe.skipIf(!hasTestDb)("B5 · analyse de bout en bout (serveur)", () => {
  let t: TestDb;
  let nour: string;
  let pid: string;
  const running: Promise<unknown>[] = [];
  const counts = { whisper: 0, gemini: 0 };
  const stored = new Map<string, Uint8Array>();
  const fakeFiles: FileStore = {
    signUpload: async () => ({ signedUrl: "x", token: "t" }),
    signRead: async (b, p) => `https://stockage/${b}/${p}`,
    read: async (b, p) => stored.get(`${b}/${p}`) ?? Promise.reject(Object.assign(new Error(`absent ${p}`), { status: 404 })),
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setBackgroundForTests((p) => running.push(p));
    setFileStoreForTests(fakeFiles);
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setGroqForTests({
      audio: { transcriptions: { create: async () => (counts.whisper++, WHISPER) } },
      chat: { completions: { create: async () => ({ choices: [{ message: { content: "{}" } }] }) } },
    } as GroqLike);
    setGeminiForTests({ models: { generateContent: async () => (counts.gemini++, { text: JSON.stringify(GEMINI) }) } } as GeminiLike);
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn") });
    setVerifierForTests(async (tok) => (tok === nour ? { id: nour, email: "nour@exemple.tn" } : null));
  }, 30_000);
  afterAll(async () => {
    await Promise.allSettled(running);
    for (const f of [setDbForTests, setBackgroundForTests, setFileStoreForTests, setVerifierForTests, setGroqForTests, setGeminiForTests]) (f as (x: null) => void)(null);
    setEnvForTests(null);
    await t?.drop();
  });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { authorization: `Bearer ${nour}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("crée un projet importé, puis l'analyse donne de vrais segments, personnages, traductions et relectures", async () => {
    const created = await (await call("POST", "/projects", { title: "Extrait", format: "film", video: { name: "extrait.mp4", size: 10, type: "video/mp4", duration: 7, width: 640, height: 360, privacy: "inedite" } })).json();
    pid = created.id;
    stored.set(`media/${nour}/${pid}/audio.ogg`, new Uint8Array([79, 103, 103, 83]));
    stored.set(`media/${nour}/${pid}/frames/1000.jpg`, new Uint8Array([255, 216]));
    const r = await call("POST", `/projects/${pid}/analysis`, { audio: { path: `${nour}/${pid}/audio.ogg`, sha256: "c".repeat(64), duration: 7, mime: "audio/ogg" }, frames: [{ t: 1, path: `${nour}/${pid}/frames/1000.jpg` }] });
    expect(r.status).toBe(202);
    const { jobId } = await r.json();
    expect((await call("POST", `/projects/${pid}/analysis`, { audio: { path: `${nour}/${pid}/audio.ogg`, sha256: "c".repeat(64), duration: 7, mime: "audio/ogg" } })).status).toBe(409);
    await Promise.all(running);
    const job = await (await call("GET", `/jobs/${jobId}`)).json();
    expect(job).toMatchObject({ status: "done", providers: { asr: "gemini-3.8-flash", llm1: "gemini-3.8-flash", llm2: "règles (vérificateur de fidélité)" } });
    const p = await (await call("GET", `/projects/${pid}`)).json();
    expect(p.pipeline).toMatchObject({ status: "done", step: 5, simulated: false, providers: { bornes: "whisper-large-v3 (Groq)" } });
    expect(p.segments.map((s: Segment) => s.id)).toEqual(["s1", "s2"]);
    expect(p.characters.p1).toMatchObject({ proposedName: "Intervenante A", confirmed: false });
    expect(p.reviews.s2).toMatchObject({ verdict: "correction", simulated: false });
    expect(p.proposals.s1).toBe("Yassine, le car part à 17 h 30.");
    expect((await readJournal(t.sql, { projectId: pid })).map((e) => e.action)).toEqual(["VIDEO_IMPORTEE", "ANALYSE_IA"]);
  });

  it("réimport du même fichier : résultat repris sans rappeler l'IA", async () => {
    const before = { ...counts };
    const other = await (await call("POST", "/projects", { title: "Copie", format: "film", video: { name: "extrait.mp4", size: 10, type: "video/mp4", duration: 7, width: 640, height: 360, privacy: "inedite" } })).json();
    const r = await call("POST", `/projects/${other.id}/analysis`, { audio: { path: `${nour}/${other.id}/audio.ogg`, sha256: "c".repeat(64), duration: 7, mime: "audio/ogg" } });
    const { jobId } = await r.json();
    await Promise.all(running);
    expect(counts).toEqual(before);
    const job = await (await call("GET", `/jobs/${jobId}`)).json();
    expect(job.providers.cache).toContain("même empreinte audio");
    const p = await (await call("GET", `/projects/${other.id}`)).json();
    expect(p.segments).toHaveLength(2);
    expect(p.pipeline.simulated).toBe(false);
  });

  it("en cas d'échec : erreur lisible dans le projet, puis l'exemple simulé reste possible", async () => {
    setGeminiForTests({ models: { generateContent: async () => Promise.reject(new Error("429 RESOURCE_EXHAUSTED")) } } as GeminiLike);
    setGroqForTests({ audio: { transcriptions: { create: async () => Promise.reject(new Error("quota")) } }, chat: { completions: { create: async () => Promise.reject(new Error("quota")) } } } as GroqLike);
    const created = await (await call("POST", "/projects", { title: "Échec", format: "film", video: { name: "x.mp4", size: 10, type: "video/mp4", duration: 9, width: 1, height: 1, privacy: "inedite" } })).json();
    stored.set(`media/${nour}/${created.id}/audio.ogg`, new Uint8Array([1]));
    const { jobId } = await (await call("POST", `/projects/${created.id}/analysis`, { audio: { path: `${nour}/${created.id}/audio.ogg`, sha256: "d".repeat(64), duration: 9, mime: "audio/ogg" } })).json();
    await Promise.all(running);
    expect((await (await call("GET", `/jobs/${jobId}`)).json()).status).toBe("error");
    let p = await (await call("GET", `/projects/${created.id}`)).json();
    expect(p.pipeline).toMatchObject({ status: "error", simulated: false });
    expect(p.pipeline.error).toContain("Aucun fournisseur");
    p = await (await call("POST", `/projects/${created.id}/analysis/example`)).json();
    expect(p.pipeline).toEqual({ status: "done", step: 5, simulated: true });
    expect(p.segments.length).toBeGreaterThan(1);
    expect(Object.values(p.reviews).every((r) => (r as { simulated: boolean }).simulated)).toBe(true);
  });

  it("refuse un chemin hors du projet et un extrait de plus de 5 minutes", async () => {
    const audio = { path: `autre/${pid}/audio.ogg`, sha256: "e".repeat(64), duration: 7, mime: "audio/ogg" };
    expect((await call("POST", `/projects/${pid}/analysis`, { audio })).status).toBe(400);
    expect((await call("POST", `/projects/${pid}/analysis`, { audio: { ...audio, path: `${nour}/${pid}/audio.ogg`, duration: 900 } })).status).toBe(413);
  });
});
