import { layout, proposed } from "../mock/analysisExample";
import { reviewSegment, wait } from "../mock/simulate";
import { BACKEND } from "../lib/backend";
import { isRemoteAnalysing, runRemoteAnalysis } from "../state/remote/analysis";
import { useStore } from "../state/store";
import { captureFrames, setFrames, videoUrl } from "./local";

/**
 * Analysis of an uploaded video (Écran 04).
 * Real: frames are extracted from the creator's own video, in the browser.
 * Simulated: transcription, speaker detection and translation (example derja lines),
 * until the speech-to-text and vision models are wired.
 */

const running = new Set<string>();

export async function runAnalysis(projectId: string) {
  if (BACKEND) return runRemoteAnalysis(useStore.setState, useStore.getState, projectId);
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

export const isAnalysing = (projectId: string) => (BACKEND ? isRemoteAnalysing(projectId) : running.has(projectId));
