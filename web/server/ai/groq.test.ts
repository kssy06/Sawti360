import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { setEnvForTests } from "../env.js";
import { cleanSegments, groqJson, ProviderError, setGroqForTests, transcribeFrench, whisperTimeline, type GroqLike } from "./groq.js";
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
