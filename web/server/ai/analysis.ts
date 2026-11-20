/**
 * The analysis chain (IA.md § 3): Whisper gives the boundaries, Gemini writes the derja, finds the
 * speakers and translates; then the CODE checks the proposal: Whisper's ids and times are kept,
 * silences removed, unknown speakers attached to the first one, confidence bounded, `fits` computed.
 * Fallbacks: Gemini alone (it cuts the audio itself), or Groq's text model without image.
 */
import { FR_CHARS_PER_SECOND } from "../../src/core/catalog.js";
import type { Segment } from "../../src/core/types.js";
import type { Speaker } from "../../src/state/store.js";
import type { Character } from "../../src/state/workflow.js";
import { ApiError } from "../errors.js";
import { analyseGeminiOnly, analyseWithGemini, geminiConfigured, type AnalysisMedia } from "./gemini.js";
import { groqConfigured, groqJson, whisperTimeline, type TimedSegment } from "./groq.js";
import { GLOSSAIRE, PROMPT_TRADUCTION_TEXTE } from "./prompts.js";
import { AnalysisOut, type AnalysisOutTimed } from "./schemas.js";

export interface Assembled {
  segments: Segment[];
  speakers: Record<string, Speaker>;
  characters: Record<string, Character>;
  /** First-model translation, kept to tell « modifiée » from « générée ». */
  proposals: Record<string, string>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5);
const KEY = /^[A-Za-z0-9_-]{1,32}$/;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** French line short enough for its time on screen (14 characters per second, 0.2 s margin). */
export const fitsOnScreen = (translation: string, start: number, end: number) => [...translation.trim()].length / FR_CHARS_PER_SECOND <= end - start + 0.2;

const isSilence = (source: string) => /^\s*\[\s*silence\s*\]\s*$/i.test(source);

function characterOf(key: string, name: string, description: string): Character {
  return { key, proposedName: name, proposedDescription: description, name, description, confirmed: false, useOriginal: false, lifeStatus: "a_renseigner" };
}

/** Lower case, no accents, letters and digits only: « P1 », « p 1 » and « Speaker_1 » compare alike. */
const norm = (k: string) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const trailingNumber = (k: string) => k.match(/(\d+)\s*$/)?.[1];

/**
 * The declared speakers with a usable key each, and a resolver for the keys the model wrote on the
 * segments. Models often write « P1 », « p01 », « speaker_1 » or the speaker's name instead of the key
 * they declared; matching those exactly sent every line to the first speaker, so a dialogue came out
 * as one person. An unusable declared key (spaces, accents) is replaced by the next free pN.
 */
export function speakerKeys(list: AnalysisOut["speakers"]) {
  const taken = new Set<string>();
  const alias = new Map<string, string>();
  const byNumber = new Map<string, string>();
  const declared = list.map((s, i) => {
    let key = s.key.trim();
    if (!KEY.test(key) || taken.has(key)) {
      let n = i + 1;
      while (taken.has(`p${n}`)) n += 1;
      key = `p${n}`;
    }
    taken.add(key);
    for (const a of [key, s.key, s.proposedName]) {
      const n = norm(a);
      if (n && !alias.has(n)) alias.set(n, key);
    }
    const d = trailingNumber(s.key);
    if (d && !byNumber.has(String(Number(d)))) byNumber.set(String(Number(d)), key);
    return { ...s, key };
  });
  const resolve = (k: string): string | undefined => {
    const hit = alias.get(norm(k));
    if (hit) return hit;
    const d = trailingNumber(k);
    return d ? byNumber.get(String(Number(d))) : undefined;
  };
  return { declared, resolve };
}

function speakersOf(list: AnalysisOut["speakers"], used: Set<string>) {
  const valid = list.filter((s) => KEY.test(s.key));
  const speakers: Record<string, Speaker> = {};
  const characters: Record<string, Character> = {};
  let i = 0;
  for (const s of valid) {
    if (!used.has(s.key)) continue;
    const name = s.proposedName.trim() || `Intervenant ${LETTERS[i] ?? i + 1}`;
    speakers[s.key] = { name, gender: s.gender };
    characters[s.key] = characterOf(s.key, name, s.proposedDescription.trim() || "Description proposée par l’IA, à confirmer.");
    i += 1;
  }
  for (const key of used) {
    if (speakers[key]) continue;
    const name = `Intervenant ${LETTERS[i] ?? i + 1}`;
    speakers[key] = { name, gender: "inconnu" };
    characters[key] = characterOf(key, name, "Voix repérée dans l’audio, sans description de l’IA. À confirmer.");
    i += 1;
  }
  return { speakers, characters };
}

/** § 3.3 — Gemini's proposal checked against Whisper's timeline. Pure: unit-tested. */
export function assembleAnalysis(timeline: TimedSegment[], out: AnalysisOut, opts: { noImage?: boolean } = {}): Assembled {
  const { declared, resolve } = speakerKeys(out.speakers);
  const first = declared[0]?.key ?? "p1";
  const byId = new Map(out.segments.map((s) => [s.id, s]));
  const segments: Segment[] = [];
  for (const w of timeline) {
    const g = byId.get(w.id);
    if (!g) {
      segments.push({ id: w.id, start: w.start, end: w.end, speaker: first, source: w.text, confidence: 0.3, translation: "", validated: false, context: "Non traduit : segment absent de la réponse du modèle.", fits: true });
      continue;
    }
    if (isSilence(g.source)) continue;
    const resolved = resolve(g.speaker);
    const speaker = resolved ?? first;
    const notes = [g.context.trim(), resolved ? "" : `Intervenant inconnu « ${g.speaker} » rattaché à ${first}.`, opts.noImage ? "Traduit sans image." : ""].filter(Boolean);
    const translation = g.translation.trim();
    segments.push({
      id: w.id,
      start: w.start,
      end: w.end,
      speaker,
      source: g.source.trim(),
      confidence: clamp01(g.certainty),
      translation,
      validated: false,
      context: notes.join(" "),
      fits: fitsOnScreen(translation, w.start, w.end),
    });
  }
  const used = new Set(segments.map((s) => s.speaker));
  return { segments, ...speakersOf(declared, used), proposals: Object.fromEntries(segments.map((s) => [s.id, s.translation])) };
}

/** § 4.6 — Gemini alone: ids given by the code, confidence fixed at 0.5 (less reliable times). */
export function assembleTimed(out: AnalysisOutTimed, duration: number): Assembled {
  const ordered = out.segments
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && !isSilence(s.source))
    .map((s) => ({ ...s, start: r2(Math.max(0, s.start)), end: r2(Math.min(duration || s.end, s.end)) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const timeline: TimedSegment[] = ordered.map((s, i) => ({ id: `s${i + 1}`, start: s.start, end: s.end, text: s.source }));
  const asOut: AnalysisOut = { speakers: out.speakers, segments: ordered.map((s, i) => ({ ...s, id: `s${i + 1}`, certainty: 0.5 })) };
  const a = assembleAnalysis(timeline, asOut);
  a.segments = a.segments.map((s) => ({ ...s, confidence: 0.5, context: `${s.context} Horodatage estimé par Gemini (sans Whisper).`.trim() }));
  return a;
}

export interface ChainResult {
  assembled: Assembled;
  /** Models really used (labels « Réel · … » in the interface). */
  providers: Record<string, string>;
  /** What went wrong on the way (a fallback was used). */
  notes: string[];
}

export type Step = (n: number, detail?: string) => Promise<void>;

/** Runs the chain with the providers that are configured; 502 FOURNISSEUR_IA when none worked. */
export async function analyse(media: AnalysisMedia, step: Step): Promise<ChainResult> {
  const notes: string[] = [];
  const providers: Record<string, string> = {};
  let timeline: TimedSegment[] | null = null;

  await step(1, "Découpage des prises de parole…");
  if (groqConfigured()) {
    try {
      const w = await whisperTimeline(media.audio);
      timeline = w.segments;
      providers.bornes = `${w.model} (Groq)`;
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (timeline && !timeline.length) {
    notes.push("Whisper n’a repéré aucune prise de parole.");
    timeline = null;
  }

  await step(2, timeline ? `Transcription et traduction de ${timeline.length} segments…` : "Transcription et traduction…");
  if (geminiConfigured()) {
    try {
      if (timeline) {
        const g = await analyseWithGemini(media, timeline);
        providers.asr = g.model;
        providers.llm1 = g.model;
        await step(3, "Association des répliques aux intervenants…");
        return { assembled: assembleAnalysis(timeline, g.data), providers, notes };
      }
      const g = await analyseGeminiOnly(media);
      providers.asr = `${g.model} (sans Whisper)`;
      providers.llm1 = g.model;
      await step(3, "Association des répliques aux intervenants…");
      return { assembled: assembleTimed(g.data, media.duration), providers, notes };
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (timeline && groqConfigured()) {
    try {
      const repliques = timeline.map((s) => ({ id: s.id, start: s.start, end: s.end, texte: s.text }));
      const g = await groqJson(AnalysisOut, PROMPT_TRADUCTION_TEXTE, JSON.stringify({ titre: media.title, format: media.format, glossaire: GLOSSAIRE, segments: repliques }));
      providers.asr = providers.bornes;
      providers.llm1 = `${g.model}, texte seul`;
      await step(3, "Association des répliques aux intervenants…");
      return { assembled: assembleAnalysis(timeline, g.data, { noImage: true }), providers, notes };
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new ApiError(
    502,
    "FOURNISSEUR_IA",
    notes.length ? `Aucun fournisseur d’IA n’a pu analyser la vidéo : ${notes.join(" · ")}` : "Aucun fournisseur d’IA n’est configuré (GROQ_API_KEY, GEMINI_API_KEY).",
  );
}
