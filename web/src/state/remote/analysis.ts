/**
 * The real analysis, back-end mode (Écran 04):
 *  1. in the browser: audio (Ogg/Opus 16 kHz mono) and frames extracted from the creator's video;
 *  2. both sent straight to Storage (signed URLs), never through Vercel;
 *  3. POST /api/projects/:id/analysis, then the task is followed every 1.5 s, step by step;
 *  4. the server's project replaces the local one; the frames are shown next to their lines.
 * A reload during the server's work resumes following the same task.
 */
import { api, messageOf } from "../../api/client";
import { inParallel, uploadFile } from "../../api/upload";
import { waitJob } from "../../api/useJob";
import { extractAudio, extractFrames, type ExtractedFrame } from "../../media/extract";
import { loadVideo, setFrames, videoUrl } from "../../media/local";
import type { Pipeline, Project } from "../store";
import { applyServer, patchLocal, refreshProject } from "./projects";
import { report } from "./report";
import type { Get, Set } from "./state";

const running = new Set<string>();
const extracted = new Map<string, ExtractedFrame[]>();

export const isRemoteAnalysing = (pid: string) => running.has(pid);

function setPipeline(set: Set, pid: string, patch: Partial<Pipeline>): void {
  patchLocal(set, pid, (p) => ({ pipeline: { ...(p.pipeline ?? { status: "running", step: 0, simulated: false }), ...patch } }));
}

/** The video to analyse: the file kept in this browser, or a direct link the host lets us read. */
async function sourceOf(pid: string): Promise<Blob> {
  const file = await loadVideo(pid);
  if (file) return file;
  const url = videoUrl(pid);
  if (url) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return res.blob();
    throw new Error("Ce lien ne laisse pas lire la vidéo depuis le navigateur : importez le fichier pour l’analyser.");
  }
  throw new Error("Vidéo introuvable dans ce navigateur : importez de nouveau le fichier pour l’analyser.");
}

/** Up to two of the extracted frames per line, for the filmstrip and the character cards. */
function attachFrames(pid: string, project: Project | undefined): void {
  const frames = extracted.get(pid);
  if (!frames?.length || !project) return;
  for (const s of project.segments) {
    const inside = frames.filter((f) => f.t >= s.start && f.t <= s.end);
    const picked = (inside.length ? inside : [...frames].sort((a, b) => Math.abs(a.t - s.start) - Math.abs(b.t - s.start))).slice(0, 2);
    setFrames(pid, s.id, picked.map((f) => URL.createObjectURL(f.blob)));
  }
}

export async function runRemoteAnalysis(set: Set, get: Get, pid: string): Promise<void> {
  if (running.has(pid)) return;
  running.add(pid);
  try {
    const p = get().projects[pid];
    let jobId = p?.pipeline?.status === "running" ? p.pipeline.jobId : undefined;
    if (!jobId) {
      setPipeline(set, pid, { status: "running", step: 0, simulated: false, error: undefined });
      const source = await sourceOf(pid);
      const audio = await extractAudio(source);
      const frames = await extractFrames(source, audio.duration).catch(() => [] as ExtractedFrame[]);
      extracted.set(pid, frames);
      const sent = await uploadFile("audio", audio.blob, { projectId: pid });
      const framePaths = await inParallel(frames, 4, async (f) => ({ t: f.t, path: (await uploadFile("frame", f.blob, { projectId: pid, t: Math.round(f.t * 1000) })).path }));
      ({ jobId } = await api.post<{ jobId: string }>(`/projects/${pid}/analysis`, {
        audio: { path: sent.path, sha256: audio.sha256, duration: audio.duration, mime: audio.mime },
        frames: framePaths,
      }));
      setPipeline(set, pid, { jobId });
    }
    const job = await waitJob(jobId!, (j) => {
      if (j.status === "queued" || j.status === "running") setPipeline(set, pid, { status: "running", step: j.step, simulated: false, jobId, providers: j.providers, detail: j.detail });
    });
    await refreshProject(set, pid);
    if (job.status === "error") throw new Error(job.error ?? "L’analyse a échoué.");
    attachFrames(pid, get().projects[pid]);
  } catch (err) {
    setPipeline(set, pid, { status: "error", error: messageOf(err) });
    report(err);
  } finally {
    running.delete(pid);
  }
}

/** « Utiliser l’exemple simulé »: the illustrative result, always labelled « Simulé ». */
export async function useExampleAnalysis(set: Set, pid: string): Promise<void> {
  try {
    applyServer(set, await api.post<Project>(`/projects/${pid}/analysis/example`));
  } catch (err) {
    report(err);
  }
}
