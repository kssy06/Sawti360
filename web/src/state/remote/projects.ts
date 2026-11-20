/**
 * Back-end versions of the project actions. The store is updated at once (optimistic), the server
 * is told in order (one queue per project), and a refusal brings the server's version back.
 * Typing a translation sends at most one PATCH per pause (700 ms), never one per keystroke.
 */
import { api } from "../../api/client";
import type { Segment, Use } from "../../core/types";
import type { NewProjectInput, Project } from "../store";
import { report } from "./report";
import type { Get, Set } from "./state";

/* ------------------------------------------------------------------ local helpers */

const queues = new Map<string, Promise<unknown>>();

/** Runs server calls for one project one after the other. */
function enqueue<T>(pid: string, call: () => Promise<T>): Promise<T> {
  const next = (queues.get(pid) ?? Promise.resolve()).catch(() => undefined).then(call);
  queues.set(pid, next);
  return next;
}

/** Resolves once every call already queued for this project has been answered. */
export const whenSent = (pid: string): Promise<void> =>
  (queues.get(pid) ?? Promise.resolve()).then(
    () => undefined,
    () => undefined,
  );

interface PendingEdit {
  pid: string;
  segId: string;
  translation: string;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, PendingEdit>();
const editKey = (pid: string, segId: string) => `${pid}/${segId}`;

export function patchLocal(set: Set, pid: string, fn: (p: Project) => Partial<Project>): void {
  set((s) => {
    const p = s.projects[pid];
    return p ? { projects: { ...s.projects, [pid]: { ...p, ...fn(p), updatedAt: new Date().toISOString() } } } : {};
  });
}

/** Puts the server's project in the store, keeping translations still being typed locally. */
export function applyServer(set: Set, project: Project): void {
  set((s) => {
    const local = s.projects[project.id];
    const segments = local
      ? project.segments.map((seg) => {
          if (!pending.has(editKey(project.id, seg.id))) return seg;
          const mine = local.segments.find((x) => x.id === seg.id);
          return mine ? { ...seg, translation: mine.translation, validated: mine.validated } : seg;
        })
      : project.segments;
    const order = s.order.includes(project.id) ? s.order : [project.id, ...s.order];
    return { projects: { ...s.projects, [project.id]: { ...project, segments } }, order };
  });
}

export async function refreshProject(set: Set, pid: string): Promise<void> {
  try {
    applyServer(set, await api.get<Project>(`/projects/${pid}`));
  } catch (err) {
    report(err);
  }
}

/** Sends a project call in order; on refusal, reports it and reloads the server's version. */
function send(set: Set, pid: string, call: () => Promise<Project | void>): Promise<void> {
  return enqueue(pid, call).then(
    (project) => {
      if (project) applyServer(set, project);
    },
    async (err) => {
      report(err);
      await refreshProject(set, pid);
    },
  );
}

/* ------------------------------------------------------------------ segments */

function sendTranslation(set: Set, key: string): Promise<void> {
  const edit = pending.get(key);
  if (!edit) return Promise.resolve();
  clearTimeout(edit.timer);
  return enqueue(edit.pid, async () => {
    const still = pending.get(key);
    if (!still) return;
    pending.delete(key);
    await api.patch<Project>(`/projects/${still.pid}/segments/${still.segId}`, { translation: still.translation });
  }).catch(async (err) => {
    report(err);
    await refreshProject(set, edit.pid);
  });
}

/** Sends every translation still waiting (before a validation, a refresh, leaving the tab). */
export async function flushEdits(set: Set): Promise<void> {
  await Promise.all([...pending.keys()].map((k) => sendTranslation(set, k)));
}

export function editTranslation(set: Set, get: Get, segId: string, text: string): void {
  const pid = get().currentId;
  patchLocal(set, pid, (p) => ({
    segments: p.segments.map((x) => (x.id === segId ? { ...x, translation: text, validated: x.translation === text ? x.validated : false } : x)),
  }));
  const key = editKey(pid, segId);
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  pending.set(key, { pid, segId, translation: text, timer: setTimeout(() => void sendTranslation(set, key), 700) });
}

export function setValidated(set: Set, get: Get, segId: string, v: boolean): Promise<void> {
  const pid = get().currentId;
  patchLocal(set, pid, (p) => ({ segments: p.segments.map((x) => (x.id === segId ? { ...x, validated: v } : x)) }));
  const flushed = sendTranslation(set, editKey(pid, segId));
  return flushed.then(() => send(set, pid, () => api.patch<Project>(`/projects/${pid}/segments/${segId}`, { validated: v })));
}

const SEGMENT_FIELDS = ["translation", "validated", "source", "speaker", "emotion", "start", "end"] as const;

/* ------------------------------------------------------------------ projects */

export async function createVideoProject(set: Set, input: NewProjectInput): Promise<string> {
  const project = await api.post<Project>("/projects", { title: input.title, format: input.format, privacy: input.meta.privacy, video: input.meta });
  set((s) => ({ projects: { ...s.projects, [project.id]: project }, order: [project.id, ...s.order.filter((x) => x !== project.id)], currentId: project.id }));
  return project.id;
}

/**
 * Generic patch: applied locally, then the parts the API knows are sent (title, subtitle, use,
 * format; and changed segments, field by field). The analysis and generation write their own
 * fields on the server (B5, C1).
 */
export function patchProject(set: Set, get: Get, pid: string, patch: Partial<Project>): void {
  const before = get().projects[pid];
  if (!before) return;
  patchLocal(set, pid, () => patch);
  const head: Record<string, unknown> = {};
  if (patch.title !== undefined) head.title = patch.title;
  if (patch.subtitle !== undefined) head.subtitle = patch.subtitle;
  if (patch.use !== undefined) head.use = patch.use;
  if (patch.format !== undefined) head.format = patch.format;
  if (Object.keys(head).length) void send(set, pid, () => api.patch<Project>(`/projects/${pid}`, head));
  if (patch.segments) {
    for (const seg of patch.segments) {
      const old = before.segments.find((x) => x.id === seg.id);
      if (!old) continue;
      const diff: Partial<Segment> = {};
      for (const f of SEGMENT_FIELDS) if (seg[f] !== old[f]) (diff as Record<string, unknown>)[f] = seg[f];
      if (Object.keys(diff).length) void send(set, pid, () => api.patch<Project>(`/projects/${pid}/segments/${seg.id}`, diff));
    }
  }
}

export function setUse(set: Set, get: Get, use: Use): void {
  patchProject(set, get, get().currentId, { use });
}

export function deleteProject(set: Set, get: Get, pid: string): void {
  const p = get().projects[pid];
  if (!p || p.example) return;
  set((s) => {
    const { [pid]: _gone, ...rest } = s.projects;
    const order = s.order.filter((x) => x !== pid);
    return { projects: rest, order, currentId: s.currentId === pid ? (order[0] ?? "") : s.currentId };
  });
  void enqueue(pid, () => api.del(`/projects/${pid}`)).catch((err) => {
    report(err);
    set((s) => ({ projects: { ...s.projects, [pid]: p }, order: [pid, ...s.order] }));
  });
}
