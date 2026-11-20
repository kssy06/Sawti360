import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { PROJECT } from "../src/core/catalog.js";
import { DEMO_PUBLIC_KEY, platformPublicKey, signLicense, trustPlatformKey, verifyLicense } from "../src/core/crypto.js";
import { verifyPassport, type Passport360 } from "../src/core/passport.js";
import type { AuditEntry, VoiceLicense } from "../src/core/types.js";
import { passportId } from "../src/state/workflow.js";
import { setSynthesizerForTests } from "./ai/elevenlabs.js";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setBackgroundForTests } from "./jobs.js";
import { setMailSenderForTests } from "./mail.js";
import { publicKeyHex, signLicenseServer } from "./sign.js";
import { setFileStoreForTests, type FileStore } from "./storage.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

const SEED = randomBytes(32).toString("hex");
const PID = PROJECT.id;

describe.skipIf(!hasTestDb)("A8 · signatures et passeports", () => {
  let t: TestDb;
  let nour: string;
  let other: string;
  const running: Promise<unknown>[] = [];
  const fakeFiles: FileStore = {
    signUpload: async () => ({ signedUrl: "https://stockage/x", token: "t" }),
    signRead: async (b, p) => `https://stockage/${b}/${p}`,
    read: async () => new Uint8Array(),
    write: async () => undefined,
    remove: async () => undefined,
  };
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({ SAWTI_SIGNING_SEED: SEED, APP_URL: "https://sawti360.vercel.app" });
    setBackgroundForTests((p) => running.push(p));
    setFileStoreForTests(fakeFiles);
    setMailSenderForTests(async () => true);
    setSynthesizerForTests(async (_v, text) => ({ bytes: new TextEncoder().encode(text), mime: "audio/mpeg", mock: false, ms: 5 }));
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    other = await createUser(t.sql, "autre@exemple.tn", { name: "Autre" });
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn", { name: "Lina M." }) });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [other]: "autre@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    for (const f of [setDbForTests, setEnvForTests, setBackgroundForTests, setFileStoreForTests, setMailSenderForTests, setSynthesizerForTests, setVerifierForTests]) (f as (x: null) => void)(null);
    trustPlatformKey(null);
    await t?.drop();
  });
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  /** As the browser does: the published key (VITE_SAWTI_PUBLIC_KEY), then verifyPassport with the chain. */
  const verifyInBrowser = (p: Passport360, journal: AuditEntry[]) => {
    trustPlatformKey(publicKeyHex(SEED));
    try {
      return verifyPassport(p, journal);
    } finally {
      trustPlatformKey(() => publicKeyHex());
    }
  };

  it("le serveur vérifie avec la clé de sa graine ; les licences de la graine de démo sont signées avec elle", async () => {
    expect(publicKeyHex(SEED)).not.toBe(DEMO_PUBLIC_KEY);
    expect(platformPublicKey()).toBe(publicKeyHex(SEED));
    const health = await (await call(null, "GET", "/health")).json();
    expect(health.publicKey).toBe(publicKeyHex(SEED));
    const rows = await t.sql<{ data: VoiceLicense }[]>`select data from public.voice_licenses`;
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => verifyLicense(r.data))).toBe(true);
    // A licence signed with the public demo key is not trusted by a server that has its own seed.
    expect(verifyLicense(signLicense(rows[0].data))).toBe(false);
    expect(verifyLicense(signLicenseServer(rows[0].data))).toBe(true);
  });

  it("runGate accepte les licences signées par le serveur, refuse une licence altérée (SIGNATURE_INVALIDE)", async () => {
    expect((await call(nour, "PATCH", `/projects/${PID}/segments/s2`, { validated: true })).status).toBe(200);
    const ok = await (await call(nour, "POST", `/projects/${PID}/segments/s2/synthesize`)).json();
    expect(ok.gen).toMatchObject({ status: "ok", decision: { reason_code: "OK", license_id: "VL-2026-0002" } });
    // Someone widens Sami's licence in the base without the platform's key.
    await t.sql`update public.voice_licenses set data = jsonb_set(data, '{allowed_uses}', '["doublage_film","publicite"]') where license_id = 'VL-2026-0002'`;
    const refused = await (await call(nour, "POST", `/projects/${PID}/segments/s2/synthesize`)).json();
    expect(refused.gen).toMatchObject({ status: "refused", decision: { reason_code: "SIGNATURE_INVALIDE" } });
    await t.sql`update public.voice_licenses set data = jsonb_set(data, '{allowed_uses}', '["doublage_film","bande_annonce"]') where license_id = 'VL-2026-0002'`;
    expect((await (await call(nour, "POST", `/projects/${PID}/segments/s2/synthesize`)).json()).gen.status).toBe("ok");
  });

  it("passeport signé à la fin de la génération ; lu sans compte par son identifiant, vérifié dans le navigateur", async () => {
    for (const s of ["s1", "s2", "s3", "s4", "s5", "s6"]) await call(nour, "PATCH", `/projects/${PID}/segments/${s}`, { validated: true });
    expect((await call(nour, "POST", `/projects/${PID}/generation`)).status).toBe(202);
    await Promise.all(running.splice(0));
    const id = passportId(PID);
    const r = await call(null, "GET", `/public/passports/${id.toLowerCase()}`);
    expect(r.status).toBe(200);
    const { passport, journal } = (await r.json()) as { passport: Passport360; journal: AuditEntry[] };
    expect(passport.identifiant).toBe(id);
    expect(passport.signature).toMatchObject({ algorithme: "Ed25519", cle_publique: publicKeyHex(SEED) });
    expect(passport.transparence.repliques_generees).toBe(6);
    expect(passport.responsabilite.validateur).toBe("Nour Films");
    expect(journal).toHaveLength(passport.responsabilite.nombre_entrees);
    const check = verifyInBrowser(passport, journal);
    expect(check.checks.map((c) => `${c.id}:${c.state}`)).toEqual(["signature:ok", "cle:ok", "journal:ok"]);
    expect(check.valid).toBe(true);

    // One field changed → signature invalid; a journal entry changed → chain broken.
    const forged = { ...passport, transparence: { ...passport.transparence, repliques_generees: 7 } };
    expect(verifyInBrowser(forged, journal).checks.find((c) => c.id === "signature")?.state).toBe("fail");
    const tampered = journal.map((e, i) => (i === 3 ? { ...e, actor: "Quelqu’un d’autre" } : e));
    expect(verifyInBrowser(passport, tampered).checks.find((c) => c.id === "journal")?.state).toBe("fail");
    // A browser trusting only the demo key (simulated mode) does not vouch for the server's passport.
    trustPlatformKey(null);
    expect(verifyPassport(passport, journal).checks.find((c) => c.id === "cle")?.state).toBe("fail");
    trustPlatformKey(() => publicKeyHex());
    const project = await (await call(nour, "GET", "/bootstrap")).json();
    expect(project.passports[PID].signature.valeur).toBe(passport.signature!.valeur);
  });

  it("POST …/passport : signé à nouveau, PASSEPORT_EXPORTE au journal ; autre compte refusé", async () => {
    const before = (await (await call(null, "GET", `/public/passports/${passportId(PID)}`)).json()).passport as Passport360;
    const r = await call(nour, "POST", `/projects/${PID}/passport`);
    expect(r.status).toBe(200);
    const again = (await r.json()) as Passport360;
    expect(again.signature!.valeur).not.toBe(before.signature!.valeur);
    expect(again.responsabilite.nombre_entrees).toBeGreaterThan(before.responsabilite.nombre_entrees);
    const [last] = await t.sql<{ action: string; decision: string }[]>`select action, decision from public.audit_entries order by idx desc limit 1`;
    expect(last).toEqual({ action: "PASSEPORT_EXPORTE", decision: "SIGNE" });
    const read = (await (await call(null, "GET", `/public/passports/${passportId(PID)}`)).json()) as { passport: Passport360; journal: AuditEntry[] };
    expect(read.passport.signature!.valeur).toBe(again.signature!.valeur);
    expect(verifyInBrowser(read.passport, read.journal).valid).toBe(true);
    expect((await call(other, "POST", `/projects/${PID}/passport`)).status).toBe(403);
    expect((await call(null, "POST", `/projects/${PID}/passport`)).status).toBe(401);
  });

  it("le passeport d'exemple (« Bledi ») est signé par le serveur et vérifiable avec son journal", async () => {
    const { passport, journal } = (await (await call(null, "GET", `/public/passports/${passportId("p_bledi_5")}`)).json()) as { passport: Passport360; journal: AuditEntry[] };
    expect(passport.identite.titre).toBe("Bledi, épisode 5");
    expect(verifyInBrowser(passport, journal).valid).toBe(true);
  });

  it("identifiant inconnu ou mal formé → 404", async () => {
    expect((await call(null, "GET", "/public/passports/S360-ZZZZ-ZZZZ")).status).toBe(404);
    expect((await call(null, "GET", "/public/passports/n'importe-quoi")).status).toBe(404);
  });
});
