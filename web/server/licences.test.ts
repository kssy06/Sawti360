import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../scripts/lib/seed-db.js";
import { app } from "./app.js";
import { readJournal } from "./audit.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { setEnvForTests } from "./env.js";
import { setMailSenderForTests, type Mail } from "./mail.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe.skipIf(!hasTestDb)("A7 · licences et paiements", () => {
  let t: TestDb;
  let nour: string;
  let lina: string;
  let other: string;
  const mails: Mail[] = [];
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setEnvForTests({ APP_URL: "https://sawti360.vercel.app" });
    setMailSenderForTests(async (m) => (mails.push(m), true));
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    lina = await createUser(t.sql, "lina@exemple.tn", { name: "Lina M." });
    other = await createUser(t.sql, "autre@exemple.tn", { name: "Autre" });
    await seedDatabase(t.sql, { nour, lina });
    const emails: Record<string, string> = { [nour]: "nour@exemple.tn", [lina]: "lina@exemple.tn", [other]: "autre@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    setDbForTests(null);
    setVerifierForTests(null);
    setMailSenderForTests(null);
    setEnvForTests(null);
    await t?.drop();
  });
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const notices = async (id: string) => (await t.sql<{ title: string; space: string }[]>`select title, space from public.notifications where account_id = ${id} order by at desc`).map((n) => `${n.space}:${n.title}`);

  let linaRequest: string;
  let samiToken: string;

  it("GET /api/voices : profils publiés, licence révoquée → indisponible", async () => {
    const voices = await (await call(nour, "GET", "/voices")).json();
    expect(voices.map((v: { voiceId: string }) => v.voiceId).sort()).toEqual(["v_hedi", "v_lina", "v_maya", "v_sami"]);
    expect(voices.find((v: { voiceId: string }) => v.voiceId === "v_hedi").availability).toBe("indisponible");
  });

  it("demande à Lina : titulaire notifiée et e-mail avec le lien, journal, voix attribuée au personnage", async () => {
    const r = await call(nour, "POST", "/license-requests", { projectId: "p_bledi_5", characterKey: "hamza", voiceId: "v_lina", message: "Pour Hamza." });
    expect(r.status).toBe(201);
    const body = await r.json();
    linaRequest = body.request.id;
    expect(body.request).toMatchObject({ status: "envoyee", payment: "en_attente", price: 120, creator: "Nour Films", token: "" });
    expect(body.licenceUrl).toBeUndefined();
    expect(body.mail).toBe(true);
    expect(body.project.speakerVoices.hamza).toBe("v_lina");
    expect(mails.at(-1)).toMatchObject({ to: "lina@exemple.tn", subject: "Nouvelle demande de licence de Nour Films" });
    expect(mails.at(-1)!.text).toMatch(/https:\/\/sawti360\.vercel\.app\/licence\/[0-9a-f]{64}/);
    expect(await notices(lina)).toContain("owner:Nouvelle demande de licence");
    expect((await readJournal(t.sql, { projectId: "p_bledi_5" })).at(-1)?.action).toBe("LICENCE_DEMANDEE");
    expect((await call(nour, "POST", "/license-requests", { projectId: "p_bledi_5", characterKey: "hamza", voiceId: "v_hedi" })).status).toBe(409);
  });

  it("demande à Sami (profil fictif sans compte) : le lien revient au créateur pour la démo", async () => {
    const body = await (await call(nour, "POST", "/license-requests", { projectId: "p_bledi_5", characterKey: "selma", voiceId: "v_sami", message: "" })).json();
    expect(body.request.payment).toBe("non_requis");
    expect(body.mail).toBe(false);
    samiToken = body.licenceUrl.split("/licence/")[1];
    expect(samiToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Lina accepte en étant connectée ; un autre compte est refusé ; deuxième décision → 409", async () => {
    expect((await call(other, "POST", `/license-requests/${linaRequest}/decision`, { accept: true })).status).toBe(403);
    const r = await call(lina, "POST", `/license-requests/${linaRequest}/decision`, { accept: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "acceptee", reference: expect.stringMatching(/^LP-2026-\d{4}$/) });
    expect(await notices(nour)).toContain("creator:Lina M. a accepté votre demande");
    expect(mails.at(-1)).toMatchObject({ to: "nour@exemple.tn", subject: "Lina M. a accepté votre demande" });
    expect((await call(lina, "POST", `/license-requests/${linaRequest}/decision`, { accept: false })).status).toBe(409);
  });

  it("par le lien, sans compte, sur un autre appareil : lecture puis refus ; une deuxième réponse → 409", async () => {
    const g = await call(null, "GET", `/public/licences/${samiToken}`);
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ ownerName: "Sami K.", projectFormat: "film", request: { status: "envoyee", characterName: "Selma" } });
    const d = await call(null, "POST", `/public/licences/${samiToken}/decision`, { accept: false });
    expect((await d.json()).status).toBe("refusee");
    expect((await call(null, "POST", `/public/licences/${samiToken}/decision`, { accept: true })).status).toBe(409);
    expect((await call(null, "GET", `/public/licences/${"0".repeat(64)}`)).status).toBe(404);
  });

  it("expiration de démonstration : la demande expire, l'acceptation est refusée (410)", async () => {
    const body = await (await call(nour, "POST", "/license-requests", { projectId: "p_bledi_5", characterKey: "selma", voiceId: "v_lina" })).json();
    expect((await call(other, "POST", `/license-requests/${body.request.id}/expire`)).status).toBe(403);
    const e = await (await call(nour, "POST", `/license-requests/${body.request.id}/expire`)).json();
    expect(e.status).toBe("expiree");
    const d = await call(lina, "POST", `/license-requests/${body.request.id}/decision`, { accept: true });
    expect(d.status).toBe(410);
    expect((await d.json()).error).toBe("EXPIRE");
    expect(await notices(nour)).toContain("creator:Demande expirée après 72 h");
  });

  it("« Payer » confirme tout de suite, 0 DT débité ; l'échec simulé reste possible ; règles du paiement", async () => {
    const r = await call(nour, "POST", "/payments", { kind: "licence", requestId: linaRequest });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.payment).toMatchObject({ kind: "licence", amount: 120, charged: 0, status: "confirme", method: "prototype_gratuit" });
    expect(body.request).toMatchObject({ payment: "confirme" });
    expect(body.balance).toBe(100000);
    expect(await notices(lina)).toContain("owner:Licence payée");
    expect((await call(nour, "POST", "/payments", { kind: "licence", requestId: linaRequest })).status).toBe(409);
    expect((await call(other, "POST", "/payments", { kind: "licence", requestId: linaRequest })).status).toBe(403);
    // A new accepted request, then the demo's failure button.
    const req2 = (await (await call(nour, "POST", "/license-requests", { projectId: "le_dernier_car_extrait", characterKey: "yassine", voiceId: "v_lina" })).json()).request.id;
    expect((await call(nour, "POST", "/payments", { kind: "licence", requestId: req2 })).status).toBe(409);
    await call(lina, "POST", `/license-requests/${req2}/decision`, { accept: true });
    const failed = await (await call(nour, "POST", "/payments", { kind: "licence", requestId: req2, simulateFailure: true })).json();
    expect(failed.request.payment).toBe("echoue");
    expect((await readJournal(t.sql, { projectId: "le_dernier_car_extrait" })).at(-1)).toMatchObject({ action: "PAIEMENT_ECHOUE" });
  });

  it("changer d'offre crédite aussitôt les jetons de l'offre ; le solde suit le registre", async () => {
    const body = await (await call(nour, "POST", "/payments", { kind: "jetons", plan: "studio" })).json();
    expect(body).toMatchObject({ balance: 600000, plan: "studio", payment: { kind: "jetons", tokens: 500000, charged: 0 } });
    const me = await (await call(nour, "GET", "/me")).json();
    expect(me).toMatchObject({ plan: "studio", balance: 600000 });
  });
});
