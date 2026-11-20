import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../scripts/lib/seed-db.js";
import type { Segment } from "../../src/core/types.js";
import { app } from "../app.js";
import { setVerifierForTests } from "../auth.js";
import { setDbForTests } from "../db.js";
import { setEnvForTests } from "../env.js";
import { setBackgroundForTests } from "../jobs.js";
import { createTestDb, createUser, hasTestDb, type TestDb } from "../test/db.js";
import { setClaudeForTests, type ClaudeLike } from "./claude.js";
import { setGroqForTests, type GroqLike } from "./groq.js";
import { mergeReview, reviewSegments, RULES_PROVIDER, rulesReview } from "./review.js";

const seg = (id: string, source: string, translation: string): Segment => ({ id, start: 0, end: 3, speaker: "p1", source, confidence: 0.9, translation, validated: false });
const DINARS = seg("s3", "خلّصت فيه 300 دينار، موش شوية!", "Je l’ai payé 30 dinars, ce n’est pas rien !");
const NEGATION = seg("s5", "ما نخليهمش يسكتونا.", "Je les laisse nous faire taire.");
const FINE = seg("s2", "ما عنديش وقت، نستناك قدام الدار.", "Je n’ai pas le temps, je t’attends devant la maison.");

describe("B4 · erreurs injectées signalées", () => {
  it("règles seules : 30 dinars au lieu de 300 → correction appliquable ; négation perdue → signalée", () => {
    expect(rulesReview(DINARS)).toMatchObject({ verdict: "correction", suggestion: "Je l’ai payé 300 dinars, ce n’est pas rien !", simulated: false, provider: RULES_PROVIDER });
    expect(rulesReview(NEGATION)).toMatchObject({ verdict: "correction", note: expect.stringContaining("Négation") });
    expect(rulesReview(FINE).verdict).toBe("ok");
  });

  it("le LLM 2 juge « ok » une ligne que les règles signalent : « à relire », jamais accepté en silence", () => {
    const r = mergeReview(DINARS, { id: "s3", verdict: "ok", note: "Rien à corriger.", suggestion: null }, "claude-opus-5-5");
    expect(r.verdict).toBe("correction");
    expect(r.note).toMatch(/^Le vérificateur automatique signale : Chiffres différents.*: à relire\. \(Sawti Check : Rien à corriger\.\)$/);
    expect(r.suggestion).toBeUndefined();
  });

  it("correction du LLM 2 gardée avec sa suggestion ; ligne absente de sa réponse → règles", () => {
    const r = mergeReview(NEGATION, { id: "s5", verdict: "correction", note: "La négation « ma … ch » a disparu.", suggestion: "Je ne les laisserai pas nous faire taire." }, "claude-opus-5-5");
    expect(r).toEqual({ verdict: "correction", note: "La négation « ma … ch » a disparu.", suggestion: "Je ne les laisserai pas nous faire taire.", simulated: false, provider: "claude-opus-5-5" });
    expect(mergeReview(DINARS, undefined, "x").provider).toBe(RULES_PROVIDER);
  });
});

describe("B4 · chaîne Claude → Groq → règles", () => {
  const answer = { reviews: [{ id: "s5", verdict: "correction", note: "Négation perdue.", suggestion: "Je ne les laisserai pas nous faire taire." }, { id: "s2", verdict: "ok", note: "Fidèle.", suggestion: null }] };
  const calls: Record<string, unknown>[] = [];
  const claudeOk: ClaudeLike = { beta: { messages: { parse: async (p) => (calls.push(p), { parsed_output: answer, stop_reason: "end_turn", model: "claude-opus-5-5" }) } } };
  const claudeRefuses: ClaudeLike = { beta: { messages: { parse: async () => ({ parsed_output: null, stop_reason: "refusal", model: "claude-opus-5-5" }) } } };
  const groqOk: GroqLike = {
    audio: { transcriptions: { create: async () => ({}) } },
    chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) } },
  };
  const groqDown: GroqLike = { ...groqOk, chat: { completions: { create: async () => Promise.reject(new Error("503")) } } };
  afterEach(() => {
    setClaudeForTests(null);
    setGroqForTests(null);
    setEnvForTests(null);
    calls.length = 0;
  });

  it("Claude d'abord, avec sortie structurée, effort moyen et repli serveur en cas de refus", async () => {
    setEnvForTests({ ANTHROPIC_API_KEY: "k", GROQ_API_KEY: "k" });
    setClaudeForTests(claudeOk);
    setGroqForTests(groqOk);
    const r = await reviewSegments([NEGATION, FINE, DINARS]);
    expect(r.provider).toBe("claude-opus-5-5");
    expect(r.reviews.s5.suggestion).toBe("Je ne les laisserai pas nous faire taire.");
    expect(r.reviews.s3.verdict).toBe("correction");
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } });
    expect((calls[0].output_config as { format: unknown }).format).toBeTruthy();
    const sent = JSON.parse((calls[0].messages as { content: string }[])[0].content);
    expect(sent.repliques.find((x: { id: string }) => x.id === "s3").alertes[0]).toContain("Chiffres différents");
  });

  it("un modèle Haiku part sans repli serveur (il n'en a pas)", async () => {
    setEnvForTests({ ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-haiku-5-5" });
    setClaudeForTests(claudeOk);
    await reviewSegments([FINE]);
    expect(calls[0].fallbacks).toBeUndefined();
    expect(calls[0].betas).toBeUndefined();
  });

  it("Claude refuse → Groq ; Groq en panne → règles ; aucune clé → règles", async () => {
    setEnvForTests({ ANTHROPIC_API_KEY: "k", GROQ_API_KEY: "k" });
    setClaudeForTests(claudeRefuses);
    setGroqForTests(groqOk);
    let r = await reviewSegments([NEGATION, FINE]);
    expect(r.provider).toBe("openai/gpt-oss-120b (Groq)");
    expect(r.notes[0]).toContain("décliné");
    setGroqForTests(groqDown);
    r = await reviewSegments([NEGATION, DINARS]);
    expect(r.provider).toBe(RULES_PROVIDER);
    expect(r.reviews.s3.suggestion).toBe("Je l’ai payé 300 dinars, ce n’est pas rien !");
    setEnvForTests({});
    setClaudeForTests(null);
    setGroqForTests(null);
    r = await reviewSegments([DINARS]);
    expect(r).toMatchObject({ provider: RULES_PROVIDER, notes: [] });
  });
});

describe.skipIf(!hasTestDb)("B4 · routes de relecture", () => {
  let t: TestDb;
  let nour: string;
  const running: Promise<unknown>[] = [];
  beforeAll(async () => {
    t = await createTestDb();
    setDbForTests(t.sql);
    setBackgroundForTests((p) => running.push(p));
    nour = await createUser(t.sql, "nour@exemple.tn", { name: "Nour Films" });
    await seedDatabase(t.sql, { nour, lina: await createUser(t.sql, "lina@exemple.tn") });
    setVerifierForTests(async (tok) => (tok === nour ? { id: nour, email: "nour@exemple.tn" } : null));
  }, 30_000);
  afterAll(async () => {
    await Promise.allSettled(running);
    setDbForTests(null);
    setBackgroundForTests(null);
    setVerifierForTests(null);
    setEnvForTests(null);
    await t?.drop();
  });
  const h = { authorization: `Bearer ${"x"}`, "content-type": "application/json" };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, { method, headers: { ...h, authorization: `Bearer ${nour}` }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("relecture réelle (règles) écrite dans le projet, puis « Appliquer » remet la réplique à approuver", async () => {
    setEnvForTests({});
    const r = await call("POST", "/projects/le_dernier_car_extrait/review", {});
    expect(r.status).toBe(202);
    const { jobId } = await r.json();
    await Promise.all(running);
    const job = await (await call("GET", `/jobs/${jobId}`)).json();
    expect(job).toMatchObject({ status: "done", providers: { llm2: RULES_PROVIDER } });
    let p = await (await call("GET", "/projects/le_dernier_car_extrait")).json();
    expect(p.reviews.s3).toMatchObject({ verdict: "correction", simulated: false, suggestion: "Je l’ai payé 300 dinars, ce n’est pas rien !" });
    p = await (await call("POST", "/projects/le_dernier_car_extrait/segments/s3/apply-suggestion")).json();
    expect(p.segments.find((s: Segment) => s.id === "s3")).toMatchObject({ translation: "Je l’ai payé 300 dinars, ce n’est pas rien !", validated: false });
    // Sawti Check's review is kept: after a revert, its wording can be applied again.
    expect(p.reviews.s3).toMatchObject({ verdict: "correction", suggestion: "Je l’ai payé 300 dinars, ce n’est pas rien !" });
    expect((await call("POST", "/projects/le_dernier_car_extrait/segments/s3/apply-suggestion")).status).toBe(409);
    await call("PATCH", "/projects/le_dernier_car_extrait/segments/s3", { translation: "Je l’ai payé 30 dinars, ce n’est pas rien !" });
    p = await (await call("POST", "/projects/le_dernier_car_extrait/segments/s3/apply-suggestion")).json();
    expect(p.segments.find((s: Segment) => s.id === "s3").translation).toBe("Je l’ai payé 300 dinars, ce n’est pas rien !");
  });
});
