import { FR_CHARS_PER_SECOND, SEED_SEGMENTS } from "../core/catalog";
import type { Segment } from "../core/types";
import { reviewSegment, wait } from "../mock/simulate";
import { useStore } from "../state/store";
import type { Character } from "../state/workflow";
import { captureFrames, setFrames, videoUrl } from "./local";

/**
 * Analysis of an uploaded video (Écran 04).
 * Real: frames are extracted from the creator's own video, in the browser.
 * Simulated: transcription, speaker detection and translation (example derja lines),
 * until the speech-to-text and vision models are wired.
 */

const SIMULATED: { source: string; translation: string; context: string }[] = [
  { source: SEED_SEGMENTS[0].source, translation: "Yassine, le car part à cinq heures et demie.", context: "Elle s’adresse à quelqu’un hors champ : tutoiement, ton pressé." },
  { source: SEED_SEGMENTS[1].source, translation: "J’ai pas le temps, je t’attends devant la maison.", context: "Il lui répond directement : registre familier, négation gardée." },
  { source: SEED_SEGMENTS[2].source, translation: "Je l’ai payé 30 dinars, c’est pas rien !", context: "Montant dit à l’oral." },
  { source: SEED_SEGMENTS[3].source, translation: "Ma mère m’a dit de rentrer avant la nuit.", context: "Il rapporte une parole de sa mère : discours indirect." },
  { source: SEED_SEGMENTS[4].source, translation: "On les laissera nous faire taire.", context: "Ton déterminé, regard caméra." },
  { source: SEED_SEGMENTS[5].source, translation: "Je veux montrer au monde ce qu’on fait ici.", context: "Plan large sur le quartier : « ici » désigne le lieu montré." },
];

const running = new Set<string>();

function layout(duration: number): Segment[] {
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

const proposed = (key: string, label: string, description: string): Character => ({
  key,
  proposedName: label,
  proposedDescription: description,
  name: label,
  description,
  confirmed: false,
  useOriginal: false,
  lifeStatus: "a_renseigner",
});

export async function runAnalysis(projectId: string) {
  if (running.has(projectId)) return;
  running.add(projectId);
  const { patchProject } = useStore.getState();
  const project = () => useStore.getState().projects[projectId];
  const step = (n: number) => patchProject(projectId, { pipeline: { status: "running", step: n, simulated: true } });
  try {
    const d = project()?.video?.duration;
    const duration = d && Number.isFinite(d) ? d : 20;
    const segments = layout(duration);
    step(0);
    await wait(1300);
    step(1);
    await wait(1500);
    patchProject(projectId, { segments: segments.map((s) => ({ ...s, translation: "", context: undefined, fits: undefined })) });
    const src = videoUrl(projectId);
    if (src) {
      try {
        const times = segments.flatMap((s) => [s.start + (s.end - s.start) * 0.3, s.start + (s.end - s.start) * 0.75]);
        const got: string[] = [];
        for await (const f of captureFrames(src, times, 320)) {
          got.push(f.data);
          if (got.length % 2 === 0) {
            const seg = segments[got.length / 2 - 1];
            setFrames(projectId, seg.id, got.slice(-2));
            await wait(160);
          }
        }
      } catch {
        /* remote video without CORS: frames cannot be read, the analysis continues */
      }
    } else {
      await wait(1200);
    }
    step(2);
    const count = (k: string) => segments.filter((s) => s.speaker === k).length;
    await wait(1200);
    patchProject(projectId, {
      speakers: { p1: { name: "Intervenant A", gender: "inconnu" }, p2: { name: "Intervenant B", gender: "inconnu" } },
      characters: {
        p1: proposed("p1", "Intervenant A", `Première voix entendue, ${count("p1")} prises de parole. Description proposée par l’IA, à confirmer.`),
        p2: proposed("p2", "Intervenant B", `Deuxième voix, ${count("p2")} prises de parole. Description proposée par l’IA, à confirmer.`),
      },
    });
    step(3);
    for (const s of segments) {
      await wait(260);
      const p = project();
      if (!p) return;
      patchProject(projectId, { segments: p.segments.map((x) => (x.id === s.id ? { ...x, translation: s.translation, context: s.context, fits: s.fits } : x)) });
    }
    step(4);
    await wait(1300);
    const p = project();
    if (!p) return;
    patchProject(projectId, {
      proposals: Object.fromEntries(p.segments.map((s) => [s.id, s.translation])),
      reviews: Object.fromEntries(p.segments.map((s) => [s.id, reviewSegment(s)])),
      pipeline: { status: "done", step: 5, simulated: true },
    });
  } finally {
    running.delete(projectId);
  }
}

export const isAnalysing = (projectId: string) => running.has(projectId);
