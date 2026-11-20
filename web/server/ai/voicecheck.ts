/**
 * Check of a Voice Passport sample (IA.md § 6). The browser measured duration, peak and RMS; the
 * server transcribes the reading in French (Groq Whisper, WITHOUT prompt) and compares it with the
 * paragraph shown (WER). It tells whether the expected text was read — it never proves who the person is.
 */
import { groqConfigured, transcribeFrench, type AudioInput } from "./groq.js";
import { wordErrorRate } from "./wer.js";

export type SampleMatch = "correspondance" | "a_verifier" | "non_conforme" | "mesures";

export interface SampleMeasures {
  duration: number;
  peak: number;
  rms: number;
}

export interface SampleCheck {
  match: SampleMatch;
  /** One sentence for the interface. */
  label: string;
  wer?: number;
  transcript?: string;
  provider?: string;
}

export const MATCH_LABEL: Record<SampleMatch, string> = {
  correspondance: "Correspondance avec le texte lu",
  a_verifier: "À vérifier : lecture partiellement reconnue",
  non_conforme: "Non conforme : réenregistrez la lecture",
  mesures: "Mesures conformes (texte lu non vérifié : transcription indisponible)",
};

/** Duration, level and saturation (minimum 8 s in the owner space, 3 s on the consent page). Pure. */
export function measuresProblem(m: SampleMeasures, minSeconds: number): string | null {
  if (!Number.isFinite(m.duration) || m.duration < minSeconds) return `Enregistrement trop court : ${minSeconds} s au moins.`;
  if (!(m.peak > 0.05)) return "Niveau trop faible : rapprochez-vous du micro.";
  if (m.peak >= 0.99) return "Son saturé : éloignez-vous du micro ou baissez le volume.";
  return null;
}

/** WER → result (≤ 0.25 match, ≤ 0.5 to verify, above: not conform). Pure. */
export function matchOf(wer: number): Exclude<SampleMatch, "mesures"> {
  if (wer <= 0.25) return "correspondance";
  if (wer <= 0.5) return "a_verifier";
  return "non_conforme";
}

export async function checkSample(audio: AudioInput, measures: SampleMeasures, paragraph: string, minSeconds: number): Promise<SampleCheck> {
  const problem = measuresProblem(measures, minSeconds);
  if (problem) return { match: "non_conforme", label: problem };
  if (!groqConfigured()) return { match: "mesures", label: MATCH_LABEL.mesures };
  try {
    const { text, model } = await transcribeFrench(audio);
    const wer = Math.round(wordErrorRate(paragraph, text) * 1000) / 1000;
    const match = matchOf(wer);
    return { match, label: MATCH_LABEL[match], wer, transcript: text, provider: `${model} (Groq)` };
  } catch {
    return { match: "mesures", label: MATCH_LABEL.mesures };
  }
}
