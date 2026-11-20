import { afterEach, describe, expect, it } from "vitest";
import { setEnvForTests } from "../env.js";
import { analyse, setClockForTests } from "./analysis.js";
import { setClaudeForTests, type ClaudeLike } from "./claude.js";
import { setGeminiForTests, setPauseForTests, type AnalysisMedia } from "./gemini.js";
import { setGroqForTests, type GroqLike } from "./groq.js";
import { charBudget } from "./translate.js";

const media: AnalysisMedia = { audio: { bytes: new Uint8Array([1]), mime: "audio/ogg" }, frames: [], title: "Interview", format: "film", duration: 10 };
const whisper: GroqLike = {
  audio: { transcriptions: { create: async () => ({ segments: [{ start: 0, end: 1.7, text: "شنو؟", no_speech_prob: 0 }, { start: 3.2, end: 8.9, text: "ما زلنا", no_speech_prob: 0 }] }) } },
  chat: { completions: { create: async () => ({ choices: [] }) } },
};
const gemini = {
  models: {
    generateContent: async () => ({
      text: JSON.stringify({
        speakers: [
          { key: "p1", proposedName: "Intervenant A", nameEvidence: "aucun", proposedDescription: "pose les questions", gender: "homme" },
          { key: "p2", proposedName: "Intervenant B", nameEvidence: "aucun", proposedDescription: "répond", gender: "homme" },
        ],
        segments: [
          { id: "s1", speaker: "p1", source: "شنوّة تعريفك للحب؟", certainty: 0.9, translation: "Ta définition de l’amour ?", context: "" },
          { id: "s2", speaker: "p2", source: "ما زلنا صغار على الحب", certainty: 0.9, translation: "Une traduction de Gemini beaucoup trop longue pour sa place à l’écran, vraiment trop longue.", context: "" },
        ],
      }),
    }),
  },
};
const steps: string[] = [];
const step = async (n: number, d?: string) => void steps.push(`${n}:${d}`);

afterEach(() => {
  for (const f of [setEnvForTests, setGroqForTests, setGeminiForTests, setClaudeForTests, setPauseForTests, setClockForTests]) (f as (x: null) => void)(null);
  steps.length = 0;
});

describe("Première traduction par Claude", () => {
  it("budget de caractères : 14 par seconde à l’écran, plus 0,2 s", () => {
    expect(charBudget({ start: 0, end: 1.7 })).toBe(26);
    expect(charBudget({ start: 3.2, end: 8.9 })).toBe(82);
  });

  it("Claude configuré : il traduit la derja de Gemini, reçoit le budget et l’émotion, et devient le LLM 1", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    setGroqForTests(whisper);
    setGeminiForTests(gemini);
    const seen: Record<string, unknown>[] = [];
    setClaudeForTests({
      beta: {
        messages: {
          parse: async (p) => (
            seen.push(p),
            { parsed_output: { lines: [{ id: "s1", translation: "C’est quoi, l’amour, pour toi ?", note: "" }, { id: "s2", translation: "On est encore trop jeunes pour l’amour.", note: "Raccourci." }] }, stop_reason: "end_turn", model: "claude-opus-5-5" }
          ),
        },
      },
    } as ClaudeLike);
    const r = await analyse(media, step);
    expect(r.providers.llm1).toBe("claude-opus-5-5");
    expect(r.providers.asr).toContain("gemini");
    expect(r.assembled.segments.map((s) => s.translation)).toEqual(["C’est quoi, l’amour, pour toi ?", "On est encore trop jeunes pour l’amour."]);
    expect(r.assembled.segments[1].context).toContain("Traduit par Claude.");
    expect(r.assembled.proposals.s2).toBe("On est encore trop jeunes pour l’amour.");
    const sent = JSON.parse(String((seen[0].messages as { content: string }[])[0].content));
    expect(sent.repliques[0]).toMatchObject({ id: "s1", qui: "Intervenant A", max_caracteres: 26, derja: "شنوّة تعريفك للحب؟" });
  });

  it("Claude en échec : la traduction de Gemini reste, avec une note", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    setGroqForTests(whisper);
    setGeminiForTests(gemini);
    setClaudeForTests({ beta: { messages: { parse: async () => Promise.reject(Object.assign(new Error("overloaded"), { status: 529 })) } } } as ClaudeLike);
    const r = await analyse(media, step);
    expect(r.assembled.segments[0].translation).toBe("Ta définition de l’amour ?");
    expect(r.notes.at(-1)).toContain("Traduction par Claude impossible");
  });

  it("sans clé Anthropic : Gemini refait la traduction en texte seul (gratuit), avec les budgets", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setGroqForTests(whisper);
    const calls: Record<string, unknown>[] = [];
    setGeminiForTests({
      models: {
        generateContent: async (req) => {
          calls.push(req);
          if (calls.length === 1) return gemini.models.generateContent();
          return { text: JSON.stringify({ lines: [{ id: "s1", translation: "C’est quoi l’amour, pour toi ?", note: "" }, { id: "s2", translation: "On est trop jeunes pour l’amour.", note: "" }] }) };
        },
      },
    });
    const r = await analyse(media, step);
    expect(calls).toHaveLength(2);
    expect((calls[1].config as { systemInstruction: string }).systemInstruction).toContain("max_caracteres");
    expect(r.assembled.segments[1].translation).toBe("On est trop jeunes pour l’amour.");
    expect(r.assembled.segments[1].context).toContain("Traduit par Gemini.");
    expect(steps.at(-1)).toBe("3:Traduction par Gemini…");
  });

  it("analyse déjà trop longue : la passe de traduction est sautée", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setGroqForTests(whisper);
    setGeminiForTests(gemini);
    let t = 0;
    setClockForTests(() => (t += 200_000));
    const r = await analyse(media, step);
    expect(r.assembled.segments[0].translation).toBe("Ta définition de l’amour ?");
    expect(r.notes.at(-1)).toContain("sautée");
  });
});
