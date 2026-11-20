import { afterEach, describe, expect, it } from "vitest";
import { paragraphFor } from "../../src/mock/registry.js";
import { setEnvForTests } from "../env.js";
import { setGroqForTests, type GroqLike } from "./groq.js";
import { checkSample, matchOf, measuresProblem } from "./voicecheck.js";
import { normalizeWords, wordErrorRate } from "./wer.js";

const PARA = paragraphFor("lina");
const ok = { duration: 30, peak: 0.6, rms: 0.2 };

describe("B7 · WER du texte lu", () => {
  it("normalise : minuscules, accents, ponctuation, espaces", () => {
    expect(normalizeWords("Ce matin, le VENT venait de la mer… L’odeur du jasmin !")).toEqual(["ce", "matin", "le", "vent", "venait", "de", "la", "mer", "l", "odeur", "du", "jasmin"]);
  });
  it("lecture exacte : 0 ; un mot sur dix changé : 0,1 ; autre texte : bien au-delà de 0,5", () => {
    expect(wordErrorRate(PARA, PARA.toUpperCase())).toBe(0);
    expect(wordErrorRate("un deux trois quatre cinq six sept huit neuf dix", "un deux trois quatre cinq six sept huit neuf onze")).toBeCloseTo(0.1);
    expect(wordErrorRate(PARA, "Bonjour, je lis complètement autre chose que le paragraphe demandé.")).toBeGreaterThan(0.5);
  });
  it("seuils d'IA.md § 6", () => {
    expect([matchOf(0.2), matchOf(0.25), matchOf(0.4), matchOf(0.51)]).toEqual(["correspondance", "correspondance", "a_verifier", "non_conforme"]);
  });
});

describe("B7 · contrôle de l'échantillon", () => {
  afterEach(() => {
    setGroqForTests(null);
    setEnvForTests(null);
  });
  it("mesures : durée, niveau, saturation", () => {
    expect(measuresProblem({ ...ok, duration: 2 }, 3)).toContain("trop court");
    expect(measuresProblem({ ...ok, duration: 5 }, 8)).toContain("8 s");
    expect(measuresProblem({ ...ok, peak: 0.02 }, 3)).toContain("faible");
    expect(measuresProblem({ ...ok, peak: 0.995 }, 3)).toContain("saturé");
    expect(measuresProblem(ok, 8)).toBeNull();
  });
  it("lecture du paragraphe → correspondance ; autre texte → non conforme ; sans Groq → mesures seules", async () => {
    setEnvForTests({ GROQ_API_KEY: "k" });
    let heard = PARA;
    const calls: Record<string, unknown>[] = [];
    setGroqForTests({ audio: { transcriptions: { create: async (b) => (calls.push(b), { text: heard }) } }, chat: { completions: { create: async () => ({ choices: [] }) } } } as GroqLike);
    const audio = { bytes: new Uint8Array([1]), mime: "audio/webm" };
    expect(await checkSample(audio, ok, PARA, 8)).toMatchObject({ match: "correspondance", wer: 0, provider: "whisper-large-v3 (Groq)" });
    expect(calls[0]).toMatchObject({ language: "fr" });
    expect(calls[0].prompt).toBeUndefined();
    heard = "Aujourd’hui il fait beau et je parle d’autre chose.";
    expect((await checkSample(audio, ok, PARA, 8)).match).toBe("non_conforme");
    setEnvForTests({});
    setGroqForTests(null);
    expect(await checkSample(audio, ok, PARA, 8)).toMatchObject({ match: "mesures" });
  });
});
