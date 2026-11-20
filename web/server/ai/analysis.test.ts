import { afterEach, describe, expect, it } from "vitest";
import { setEnvForTests } from "../env.js";
import { analyse, assembleAnalysis, assembleTimed, fitsOnScreen } from "./analysis.js";
import { setGeminiForTests, setPauseForTests, type AnalysisMedia, type GeminiLike } from "./gemini.js";
import { setGroqForTests, type GroqLike, type TimedSegment } from "./groq.js";
import type { AnalysisOut } from "./schemas.js";

const TIMELINE: TimedSegment[] = [
  { id: "s1", start: 0.4, end: 3.1, text: "يا ياسين الكار" },
  { id: "s2", start: 3.4, end: 6.2, text: "ماعنديش وقت" },
  { id: "s3", start: 6.8, end: 9.9, text: "(bruit)" },
  { id: "s4", start: 10.3, end: 12.6, text: "أمي قالتلي" },
];

const OUT: AnalysisOut = {
  speakers: [
    { key: "p1", proposedName: "Amel", nameEvidence: "prononcé à 00:01 par l’autre voix", proposedDescription: "Jeune femme pressée.", gender: "femme" },
    { key: "p2", proposedName: "Intervenant B", nameEvidence: "aucun", proposedDescription: "Ami qui doit rentrer.", gender: "homme" },
  ],
  segments: [
    { id: "s1", speaker: "p1", source: "يا ياسين، الكار يخرج على الخمسة و نص.", certainty: 1.4, translation: "Yassine, le car part à cinq heures et demie.", context: "Elle s’adresse à lui." },
    { id: "s2", speaker: "p2", source: "ما عنديش وقت، نستناك قدام الدار.", certainty: 0.88, translation: "Je n’ai pas le temps, je t’attends devant la maison.", context: "Il répond." },
    { id: "s3", speaker: "p1", source: "[silence]", certainty: 0.9, translation: "", context: "" },
    { id: "s9", speaker: "p2", source: "inventé", certainty: 0.5, translation: "Inventé.", context: "" },
  ],
};

describe("B3 · contrôles du code sur l'analyse de Gemini", () => {
  const a = assembleAnalysis(TIMELINE, OUT);

  it("garde exactement les identifiants et horodatages de Whisper, retire les silences", () => {
    expect(a.segments.map((s) => [s.id, s.start, s.end])).toEqual([
      ["s1", 0.4, 3.1],
      ["s2", 3.4, 6.2],
      ["s4", 10.3, 12.6],
    ]);
  });

  it("la derja vient de Gemini, pas de Whisper ; nombres et négation intacts ; certitude bornée", () => {
    expect(a.segments[0]).toMatchObject({ source: "يا ياسين، الكار يخرج على الخمسة و نص.", confidence: 1, validated: false, speaker: "p1" });
    expect(a.segments[1].translation).toBe("Je n’ai pas le temps, je t’attends devant la maison.");
  });

  it("un segment absent de la réponse garde le texte de Whisper, sans traduction, signalé", () => {
    expect(a.segments[2]).toMatchObject({ id: "s4", source: "أمي قالتلي", translation: "", context: expect.stringContaining("Non traduit") });
  });

  it("personnages proposés, à confirmer ; traduction LLM 1 gardée comme proposition ; fits calculé", () => {
    expect(Object.keys(a.characters)).toEqual(["p1", "p2"]);
    expect(a.characters.p1).toMatchObject({ proposedName: "Amel", name: "Amel", confirmed: false, useOriginal: false, lifeStatus: "a_renseigner" });
    expect(a.speakers.p2).toEqual({ name: "Intervenant B", gender: "homme" });
    expect(a.proposals).toEqual({ s1: a.segments[0].translation, s2: a.segments[1].translation, s4: "" });
    // 44 caractères / 14 par seconde = 3,1 s > 2,7 s à l'écran + 0,2 s : trop longue.
    expect(a.segments[0].fits).toBe(false);
    expect(a.segments[1].fits).toBe(false);
    expect(fitsOnScreen("Je n’ai pas le temps.", 3.4, 6.2)).toBe(true);
    expect(fitsOnScreen("x".repeat(60), 0, 2)).toBe(false);
  });

  it("un intervenant inconnu est rattaché au premier, avec une note", () => {
    const b = assembleAnalysis(TIMELINE.slice(0, 1), { ...OUT, segments: [{ ...OUT.segments[0], speaker: "zz" }] });
    expect(b.segments[0].speaker).toBe("p1");
    expect(b.segments[0].context).toContain("rattaché à p1");
  });

  it("Gemini seul : identifiants donnés par le code, confiance fixée à 0,5", () => {
    const t = assembleTimed(
      {
        speakers: OUT.speakers,
        segments: [
          { speaker: "p2", source: "ب", certainty: 0.9, translation: "B", context: "", start: 5, end: 7 },
          { speaker: "p1", source: "أ", certainty: 0.9, translation: "A", context: "", start: 1, end: 3 },
          { speaker: "p1", source: "[silence]", certainty: 1, translation: "", context: "", start: 8, end: 9 },
        ],
      },
      60,
    );
    expect(t.segments.map((s) => [s.id, s.start, s.confidence, s.translation])).toEqual([
      ["s1", 1, 0.5, "A"],
      ["s2", 5, 0.5, "B"],
    ]);
  });
});

describe("B3 · chaîne de repli de l'analyse", () => {
  const media: AnalysisMedia = { audio: { bytes: new Uint8Array([1, 2, 3]), mime: "audio/ogg" }, frames: [{ t: 1, bytes: new Uint8Array([9]), mime: "image/jpeg" }], title: "Test", format: "film", duration: 13 };
  const steps: string[] = [];
  const step = async (n: number, d?: string) => void steps.push(`${n}:${d}`);
  const whisper = (fail = false): GroqLike => ({
    audio: { transcriptions: { create: async () => (fail ? Promise.reject(new Error("quota")) : { segments: TIMELINE.map((s) => ({ ...s, no_speech_prob: 0 })) }) } },
    chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(OUT) } }] }) } },
  });
  const geminiOk = (seen: Record<string, unknown>[] = []): GeminiLike => ({ models: { generateContent: async (r) => (seen.push(r), { text: JSON.stringify(OUT) }) } });
  afterEach(() => {
    setGroqForTests(null);
    setGeminiForTests(null);
    setEnvForTests(null);
    setPauseForTests(null);
    steps.length = 0;
  });

  it("Whisper + Gemini : l'audio et les images partent dans un seul appel, modèles notés", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    const seen: Record<string, unknown>[] = [];
    setGroqForTests(whisper());
    setGeminiForTests(geminiOk(seen));
    const r = await analyse(media, step);
    expect(r.providers).toEqual({ bornes: "whisper-large-v3 (Groq)", asr: "gemini-3.8-flash", llm1: "gemini-3.8-flash" });
    expect(r.assembled.segments).toHaveLength(3);
    const parts = (seen[0].contents as { parts: Record<string, unknown>[] }[])[0].parts;
    expect(parts[0]).toMatchObject({ inlineData: { mimeType: "audio/ogg" } });
    expect(parts[1]).toEqual({ text: "Image à 1,0 s :" });
    expect(JSON.parse(String((parts.at(-1) as { text: string }).text)).segments[0]).toEqual({ id: "s1", start: 0.4, end: 3.1, texte: "يا ياسين الكار" });
    expect(steps.map((s) => s.split(":")[0])).toEqual(["1", "2", "3"]);
  });

  it("Groq en panne : Gemini découpe seul (confiance 0,5)", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setGroqForTests(whisper(true));
    setGeminiForTests({ models: { generateContent: async () => ({ text: JSON.stringify({ speakers: OUT.speakers, segments: [{ speaker: "p1", source: "أ", certainty: 0.9, translation: "A", context: "", start: 1, end: 3 }] }) }) } });
    const r = await analyse(media, step);
    expect(r.providers.asr).toBe("gemini-3.8-flash (sans Whisper)");
    expect(r.assembled.segments[0].confidence).toBe(0.5);
    expect(r.notes[0]).toContain("quota");
  });

  it("Gemini surchargé (503) : nouvel essai, puis un modèle de secours ; on garde l'écoute de l'audio", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setPauseForTests(async () => undefined);
    setGroqForTests(whisper());
    const models: string[] = [];
    setGeminiForTests({
      models: {
        generateContent: async (r) => {
          models.push(String(r.model));
          if (r.model === "gemini-3.8-flash") return Promise.reject(Object.assign(new Error("503 high demand"), { status: 503 }));
          return { text: JSON.stringify(OUT) };
        },
      },
    });
    const r = await analyse(media, step);
    expect(models).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-flash-latest"]);
    expect(r.providers.llm1).toBe("gemini-flash-latest");
    expect(r.notes).toEqual([]);
  });

  it("Gemini en panne : Groq traduit le texte seul (« sans image »)", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" });
    setPauseForTests(async () => undefined);
    setGroqForTests(whisper());
    setGeminiForTests({ models: { generateContent: async () => Promise.reject(Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 })) } });
    const r = await analyse(media, step);
    expect(r.providers.llm1).toBe("openai/gpt-oss-120b (Groq), texte seul");
    expect(r.assembled.segments[0].context).toContain("Traduit sans image");
  });

  it("aucun fournisseur : 502 FOURNISSEUR_IA lisible", async () => {
    setEnvForTests({});
    await expect(analyse(media, step)).rejects.toMatchObject({ status: 502, code: "FOURNISSEUR_IA" });
  });
});

describe("B3 · clés d'intervenants mal écrites par le modèle", () => {
  const speakers: AnalysisOut["speakers"] = [
    { key: "p1", proposedName: "Amel", nameEvidence: "aucun", proposedDescription: "", gender: "femme" },
    { key: "p2", proposedName: "Yassine", nameEvidence: "aucun", proposedDescription: "", gender: "homme" },
  ];
  const seg = (id: string, speaker: string) => ({ id, speaker, source: "س", certainty: 0.9, translation: "T", context: "" });
  const timeline: TimedSegment[] = ["s1", "s2", "s3", "s4", "s5"].map((id, i) => ({ id, start: i * 2, end: i * 2 + 1.5, text: "x" }));

  it("« P2 », « p02 », « speaker_2 » et le prénom désignent bien le deuxième intervenant : le dialogue garde ses deux voix", () => {
    const a = assembleAnalysis(timeline, { speakers, segments: [seg("s1", "p1"), seg("s2", "P2"), seg("s3", "p02"), seg("s4", "speaker_2"), seg("s5", "Yassine")] });
    expect(a.segments.map((s) => s.speaker)).toEqual(["p1", "p2", "p2", "p2", "p2"]);
    expect(Object.keys(a.characters)).toEqual(["p1", "p2"]);
    expect(a.segments.every((s) => !s.context?.includes("rattaché"))).toBe(true);
  });

  it("des clés déclarées inutilisables (« Intervenant A ») sont renommées p1, p2 et retrouvées sur les segments", () => {
    const odd = speakers.map((s, i) => ({ ...s, key: `Intervenant ${"AB"[i]}` }));
    const a = assembleAnalysis(timeline.slice(0, 2), { speakers: odd, segments: [seg("s1", "Intervenant A"), seg("s2", "Intervenant B")] });
    expect(a.segments.map((s) => s.speaker)).toEqual(["p1", "p2"]);
    expect(a.characters.p2).toMatchObject({ name: "Yassine" });
  });
});
