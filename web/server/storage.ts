/**
 * Files (Supabase Storage, private buckets). Nothing heavy goes through Vercel (4.5 MB per request):
 * the server checks type, size and ownership, then hands out a signed upload URL (valid 2 h);
 * reads use signed URLs valid 10 minutes, or a server-side download for the AI calls.
 */
import { badRequest, ApiError } from "./errors.js";
import { supabaseAdmin } from "./supabase.js";

export type Bucket = "media" | "dossiers" | "samples";
export type UploadKind = "audio" | "frame" | "original" | "dossier" | "sample";

export interface FileStore {
  signUpload(bucket: Bucket, path: string): Promise<{ signedUrl: string; token: string }>;
  signRead(bucket: Bucket, path: string, seconds?: number): Promise<string>;
  read(bucket: Bucket, path: string): Promise<Uint8Array>;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
}

const supabaseStore: FileStore = {
  async signUpload(bucket, path) {
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new ApiError(502, "STOCKAGE_INDISPONIBLE", `Le stockage n’a pas délivré d’URL d’envoi (${error?.message ?? "réponse vide"}).`);
    return { signedUrl: data.signedUrl, token: data.token };
  },
  async signRead(bucket, path, seconds = 600) {
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, seconds);
    if (error || !data) throw new ApiError(502, "STOCKAGE_INDISPONIBLE", `Fichier illisible dans le stockage (${error?.message ?? "réponse vide"}).`);
    return data.signedUrl;
  },
  async read(bucket, path) {
    const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
    if (error || !data) throw new ApiError(404, "INTROUVABLE", `Fichier absent du stockage : ${path}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  async remove(bucket, paths) {
    if (paths.length) await supabaseAdmin().storage.from(bucket).remove(paths);
  },
};

let store: FileStore = supabaseStore;

export const files = (): FileStore => store;

/** Tests only. */
export function setFileStoreForTests(s: FileStore | null): void {
  store = s ?? supabaseStore;
}

/* ------------------------------------------------------------------ upload rules (API.md « Fichiers ») */

const MB = 1024 * 1024;
const EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const AUDIO = ["audio/ogg", "audio/wav", "audio/webm", "audio/mpeg", "audio/mp4"];

export const RULES: Record<UploadKind, { bucket: Bucket; mimes: string[]; max: number; label: string }> = {
  audio: { bucket: "media", mimes: AUDIO, max: 25 * MB, label: "audio" },
  frame: { bucket: "media", mimes: ["image/jpeg", "image/webp"], max: 1 * MB, label: "image" },
  original: { bucket: "media", mimes: ["video/mp4", "video/webm", "video/quicktime"], max: 50 * MB, label: "vidéo d’origine" },
  dossier: { bucket: "dossiers", mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], max: 20 * MB, label: "document familial" },
  sample: { bucket: "samples", mimes: AUDIO, max: 20 * MB, label: "échantillon de voix" },
};

/** "audio/webm;codecs=opus" → "audio/webm" (the buckets' allowed types have no parameters). */
export const cleanMime = (t: string) => t.split(";")[0].trim().toLowerCase();

const SAFE = /^[A-Za-z0-9_-]{1,80}$/;

export interface UploadPlanInput {
  kind: UploadKind;
  accountId: string;
  contentType: string;
  size: number;
  projectId?: string;
  characterKey?: string;
  /** Frames: instant of the image in milliseconds. */
  t?: number;
  /** Dossiers: SHA-256 of the document, computed in the browser. */
  sha256?: string;
  /** Public samples: the consent the recording belongs to. */
  consentId?: string;
  now?: Date;
}

/** Bucket and path of an upload, after checking type and size (400 / 413). Pure: unit-tested. */
export function planUpload(i: UploadPlanInput): { bucket: Bucket; path: string; contentType: string } {
  const rule = RULES[i.kind];
  const mime = cleanMime(i.contentType);
  if (!rule.mimes.includes(mime)) throw badRequest(`Type de fichier refusé pour un ${rule.label} : ${mime || "inconnu"}. Acceptés : ${rule.mimes.join(", ")}.`);
  if (!Number.isFinite(i.size) || i.size <= 0) throw badRequest("Fichier vide.");
  if (i.size > rule.max) throw new ApiError(413, "FICHIER_TROP_GROS", `Fichier trop lourd pour un ${rule.label} : ${Math.round(rule.max / MB)} Mo au plus.`);
  const ext = EXT[mime];
  const project = () => {
    if (!i.projectId || !SAFE.test(i.projectId)) throw badRequest("Projet manquant ou invalide.");
    return `${i.accountId}/${i.projectId}`;
  };
  const stamp = (i.now ?? new Date()).getTime();
  switch (i.kind) {
    case "audio":
      return { bucket: rule.bucket, path: `${project()}/audio.${ext}`, contentType: mime };
    case "frame": {
      if (i.t === undefined || !Number.isInteger(i.t) || i.t < 0 || i.t > 6 * 3600 * 1000) throw badRequest("Instant de l’image manquant (t, en millisecondes).");
      return { bucket: rule.bucket, path: `${project()}/frames/${i.t}.${ext}`, contentType: mime };
    }
    case "original":
      return { bucket: rule.bucket, path: `${project()}/original.${ext}`, contentType: mime };
    case "dossier": {
      if (!i.characterKey || !SAFE.test(i.characterKey)) throw badRequest("Personnage manquant ou invalide.");
      if (!i.sha256 || !/^[0-9a-f]{64}$/.test(i.sha256)) throw badRequest("Empreinte SHA-256 du document manquante.");
      return { bucket: rule.bucket, path: `${project()}/${i.characterKey}/${i.sha256}.${ext}`, contentType: mime };
    }
    case "sample":
      return i.consentId
        ? { bucket: rule.bucket, path: `public/${i.consentId}/sample-${stamp}.${ext}`, contentType: mime }
        : { bucket: rule.bucket, path: `${i.accountId}/sample-${stamp}.${ext}`, contentType: mime };
  }
}

/** A path sent back by the browser must be under the account's (and project's) own prefix. */
export function assertOwnPath(path: string, prefix: string): void {
  if (!path.startsWith(`${prefix}/`) || path.includes("..") || path.includes("//")) throw badRequest("Chemin de fichier invalide pour ce compte.");
}
