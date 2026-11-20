import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { setEnvForTests } from "../env.js";
import { cleanSegments, groqJson, ProviderError, setGroqForTests, transcribeFrench, turnsFromWords, whisperTimeline, type GroqLike } from "./groq.js";
import { ASR_PROMPT } from "./prompts.js";

afterEach(() => {
  setGroqForTests(null);
  setEnvForTests(null);
});

describe("B2 · découpage par Whisper", () => {
  it("écarte les silences, fusionne les segments trop courts, arrondit et numérote", () => {
    const out = cleanSegments([
      { start: 0.004, end: 2.5, text: " يا ياسين ", no_speech_prob: 0.02 },
      { start: 2.5, end: 2.9, text: "الكار", no_speech_prob: 0.1 },
      { start: 3.0, end: 6.0, text: "(musique)", no_speech_prob: 0.92 },
      { start: 6.2, end: 9.876, text: "ما عنديش وقت", no_speech_prob: 0.05 },
      { start: 10, end: 10, text: "vide" },
    ]);
    expect(out).toEqual([
      { id: "s1", start: 0, end: 2.9, text: "يا ياسين الكار" },
      { id: "s2", start: 6.2, end: 9.88, text: "ما عنديش وقت" },
    ]);
  });

  it("un tout premier segment trop court est rattaché au suivant", () => {
    expect(cleanSegments([{ start: 0, end: 0.3, text: "آه" }, { start: 0.3, end: 3, text: "باهي" }])).toEqual([{ id: "s1", start: 0, end: 3, text: "آه باهي" }]);
  });

  it("appelle Groq avec la langue, verbose_json, l'amorce et sans température", async () => {
    setEnvForTests({ GROQ_API_KEY: "k" });
    const calls: Record<string, unknown>[] = [];
    setGroqForTests({
      audio: { transcriptions: { create: async (b) => (calls.push(b), { text: "x", segments: [{ start: 0, end: 2, text: "باهي", no_speech_prob: 0.01 }] }) } },
      chat: { completions: { create: async () => ({ choices: [] }) } },
    } as GroqLike);
    const r = await whisperTimeline({ bytes: new Uint8Array([1, 2]), mime: "audio/ogg" });
    expect(r).toEqual({ segments: [{ id: "s1", start: 0, end: 2, text: "باهي" }], model: "whisper-large-v3" });
    expect(calls[0]).toMatchObject({ model: "whisper-large-v3", language: "ar", response_format: "verbose_json", prompt: ASR_PROMPT, temperature: 0 });
    await transcribeFrench({ bytes: new Uint8Array([1]), mime: "audio/webm" });
    expect(calls[1]).toMatchObject({ language: "fr", response_format: "json" });
    expect(calls[1].prompt).toBeUndefined();
  });

  it("une erreur du fournisseur remonte typée (pour la chaîne de repli)", async () => {
    setEnvForTests({ GROQ_API_KEY: "k" });
    setGroqForTests({
      audio: { transcriptions: { create: async () => Promise.reject(Object.assign(new Error("Rate limit"), { status: 429 })) } },
      chat: { completions: { create: async () => ({ choices: [{ message: { content: "pas du json" } }] }) } },
    } as GroqLike);
    const err = await whisperTimeline({ bytes: new Uint8Array([1]), mime: "audio/ogg" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ provider: "groq", status: 429 });
    await expect(groqJson(z.object({ a: z.number() }), "s", "u")).rejects.toBeInstanceOf(ProviderError);
  });

  it("sans clé : erreur typée, pas de plantage", async () => {
    setEnvForTests({});
    await expect(whisperTimeline({ bytes: new Uint8Array([1]), mime: "audio/ogg" })).rejects.toMatchObject({ name: "ProviderError", provider: "groq" });
  });
});

describe("B2 · tours de parole reconstruits à partir des mots", () => {
  const w = (word: string, start: number, end: number) => ({ word, start, end });

  it("une pause ou un point d'interrogation termine le tour ; le tour s'arrête sur son dernier mot", () => {
    const turns = turnsFromWords([
      w("شنوّة", 0, 0.4), w("تعريفك", 0.45, 0.9), w("للحب؟", 0.95, 1.6),
      // the answer starts only 0.2 s later, but the question mark already ended the turn
      w("ما", 1.8, 2.0), w("زلنا", 2.05, 2.5), w("صغار", 2.55, 3.1),
      // a 0.9 s pause
      w("الحب", 4.0, 4.4), w("كلمة", 4.45, 4.9), w("كبيرة", 4.95, 5.3),
    ]);
    expect(turns.map((t) => [t.start, Number(t.end.toFixed(2)), t.text])).toEqual([
      [0, 1.7, "شنوّة تعريفك للحب؟"],
      [1.8, 3.2, "ما زلنا صغار"],
      [4.0, 5.4, "الحب كلمة كبيرة"],
    ]);
  });

  it("un fragment d'un ou deux mots coupé par une hésitation rejoint son voisin le plus proche ; une question reste seule", () => {
    const turns = turnsFromWords([
      w("وين", 0, 0.3), w("كنت؟", 0.35, 0.8),
      w("مفهوم", 2.0, 2.5),
      w("الحب", 3.9, 4.2), w("في", 4.25, 4.4), w("تونس", 4.45, 4.9),
    ]);
    // « مفهوم » is 1.2 s after the question and 1.4 s before the rest of its sentence: it never joins a question.
    expect(turns.map((t) => t.text)).toEqual(["وين كنت؟", "مفهوم الحب في تونس"]);
  });

  it("un tour trop long est coupé à sa plus longue pause ; les mots d'un segment muet sont écartés", () => {
    const words = Array.from({ length: 30 }, (_, i) => w(`m${i}`, i * 0.5, i * 0.5 + 0.4 - (i === 14 ? 0.1 : 0)));
    const turns = turnsFromWords(words, [{ start: 20, end: 30, text: "(musique)", no_speech_prob: 0.95 }]);
    expect(turns).toHaveLength(2);
    expect(turns[0].text.endsWith("m14")).toBe(true);
    expect(turns.every((t) => t.end - t.start <= 10)).toBe(true);
    expect(turnsFromWords([w("x", 21, 22)], [{ start: 20, end: 30, text: "", no_speech_prob: 0.9 }])).toEqual([]);
  });

  it("Whisper demandé avec les mots : les lignes suivent les tours, pas la grille des segments", async () => {
    setEnvForTests({ GROQ_API_KEY: "k" });
    const calls: Record<string, unknown>[] = [];
    setGroqForTests({
      audio: {
        transcriptions: {
          create: async (b) => (
            calls.push(b),
            { text: "x", segments: [{ start: 0, end: 4, text: "سؤال جواب", no_speech_prob: 0.01 }], words: [w("سؤال؟", 0.1, 1.2), w("جواب", 1.5, 3.4)] }
          ),
        },
      },
      chat: { completions: { create: async () => ({ choices: [] }) } },
    } as GroqLike);
    const r = await whisperTimeline({ bytes: new Uint8Array([1]), mime: "audio/ogg" });
    expect(calls[0].timestamp_granularities).toEqual(["word", "segment"]);
    expect(r.segments).toEqual([
      { id: "s1", start: 0.1, end: 1.3, text: "سؤال؟" },
      { id: "s2", start: 1.5, end: 3.5, text: "جواب" },
    ]);
  });
});

