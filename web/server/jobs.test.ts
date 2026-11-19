import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { setVerifierForTests } from "./auth.js";
import { setDbForTests } from "./db.js";
import { ensureIdle, isStale, setBackgroundForTests, STALE_MESSAGE, startJob } from "./jobs.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "./test/db.js";

describe("A6 · tâches longues (pur)", () => {
  it("une tâche silencieuse depuis plus de 300 s est périmée", () => {
    const now = Date.now();
    expect(isStale({ status: "running", updated_at: new Date(now - 301_000) }, now)).toBe(true);
    expect(isStale({ status: "running", updated_at: new Date(now - 10_000) }, now)).toBe(false);
    expect(isStale({ status: "done", updated_at: new Date(now - 900_000) }, now)).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("A6 · tâches longues sur Postgres", () => {
  let t: TestDb;
  let me: string;
  let other: string;
  const running: Promise<unknown>[] = [];
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setBackgroundForTests((p) => running.push(p));
    me = await createUser(t.sql, "moi@exemple.tn");
    other = await createUser(t.sql, "autre@exemple.tn");
    const emails: Record<string, string> = { [me]: "moi@exemple.tn", [other]: "autre@exemple.tn" };
    setVerifierForTests(async (tok) => (emails[tok] ? { id: tok, email: emails[tok] } : null));
  }, 30_000);
  afterAll(async () => {
    await Promise.allSettled(running);
    setDbForTests(null);
    setBackgroundForTests(null);
    setVerifierForTests(null);
    await t?.drop();
  });
  const poll = async (id: string, who = me) => (await app.request(`/api/jobs/${id}`, { headers: { authorization: `Bearer ${who}` } })).json();

  it("queued → running (étapes visibles par interrogation) → done, avec le résultat et les modèles", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const atStep2 = new Promise<void>((r) => (reached = r));
    const id = await startJob(t.sql, { kind: "analysis", accountId: me, projectId: "p1" }, async (ctx) => {
      await ctx.step(1, "Découpage des prises de parole…");
      await ctx.step(2, "Transcription de 14 segments…");
      ctx.providers.asr = "modèle-de-test";
      reached();
      await gate;
      return { segments: 14 };
    });
    await atStep2;
    expect(await poll(id)).toMatchObject({ id, kind: "analysis", status: "running", step: 2, detail: "Transcription de 14 segments…", projectId: "p1" });
    release();
    await Promise.all(running);
    expect(await poll(id)).toMatchObject({ status: "done", step: 2, result: { segments: 14 }, providers: { asr: "modèle-de-test" } });
  });

  it("une erreur du travail termine la tâche en erreur, avec le message", async () => {
    const id = await startJob(t.sql, { kind: "review", accountId: me, projectId: "p1" }, async () => {
      throw new Error("Tous les fournisseurs ont échoué.");
    });
    await Promise.all(running);
    expect(await poll(id)).toMatchObject({ status: "error", error: "Tous les fournisseurs ont échoué." });
  });

  it("une tâche bloquée depuis plus de 300 s est lue en erreur et peut être relancée", async () => {
    const [row] = await t.sql<{ id: string }[]>`
      insert into public.jobs (account_id, project_id, kind, status, step, updated_at)
      values (${me}, 'p2', 'analysis', 'running', 3, now() - interval '301 seconds') returning id`;
    await expect(ensureIdle(t.sql, "p2", "analysis")).resolves.toBeUndefined();
    expect(await poll(row.id)).toMatchObject({ status: "error", error: STALE_MESSAGE, step: 3 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fresh = await startJob(t.sql, { kind: "analysis", accountId: me, projectId: "p2" }, () => gate);
    await expect(ensureIdle(t.sql, "p2", "analysis")).rejects.toMatchObject({ status: 409, code: "EN_COURS" });
    expect((await poll(fresh)).status).toMatch(/queued|running/);
    release();
    await Promise.all(running);
  });

  it("la tâche d'un autre compte est refusée ; une tâche publique se lit sans compte, sans son résultat", async () => {
    const mine = await startJob(t.sql, { kind: "dossier_check", accountId: me, projectId: "p3" }, async () => ({ secret: 1 }));
    const pub = await startJob(t.sql, { kind: "voice_check", accountId: null, projectId: null }, async () => ({ wer: 0.1 }));
    await Promise.all(running);
    expect((await app.request(`/api/jobs/${mine}`, { headers: { authorization: `Bearer ${other}` } })).status).toBe(403);
    expect((await app.request(`/api/public/jobs/${mine}`)).status).toBe(404);
    const pr = await app.request(`/api/public/jobs/${pub}`);
    expect(pr.status).toBe(200);
    expect((await pr.json()).result).toBeUndefined();
    expect((await app.request(`/api/jobs/pas-un-uuid`, { headers: { authorization: `Bearer ${me}` } })).status).toBe(404);
  });
});
