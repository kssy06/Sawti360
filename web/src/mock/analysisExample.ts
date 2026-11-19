/**
 * The illustrative analysis of the simulated demo (example derja lines), shared by the simulated
 * pipeline (src/media/pipeline.ts) and by the server's « Utiliser l'exemple simulé » fallback.
 * Always labelled « Simulé ». Moved out of pipeline.ts unchanged.
 */
import { FR_CHARS_PER_SECOND, SEED_SEGMENTS } from "../core/catalog.js";
import type { Segment } from "../core/types.js";
import type { Character } from "../state/workflow.js";
import { reviewSegment } from "./simulate.js";

export const SIMULATED: { source: string; translation: string; context: string }[] = [
  { source: SEED_SEGMENTS[0].source, translation: "Yassine, le car part à cinq heures et demie.", context: "Elle s’adresse à quelqu’un hors champ : tutoiement, ton pressé." },
  { source: SEED_SEGMENTS[1].source, translation: "J’ai pas le temps, je t’attends devant la maison.", context: "Il lui répond directement : registre familier, négation gardée." },
  { source: SEED_SEGMENTS[2].source, translation: "Je l’ai payé 30 dinars, c’est pas rien !", context: "Montant dit à l’oral." },
  { source: SEED_SEGMENTS[3].source, translation: "Ma mère m’a dit de rentrer avant la nuit.", context: "Il rapporte une parole de sa mère : discours indirect." },
  { source: SEED_SEGMENTS[4].source, translation: "On les laissera nous faire taire.", context: "Ton déterminé, regard caméra." },
  { source: SEED_SEGMENTS[5].source, translation: "Je veux montrer au monde ce qu’on fait ici.", context: "Plan large sur le quartier : « ici » désigne le lieu montré." },
];

export function layout(duration: number): Segment[] {
  const n = Math.max(2, Math.min(SIMULATED.length, Math.floor(duration / 3.5)));
  const slot = duration / n;
  return SIMULATED.slice(0, n).map((line, i) => {
    const start = +(i * slot + slot * 0.12).toFixed(2);
    const end = +(start + Math.min(slot * 0.76, 4.2)).toFixed(2);
    const fits = line.translation.length / FR_CHARS_PER_SECOND <= end - start + 0.2;
    return {
      id: `s${i + 1}`,
      start,
      end,
      speaker: i % 2 === 0 ? "p1" : "p2",
      source: line.source,
      confidence: [0.92, 0.86, 0.79, 0.94, 0.71, 0.9][i],
      translation: line.translation,
      validated: false,
      context: line.context,
      fits,
    };
  });
}

export const proposed = (key: string, label: string, description: string): Character => ({
  key,
  proposedName: label,
  proposedDescription: description,
  name: label,
  description,
  confirmed: false,
  useOriginal: false,
  lifeStatus: "a_renseigner",
});


/** The whole example result for a video of this duration (what the simulated pipeline ends with). */
export function exampleAnalysis(duration: number) {
  const segments = layout(Number.isFinite(duration) && duration > 0 ? duration : 20);
  const count = (k: string) => segments.filter((s) => s.speaker === k).length;
  return {
    segments,
    speakers: { p1: { name: "Intervenant A", gender: "inconnu" as const }, p2: { name: "Intervenant B", gender: "inconnu" as const } },
    characters: {
      p1: proposed("p1", "Intervenant A", `Première voix entendue, ${count("p1")} prises de parole. Description proposée par l’IA, à confirmer.`),
      p2: proposed("p2", "Intervenant B", `Deuxième voix, ${count("p2")} prises de parole. Description proposée par l’IA, à confirmer.`),
    },
    proposals: Object.fromEntries(segments.map((s) => [s.id, s.translation])),
    reviews: Object.fromEntries(segments.map((s) => [s.id, reviewSegment(s)])),
  };
}
