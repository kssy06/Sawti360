/**
 * Everything here runs in the browser: the video file never leaves the creator's computer.
 * Files are kept in memory, and in IndexedDB for already-public videos so a reload keeps them.
 */

const files = new Map<string, File>();
const urls = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
export const subscribeMedia = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb));
export const mediaVersion = () => version;

/** Frames the analysis looked at, per project and segment (JPEG data URLs, memory only). */
const frames = new Map<string, string[]>();
export const frameKey = (projectId: string, segId: string) => `${projectId}/${segId}`;
export const getFrames = (projectId: string, segId: string) => frames.get(frameKey(projectId, segId)) ?? [];
export function setFrames(projectId: string, segId: string, list: string[]) {
  frames.set(frameKey(projectId, segId), list);
  emit();
}

const DB = "sawti360-media";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("videos");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function keepVideo(projectId: string, file: File, persist: boolean) {
  files.set(projectId, file);
  emit();
  if (!persist) return;
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("videos", "readwrite");
      tx.objectStore("videos").put(file, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage refused (private mode, quota): the session copy still works */
  }
}

export async function loadVideo(projectId: string): Promise<File | null> {
  if (files.has(projectId)) return files.get(projectId)!;
  try {
    const d = await db();
    const file = await new Promise<File | undefined>((resolve, reject) => {
      const req = d.transaction("videos").objectStore("videos").get(projectId);
      req.onsuccess = () => resolve(req.result as File | undefined);
      req.onerror = () => reject(req.error);
    });
    if (file) {
      files.set(projectId, file);
      emit();
      return file;
    }
  } catch {
    /* no stored copy */
  }
  return null;
}

export async function forgetVideo(projectId: string) {
  files.delete(projectId);
  const u = urls.get(projectId);
  if (u) URL.revokeObjectURL(u);
  urls.delete(projectId);
  try {
    const d = await db();
    d.transaction("videos", "readwrite").objectStore("videos").delete(projectId);
  } catch {
    /* nothing stored */
  }
  emit();
}

export function videoUrl(projectId: string): string | null {
  const f = files.get(projectId);
  if (!f) return null;
  if (!urls.has(projectId)) urls.set(projectId, URL.createObjectURL(f));
  return urls.get(projectId)!;
}

export interface Probe {
  duration: number;
  width: number;
  height: number;
  poster: string;
}

function whenSeeked(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => (v.removeEventListener("seeked", done), resolve());
    v.addEventListener("seeked", done);
    v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.05));
  });
}

function snapshot(v: HTMLVideoElement, width: number, quality = 0.78): string {
  const ratio = v.videoHeight / v.videoWidth || 9 / 16;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round(width * ratio);
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

async function openVideo(src: string): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.src = src;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("Format vidéo non lisible par ce navigateur."));
  });
  return v;
}

/** Reads duration, size and a poster frame. Rejects formats the browser cannot decode. */
export async function probeVideo(file: File): Promise<Probe> {
  const src = URL.createObjectURL(file);
  try {
    const v = await openVideo(src);
    await whenSeeked(v, Math.min(1, v.duration / 3));
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, poster: snapshot(v, 480) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Captures one frame per timestamp, in order, yielding as each one is ready. */
export async function* captureFrames(src: string, times: number[], width = 320): AsyncGenerator<{ t: number; data: string }> {
  const v = await openVideo(src);
  for (const t of times) {
    await whenSeeked(v, t);
    yield { t, data: snapshot(v, width) };
  }
  v.removeAttribute("src");
  v.load();
}

/** Re-encodes a frame at a small width so it can be kept with the project. */
export function shrinkImage(dataUrl: string, width = 240, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = Math.round((img.naturalHeight / img.naturalWidth) * width) || Math.round(width * 0.5625);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function formatDuration(s: number): string {
  if (!Number.isFinite(s)) return "–";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}

export function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} Go` : `${Math.max(0.1, mb).toFixed(1).replace(".", ",")} Mo`;
}
