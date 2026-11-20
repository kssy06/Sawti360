import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { sha256Hex } from "../src/core/canonical.js";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { assertOwnPath, cleanMime, planUpload, setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const ACC = "11111111-2222-4333-8444-555555555555";

describe("A5 · règles d'envoi (pures)", () => {
  const now = new Date("2026-11-20T09:00:00Z");
  it("fabrique les chemins d'API.md", () => {
    expect(planUpload({ kind: "audio", accountId: ACC, projectId: "v_abc", contentType: "audio/ogg", size: 200_000 })).toEqual({ bucket: "media", path: `${ACC}/v_abc/audio.ogg`, contentType: "audio/ogg" });
    expect(planUpload({ kind: "frame", accountId: ACC, projectId: "v_abc", contentType: "image/jpeg", size: 30_000, t: 12000 }).path).toBe(`${ACC}/v_abc/frames/12000.jpg`);
    expect(planUpload({ kind: "original", accountId: ACC, projectId: "v_abc", contentType: "video/mp4", size: 9_000_000 }).path).toBe(`${ACC}/v_abc/original.mp4`);
    expect(planUpload({ kind: "dossier", accountId: ACC, projectId: "v_abc", characterKey: "jeddi", contentType: "application/pdf", size: 100, sha256: "a".repeat(64) })).toMatchObject({ bucket: "dossiers", path: `${ACC}/v_abc/jeddi/${"a".repeat(64)}.pdf` });
    expect(planUpload({ kind: "sample", accountId: ACC, contentType: "audio/webm;codecs=opus", size: 100, now })).toEqual({ bucket: "samples", path: `${ACC}/sample-${now.getTime()}.webm`, contentType: "audio/webm" });
    expect(planUpload({ kind: "sample", accountId: "public", consentId: "c1", contentType: "audio/wav", size: 100, now }).path).toBe(`public/c1/sample-${now.getTime()}.wav`);
    // An imported .webm is labelled « video/webm » by the browser: same container, relabelled for the bucket.
    expect(planUpload({ kind: "sample", accountId: "public", consentId: "c1", contentType: "video/webm", size: 100, now })).toMatchObject({ contentType: "audio/webm", path: `public/c1/sample-${now.getTime()}.webm` });
    expect(planUpload({ kind: "sample", accountId: ACC, contentType: "audio/x-wav", size: 100, now }).contentType).toBe("audio/wav");
    expect(() => planUpload({ kind: "frame", accountId: ACC, projectId: "v_abc", contentType: "video/webm", size: 100, t: 0 })).toThrow(/Type de fichier refusé/);
  });
  it("mauvais type → 400 ; trop gros → 413", () => {
    expect(() => planUpload({ kind: "audio", accountId: ACC, projectId: "v_abc", contentType: "application/x-msdownload", size: 10 })).toThrow(/Type de fichier refusé/);
    try {
      planUpload({ kind: "frame", accountId: ACC, projectId: "v_abc", contentType: "image/jpeg", size: 2 * 1024 * 1024, t: 0 });
      throw new Error("aucune erreur");
    } catch (e) {
      expect((e as { status: number; code: string }).status).toBe(413);
      expect((e as { code: string }).code).toBe("FICHIER_TROP_GROS");
    }
    expect(() => planUpload({ kind: "frame", accountId: ACC, projectId: "v_abc", contentType: "image/jpeg", size: 10 })).toThrow(/Instant/);
    expect(() => planUpload({ kind: "dossier", accountId: ACC, projectId: "v_abc", characterKey: "a b", contentType: "application/pdf", size: 10, sha256: "a".repeat(64) })).toThrow(/Personnage/);
    expect(() => planUpload({ kind: "audio", accountId: ACC, projectId: "../x", contentType: "audio/ogg", size: 10 })).toThrow(/Projet/);
  });
  it("un chemin renvoyé par le navigateur reste dans le préfixe du compte", () => {
    expect(() => assertOwnPath(`${ACC}/v_abc/audio.ogg`, `${ACC}/v_abc`)).not.toThrow();
    expect(() => assertOwnPath(`autre/v_abc/audio.ogg`, `${ACC}/v_abc`)).toThrow();
    expect(() => assertOwnPath(`${ACC}/v_abc/../../x`, `${ACC}/v_abc`)).toThrow();
    expect(cleanMime("Audio/WEBM; codecs=opus")).toBe("audio/webm");
  });
});

describe.skipIf(!hasTestDb)("A5 · routes d'envoi", () => {
  let t: TestDb;
  let nour: string;
  let other: string;
  const signed: string[] = [];
  const fake: FileStore = {
    signUpload: async (bucket, path) => (signed.push(`${bucket}/${path}`), { signedUrl: `https://stockage/${bucket}/${path}?token=t`, token: "t" }),
    signRead: async (bucket, path) => `https://stockage/${bucket}/${path}?lecture`,
    read: async () => new Uint8Array(),
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setFileStoreForTests(fake);
    nour = await createUser(t.sql, "nour@exemple.tn");
    other = await createUser(t.sql, "autre@exemple.tn");
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn") });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [other]: "autre@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setFileStoreForTests(null);
    setVerifierForTests(null);
    await t?.drop();
  });
  const post = (path: string, body: unknown, id?: string) =>
    app.request(`/api${path}`, { method: "POST", headers: { "content-type": "application/json", ...(id ? { authorization: `Bearer ${id}` } : {}) }, body: JSON.stringify(body) });

  it("audio, image, dossier et échantillon vont aux bons chemins", async () => {
    let r = await post("/uploads", { kind: "audio", projectId: "le_dernier_car_extrait", contentType: "audio/ogg", size: 180_000 }, nour);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ bucket: "media", path: `${nour}/le_dernier_car_extrait/audio.ogg`, token: "t", contentType: "audio/ogg" });
    r = await post("/uploads", { kind: "frame", projectId: "le_dernier_car_extrait", contentType: "image/jpeg", size: 40_000, t: 2500 }, nour);
    expect((await r.json()).path).toBe(`${nour}/le_dernier_car_extrait/frames/2500.jpg`);
    r = await post("/uploads", { kind: "dossier", projectId: "p_hkeyet_jeddi", characterKey: "jeddi", contentType: "application/pdf", size: 200_000, sha256: "b".repeat(64) }, nour);
    expect((await r.json()).bucket).toBe("dossiers");
    r = await post("/uploads", { kind: "sample", contentType: "audio/webm;codecs=opus", size: 300_000 }, nour);
    expect((await r.json()).path).toMatch(new RegExp(`^${nour}/sample-\\d+\\.webm$`));
  });

  it("mauvais type → 400 ; trop gros → 413 ; projet d'un autre compte → 403 ; sans jeton → 401", async () => {
    expect((await post("/uploads", { kind: "audio", projectId: "le_dernier_car_extrait", contentType: "text/html", size: 10 }, nour)).status).toBe(400);
    expect((await post("/uploads", { kind: "audio", projectId: "le_dernier_car_extrait", contentType: "audio/ogg", size: 30 * 1024 * 1024 }, nour)).status).toBe(413);
    expect((await post("/uploads", { kind: "audio", projectId: "le_dernier_car_extrait", contentType: "audio/ogg", size: 100 }, other)).status).toBe(403);
    expect((await post("/uploads", { kind: "dossier", projectId: "p_hkeyet_jeddi", characterKey: "personne", contentType: "application/pdf", size: 100, sha256: "b".repeat(64) }, nour)).status).toBe(404);
    expect((await post("/uploads", { kind: "audio", bucket: "samples", projectId: "le_dernier_car_extrait", contentType: "audio/ogg", size: 100 }, nour)).status).toBe(400);
    expect((await post("/uploads", { kind: "sample", contentType: "audio/ogg", size: 100 })).status).toBe(401);
  });

  it("envoi public accepté seulement avec un jeton de consentement valide et en attente", async () => {
    const token = randomBytes(32).toString("hex");
    const [row] = await t.sql<{ id: string }[]>`
      insert into public.consents (project_id, character_key, email, token_hash) values ('p_hkeyet_jeddi', 'narr', 'x@y.tn', ${sha256Hex(token)}) returning id`;
    let r = await post("/public/uploads", { token, contentType: "audio/webm", size: 50_000 });
    expect(r.status).toBe(200);
    expect((await r.json()).path).toMatch(new RegExp(`^public/${row.id}/sample-\\d+\\.webm$`));
    expect((await post("/public/uploads", { token: randomBytes(32).toString("hex"), contentType: "audio/webm", size: 50 })).status).toBe(404);
    await t.sql`update public.consents set status = 'autorisee' where id = ${row.id}`;
    expect((await post("/public/uploads", { token, contentType: "audio/webm", size: 50 })).status).toBe(409);
    expect((await post("/public/uploads", { token: "court", contentType: "audio/webm", size: 50 })).status).toBe(400);
  });
});
