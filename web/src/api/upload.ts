/**
 * Sends a file straight to Supabase Storage: the API checks it and returns a signed upload URL,
 * then the browser uploads the bytes itself (nothing heavy goes through Vercel).
 */
import { supabase } from "../lib/supabase";
import { api } from "./client";

export type UploadKind = "audio" | "frame" | "original" | "dossier" | "sample";

export interface UploadTicket {
  bucket: "media" | "dossiers" | "samples";
  path: string;
  token: string;
  signedUrl: string;
  contentType: string;
}

export interface UploadOptions {
  projectId?: string;
  characterKey?: string;
  /** Frames: instant in milliseconds. */
  t?: number;
  /** Dossiers: SHA-256 of the document. */
  sha256?: string;
  name?: string;
}

/** "audio/webm;codecs=opus" → "audio/webm": the buckets accept bare types only. */
export const bareType = (t: string) => t.split(";")[0].trim().toLowerCase();

async function put(ticket: UploadTicket, file: Blob): Promise<{ bucket: UploadTicket["bucket"]; path: string }> {
  const sb = await supabase();
  // Raw bytes with their type (a Blob would be sent as multipart form data).
  const { error } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, await file.arrayBuffer(), {
    contentType: ticket.contentType,
    upsert: true,
  });
  if (error) throw new Error(`Envoi du fichier refusé par le stockage : ${error.message}`);
  return { bucket: ticket.bucket, path: ticket.path };
}

export async function uploadFile(kind: UploadKind, file: Blob, opts: UploadOptions = {}) {
  const ticket = await api.post<UploadTicket>("/uploads", { kind, contentType: bareType(file.type || "application/octet-stream"), size: file.size, ...opts });
  return put(ticket, file);
}

/** Public consent page: the invited person's recording, authorized by the link's token. */
export async function uploadPublicSample(token: string, file: Blob) {
  const ticket = await api.post<UploadTicket>("/public/uploads", { token, contentType: bareType(file.type), size: file.size }, { anonymous: true });
  return put(ticket, file);
}

/** Runs uploads with at most `n` in flight (frames: 4 at a time). */
export async function inParallel<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
