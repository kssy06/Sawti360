/**
 * Gemini: the only free model that hears the audio and sees the images in the same call.
 * It writes the derja, finds the speakers and translates (LLM 1); it also reads family dossiers.
 */
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { env } from "../env.js";
import { ProviderError, type AudioInput, type TimedSegment } from "./groq.js";
import { GLOSSAIRE, PROMPT_ANALYSE, PROMPT_ANALYSE_SANS_WHISPER } from "./prompts.js";
import { AnalysisOut, AnalysisOutTimed, jsonSchemaOf, parseModelJson } from "./schemas.js";

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiLike {
  models: { generateContent(req: Record<string, unknown>): Promise<{ text?: string | undefined }> };
}

let client: GeminiLike | null = null;

export function gemini(): GeminiLike {
  if (client) return client;
  const key = env().GEMINI_API_KEY;
  if (!key) throw new ProviderError("gemini", "", "GEMINI_API_KEY absent");
  client = new GoogleGenAI({ apiKey: key }) as unknown as GeminiLike;
  return client;
}

export function setGeminiForTests(c: GeminiLike | null): void {
  client = c;
}

export const geminiConfigured = () => Boolean(client || env().GEMINI_API_KEY);

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export const inline = (bytes: Uint8Array, mimeType: string): Part => ({ inlineData: { mimeType, data: b64(bytes) } });

/**
 * Models tried in turn when the configured one is overloaded. Free-tier Gemini answers 503 « high
 * demand » or 429 at busy times; without these the analysis fell back to a text-only model that
 * cannot hear the voices, and an interview came out as a single speaker.
 */
export const GEMINI_BACKUP_MODELS = ["gemini-flash-latest", "gemini-3.5-flash"];
const RETRYABLE = new Set([429, 500, 503, 504]);
let pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function setPauseForTests(fn: ((ms: number) => Promise<void>) | null): void {
  pause = fn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/**
 * One structured call: system prompt, parts, JSON validated by zod. A busy model (429, 5xx) is
 * retried once after a short pause, then the backup models are tried; any other error stops at once.
 */
export async function geminiJson<T>(schema: z.ZodType<T>, system: string, parts: Part[], model = env().models.gemini): Promise<{ data: T; model: string }> {
  const models = [model, ...GEMINI_BACKUP_MODELS.filter((m) => m !== model)];
  let last: unknown;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await geminiOnce(schema, system, parts, m);
      } catch (err) {
        last = err;
        const status = err instanceof ProviderError ? err.status : undefined;
        if (!status || !RETRYABLE.has(status)) throw err;
        if (attempt === 0) await pause(1500);
      }
    }
  }
  throw last;
}

async function geminiOnce<T>(schema: z.ZodType<T>, system: string, parts: Part[], model: string): Promise<{ data: T; model: string }> {
  try {
    const res = await gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchemaOf(schema), temperature: 0.2 },
    });
    return { data: parseModelJson(schema, res.text), model };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) || undefined : undefined;
    throw new ProviderError("gemini", model, `Gemini : ${err instanceof Error ? err.message : String(err)}`, status);
  }
}

export interface AnalysisMedia {
  audio: AudioInput;
  frames: { t: number; bytes: Uint8Array; mime: string }[];
  title: string;
  format: string;
  duration: number;
}

function mediaParts(m: AnalysisMedia): Part[] {
  return [
    inline(m.audio.bytes, m.audio.mime),
    ...m.frames.flatMap((f) => [{ text: `Image à ${f.t.toFixed(1).replace(".", ",")} s :` }, inline(f.bytes, f.mime)] as Part[]),
  ];
}

/** § 4.2: Gemini hears the audio, sees the frames and receives Whisper's boundaries. */
export async function analyseWithGemini(m: AnalysisMedia, timeline: TimedSegment[]) {
  const context = {
    titre: m.title,
    format: m.format,
    duree: Math.round(m.duration * 10) / 10,
    glossaire: GLOSSAIRE,
    segments: timeline.map((s) => ({ id: s.id, start: s.start, end: s.end, texte: s.text })),
  };
  return geminiJson(AnalysisOut, PROMPT_ANALYSE, [...mediaParts(m), { text: JSON.stringify(context) }]);
}

/** § 4.6: without Whisper, Gemini also cuts the audio into timed segments. */
export async function analyseGeminiOnly(m: AnalysisMedia) {
  const context = { titre: m.title, format: m.format, duree: Math.round(m.duration * 10) / 10, glossaire: GLOSSAIRE };
  return geminiJson(AnalysisOutTimed, PROMPT_ANALYSE_SANS_WHISPER, [...mediaParts(m), { text: JSON.stringify(context) }]);
}
