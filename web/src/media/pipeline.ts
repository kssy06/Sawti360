import { FR_CHARS_PER_SECOND, SEED_SEGMENTS } from "../core/catalog";
import type { Segment } from "../core/types";
import { useStore } from "../state/store";
import { captureFrames, setFrames, videoUrl } from "./local";

/**
 * Analysis of an uploaded video, as the interface shows it.
 * UI build: frames are really extracted from the creator's video, in the browser;
 * transcription and translation are a labelled simulation until the APIs are wired
 * (ElevenLabs speech-to-text, then a vision model that reads those frames).
 */

const SIMULATED: { source: string; translation: string; context: string }[] = [
  { source: SEED_SEGMENTS[0].source, translation: "Yassine, le car part à cinq heures et demie.", context: "Elle s’adresse à quelqu’un hors champ : tutoiement, ton pressé." },
  { source: SEED_SEGMENTS[1].source, translation: "J’ai pas le temps, je t’attends devant la maison.", context: "Il lui répond directement : registre familier, négation gardée." },
  { source: SEED_SEGMENTS[2].source, translation: "Je l’ai payé 300 dinars, c’est pas rien !", context: "Montant dit à l’oral : le chiffre est conservé tel quel." },
  { source: SEED_SEGMENTS[3].source, translation: "Ma mère m’a dit de rentrer avant la nuit.", context: "Il rapporte une parole de sa mère : discours indirect." },
  { source: SEED_SEGMENTS[4].source, translation: "On les laissera pas nous faire taire.", context: "Ton déterminé, regard caméra : négation et futur conservés." },
  { source: SEED_SEGMENTS[5].source, translation: "Je veux montrer au monde ce qu’on fait ici.", context: "Plan large sur le quartier : « ici » désigne le lieu montré." },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

export async function runAnalysis(projectId: string) {
  if (running.has(projectId)) return;
  running.add(projectId);
  const { patchProject } = useStore.getState();
  const project = () => useStore.getState().projects[projectId];
  const step = (n: number) => patchProject(projectId, { pipeline: { status: "running", step: n, simulated: true } });
  try {
    const duration = project()?.video?.duration ?? 20;
    step(0);
    await wait(1400);
    step(1);
    const segments = layout(duration);
    await wait(1700);
    patchProject(projectId, {
      speakers: { p1: { name: "Personne 1", gender: "femme" }, p2: { name: "Personne 2", gender: "homme" } },
      speakerVoices: { p1: "v_base_nadia", p2: "v_base_walid" },
      segments: segments.map((s) => ({ ...s, translation: "", context: undefined, fits: undefined })),
    });
    step(2);
    const src = videoUrl(projectId);
    if (src) {
      const times = segments.flatMap((s) => [s.start + (s.end - s.start) * 0.3, s.start + (s.end - s.start) * 0.75]);
      const got: string[] = [];
      for await (const f of captureFrames(src, times, 320)) {
        got.push(f.data);
        if (got.length % 2 === 0) {
          const seg = segments[got.length / 2 - 1];
          setFrames(projectId, seg.id, got.slice(-2));
          await wait(260);
        }
      }
    } else {
      await wait(1600);
    }
    step(3);
    for (const s of segments) {
      await wait(380);
      const p = project();
      if (!p) return;
      patchProject(projectId, { segments: p.segments.map((x) => (x.id === s.id ? { ...x, translation: s.translation, context: s.context, fits: s.fits } : x)) });
    }
    await wait(500);
    patchProject(projectId, { pipeline: { status: "done", step: 4, simulated: true } });
  } finally {
    running.delete(projectId);
  }
}

export const isAnalysing = (projectId: string) => running.has(projectId);
