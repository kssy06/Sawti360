import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { PROJECT } from "../src/core/catalog.js";
import { setSynthesizerForTests } from "./ai/elevenlabs.js";
import { setGroqForTests, type GroqLike } from "./ai/groq.js";
import { app } from "./app.js";
import { silentWav } from "./audio.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const PID = PROJECT.id; // s1 : 0,4 → 3,1 s, soit 2,7 s à l'écran

describe.skipIf(!hasTestDb)("C2 · ajustement du débit", () => {
  let t: TestDb;
  let nour: string;
  const speeds: (number | undefined)[] = [];
  const fakeFiles: FileStore = {
    signUpload: async () => ({ signedUrl: "x", token: "t" }),
    signRead: async (b, p) => `https://stockage/${b}/${p}`,
    read: async () => new Uint8Array(),
    write: async () => undefined,
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({});
    setFileStoreForTests(fakeFiles);
    // 10 characters a second at normal speed: the length of the line decides.
    setSynthesizerForTests(async (_v, text, o) => (speeds.push(o?.speed), { bytes: new Uint8Array(silentWav([...text].length / 10 / (o?.speed ?? 1))), mime: "audio/wav", mock: true, ms: 1 }));
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn") });
    setVerifierForTests(async (tok) => (tok === nour ? { id: nour, email: "nour@exemple.tn" } : null));
  }, 30_000);
  afterAll(async () => {
    for (const f of [setDbForTests, setEnvForTests, setFileStoreForTests, setSynthesizerForTests, setVerifierForTests, setGroqForTests]) (f as (x: null) => void)(null);
    await t?.drop();
  });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { authorization: `Bearer ${nour}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const say = async (text: string) => {
    await call("PATCH", `/projects/${PID}/segments/s1`, { translation: text });
    await call("PATCH", `/projects/${PID}/segments/s1`, { validated: true });
    speeds.length = 0;
    return (await (await call("POST", `/projects/${PID}/segments/s1/synthesize`)).json()).gen;
  };
  const reviewOf = async () => (await (await call("GET", `/projects/${PID}`)).json()).reviews.s1;

  it("une réplique qui tient dans sa place n'est pas touchée", async () => {
    const gen = await say("Le car part à cinq heures.");
    expect(gen).toMatchObject({ status: "ok", fit: { seconds: 2.6, slot: 2.7, tooLong: false } });
    expect(gen.fit.speed).toBeUndefined();
    expect(speeds).toEqual([undefined]);
  });

  it("un peu trop longue → synthétisée à nouveau plus vite (×1,15 au plus), et elle tient", async () => {
    const gen = await say("Le car part à cinq heures et demie"); // 34 caractères : 3,4 s, puis 2,96 s à ×1,15
    expect(speeds).toEqual([undefined, 1.15]);
    expect(gen).toMatchObject({ status: "ok", fit: { slot: 2.7, speed: 1.15, tooLong: false } });
    expect(gen.fit.seconds).toBeLessThanOrEqual(3.0);
  });

  it("bien trop longue → signalée, version courte proposée par le LLM 2 (jamais appliquée seule)", async () => {
    setGroqForTests({ chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ translation: "Le car part à 17 h 30." }) } }] }) } } } as unknown as GroqLike);
    const long = "Yassine, écoute-moi bien, le car part à cinq heures et demie précises.";
    const gen = await say(long);
    expect(gen).toMatchObject({ status: "ok", fit: { speed: 1.15, tooLong: true } });
    const review = await reviewOf();
    expect(review).toMatchObject({ verdict: "correction", suggestion: "Le car part à 17 h 30.", simulated: false });
    expect(review.note).toMatch(/Trop longue pour sa place : 6,\d s pour 2,7 s à l’écran, même accélérée ×1,15/);
    const p = await (await call("GET", `/projects/${PID}`)).json();
    expect(p.segments.find((s: { id: string }) => s.id === "s1").translation).toBe(long);
  });

  it("sans modèle de langue : signalée, avec la consigne de la raccourcir", async () => {
    setGroqForTests(null);
    await say("Yassine, écoute-moi bien, le car part à cinq heures et demie précises.");
    const review = await reviewOf();
    expect(review.suggestion).toBeUndefined();
    expect(review.note).toMatch(/Raccourcissez-la/);
  });
});
