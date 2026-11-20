/**
 * Groq: Whisper cuts the audio into timed speech turns (we keep its boundaries, its words are only a hint:
 * Whisper writes derja badly), transcribes the French paragraph of a voice sample, and serves as the
 * text-only LLM of the fallback chains. Errors come out typed (ProviderError) for those chains.
 */
import Groq, { toFile } from "groq-sdk";
import type { z } from "zod";
import { env } from "../env.js";
import { ASR_PROMPT } from "./prompts.js";
import { jsonSchemaOf, parseModelJson } from "./schemas.js";

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AudioInput {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}

/** What the SDK calls look like (the real client, or a fake in tests). */
export interface GroqLike {
  audio: { transcriptions: { create(body: Record<string, unknown>): Promise<unknown> } };
  chat: { completions: { create(body: Record<string, unknown>): Promise<{ choices: { message: { content: string | null } }[] }> } };
}

let client: GroqLike | null = null;

export function groq(): GroqLike {
  if (client) return client;
  const key = env().GROQ_API_KEY;
  if (!key) throw new ProviderError("groq", "", "GROQ_API_KEY absent");
  client = new Groq({ apiKey: key, maxRetries: 2, timeout: 120_000 }) as unknown as GroqLike;
  return client;
}

export function setGroqForTests(c: GroqLike | null): void {
  client = c;
}

export const groqConfigured = () => Boolean(client || env().GROQ_API_KEY);

const statusOf = (err: unknown) => (typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) || undefined : undefined);

/* ------------------------------------------------------------------ timeline (B2) */

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

export interface TimedSegment {
  id: string;
  start: number;
  end: number;
  /** Whisper's words: a hint only, often wrong in derja. */
  text: string;
}

export const NO_SPEECH_MAX = 0.6;
export const MIN_SEGMENT_S = 0.6;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * § 3.1: drop silence (no_speech_prob > 0.6), merge turns shorter than 0.6 s into a neighbour,
 * round to 0.01 s, number s1, s2… Pure: unit-tested.
 */
export function cleanSegments(raw: WhisperSegment[]): TimedSegment[] {
  const kept = raw
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .filter((s) => (s.no_speech_prob ?? 0) <= NO_SPEECH_MAX)
    .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.end - s.start >= MIN_SEGMENT_S) {
      merged.push({ ...s });
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev) {
      prev.end = Math.max(prev.end, s.end);
      prev.text = `${prev.text} ${s.text}`.trim();
    } else if (kept[i + 1]) {
      kept[i + 1] = { start: s.start, end: kept[i + 1].end, text: `${s.text} ${kept[i + 1].text}`.trim() };
    } else {
      merged.push({ ...s });
    }
  }
  return merged.map((s, i) => ({ id: `s${i + 1}`, start: r2(s.start), end: r2(s.end), text: s.text }));
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/** A pause this long between two words ends a speech turn. */
export const TURN_GAP_S = 0.45;
/** A turn longer than this is cut at its longest pause (a dubbed line must stay sayable). */
export const MAX_TURN_S = 10;
const QUESTION = /[؟?]\s*$/;
/** A turn of fewer words is a fragment of a sentence cut by a hesitation, unless it is a question. */
const MIN_TURN_WORDS = 3;

/**
 * Speech turns rebuilt from Whisper's words, so that a line ends where the talking ends and a
 * change of speaker can fall between two lines. Whisper's own segments follow the text, not the
 * voices: a question and its answer could share one segment, and a segment ran on into the silence
 * after the last word. Here a pause of TURN_GAP_S or a question mark ends a turn, a turn ends on its
 * last word (plus 0.1 s), turns over MAX_TURN_S are cut at their longest pause, and words lying in a
 * segment Whisper marked as silence are dropped. Pure: unit-tested.
 */
export function turnsFromWords(words: WhisperWord[], segments: WhisperSegment[] = []): WhisperSegment[] {
  const silent = segments.filter((s) => (s.no_speech_prob ?? 0) > NO_SPEECH_MAX);
  const kept = words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start && w.word.trim())
    .filter((w) => !silent.some((s) => (w.start + w.end) / 2 >= s.start && (w.start + w.end) / 2 <= s.end))
    .sort((a, b) => a.start - b.start);
  const turns: WhisperWord[][] = [];
  for (const w of kept) {
    const cur = turns[turns.length - 1];
    const prev = cur?.[cur.length - 1];
    if (!cur || w.start - prev!.end >= TURN_GAP_S || QUESTION.test(prev!.word)) turns.push([w]);
    else cur.push(w);
  }
  // A hesitation inside a sentence left a one- or two-word fragment: it joins the neighbour it is
  // closest to (a question stays alone, since it usually marks a change of speaker).
  const gapBefore = (i: number) => (i > 0 ? turns[i][0].start - turns[i - 1][turns[i - 1].length - 1].end : Infinity);
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (turns.length < 2 || t.length >= MIN_TURN_WORDS || QUESTION.test(t[t.length - 1].word)) continue;
    const prevAsks = i > 0 && QUESTION.test(turns[i - 1][turns[i - 1].length - 1].word);
    const toPrev = i > 0 && !prevAsks && (i === turns.length - 1 || gapBefore(i) <= gapBefore(i + 1));
    if (toPrev) turns[i - 1].push(...t);
    else if (i < turns.length - 1) turns[i + 1].unshift(...t);
    else continue;
    turns.splice(i, 1);
    i -= 1;
  }
  const split = (t: WhisperWord[]): WhisperWord[][] => {
    if (t.length < 2 || t[t.length - 1].end - t[0].start <= MAX_TURN_S) return [t];
    let at = 1;
    for (let i = 1; i < t.length; i++) if (t[i].start - t[i - 1].end > t[at].start - t[at - 1].end) at = i;
    return [...split(t.slice(0, at)), ...split(t.slice(at))];
  };
  const out = turns.flatMap(split);
  return out.map((t, i) => {
    const next = out[i + 1]?.[0].start ?? Infinity;
    return { start: t[0].start, end: Math.min(t[t.length - 1].end + 0.1, next - 0.02), text: t.map((w) => w.word.trim()).join(" ") };
  });
}

async function transcribe(audio: AudioInput, params: Record<string, unknown>): Promise<unknown> {
  const model = env().models.groqAsr;
  try {
    const file = await toFile(audio.bytes, audio.name ?? `audio.${audio.mime.includes("wav") ? "wav" : audio.mime.includes("webm") ? "webm" : "ogg"}`, { type: audio.mime });
    return await groq().audio.transcriptions.create({ file, model, temperature: 0, ...params });
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("groq", model, `Whisper (Groq) : ${err instanceof Error ? err.message : String(err)}`, statusOf(err));
  }
}

/** B2: timed speech turns of the audio (derja, Whisper large-v3 on Groq). */
export async function whisperTimeline(audio: AudioInput): Promise<{ segments: TimedSegment[]; model: string }> {
  const tr = await transcribe(audio, { language: "ar", response_format: "verbose_json", timestamp_granularities: ["word", "segment"], prompt: ASR_PROMPT });
  // The SDK's type only declares `text`: the segments and words of verbose_json are read like this.
  const { segments: raw = [], words = [] } = tr as { segments?: WhisperSegment[]; words?: WhisperWord[] };
  return { segments: cleanSegments(words.length ? turnsFromWords(words, raw) : raw), model: env().models.groqAsr };
}

/** B7: what the person really read (French), WITHOUT any prompt (the expected text must not leak in). */
export async function transcribeFrench(audio: AudioInput): Promise<{ text: string; model: string }> {
  const tr = await transcribe(audio, { language: "fr", response_format: "json" });
  return { text: String((tr as { text?: unknown }).text ?? ""), model: env().models.groqAsr };
}

/* ------------------------------------------------------------------ text LLM (fallbacks) */

/** A JSON answer validated by zod, from Groq's large open model (LLM 2 fallback, text-only LLM 1). */
export async function groqJson<T>(schema: z.ZodType<T>, system: string, user: string): Promise<{ data: T; model: string }> {
  const model = env().models.groqLlm;
  try {
    const chat = await groq().chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\nSchéma attendu : ${JSON.stringify(jsonSchemaOf(schema))}` },
        { role: "user", content: user },
      ],
    });
    return { data: parseModelJson(schema, chat.choices[0]?.message.content), model: `${model} (Groq)` };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("groq", model, `LLM Groq : ${err instanceof Error ? err.message : String(err)}`, statusOf(err));
  }
}
