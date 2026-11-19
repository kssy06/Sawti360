/**
 * What the analysis needs from the video, produced in the browser (no video goes through Vercel):
 *  - the audio: primary track, mono 16 kHz, Ogg/Opus (~0.2 Mo per minute), or WAV if Opus cannot
 *    be encoded here;
 *  - frames: one every max(2 s, duration / 60), 60 at most, 384 px wide, JPEG quality 0.7.
 * mediabunny decodes, resamples, mixes down and encodes (Conversion), and reads frames (CanvasSink).
 */
import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeAudio, CanvasSink, Conversion, Input, OggOutputFormat, Output, QUALITY_LOW, WavOutputFormat } from "mediabunny";
import { captureFrames } from "./local";

export const AUDIO_RATE = 16_000;
export const MAX_FRAMES = 60;
export const FRAME_WIDTH = 384;
export const FRAME_QUALITY = 0.7;

export interface ExtractedAudio {
  blob: Blob;
  mime: "audio/ogg" | "audio/wav";
  /** Duration of the media, in seconds. */
  duration: number;
  /** SHA-256 of the extracted audio: the same file is never analysed twice. */
  sha256: string;
}

export interface ExtractedFrame {
  /** Instant in seconds. */
  t: number;
  blob: Blob;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Instants of the frames sent to the vision model. Pure: unit-tested. */
export function frameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const step = Math.max(2, duration / MAX_FRAMES);
  const out: number[] = [];
  for (let t = step / 2; t < duration && out.length < MAX_FRAMES; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

export async function extractAudio(file: Blob, onProgress?: (ratio: number) => void, opts: { format?: "auto" | "wav" } = {}): Promise<ExtractedAudio> {
  const opus = opts.format !== "wav" && (await canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: AUDIO_RATE }).catch(() => false));
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Cette vidéo n’a pas de piste audio : l’analyse a besoin de la parole.");
    const target = new BufferTarget();
    const output = new Output({ format: opus ? new OggOutputFormat() : new WavOutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
      audio: opus
        ? { codec: "opus", numberOfChannels: 1, sampleRate: AUDIO_RATE, quality: QUALITY_LOW, forceTranscode: true }
        : { codec: "pcm-s16", numberOfChannels: 1, sampleRate: AUDIO_RATE, forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error("La piste audio de cette vidéo ne peut pas être décodée par ce navigateur.");
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || !buffer.byteLength) throw new Error("Extraction audio vide.");
    const duration = await input.computeDuration();
    const mime = opus ? "audio/ogg" : "audio/wav";
    return { blob: new Blob([buffer], { type: mime }), mime, duration, sha256: await sha256Hex(buffer) };
  } finally {
    input.dispose();
  }
}

async function toJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: FRAME_QUALITY });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image illisible."))), "image/jpeg", FRAME_QUALITY));
}

/** Frames read from the file itself; an audio-only file gives none. */
export async function extractFrames(file: Blob, duration: number, onFrame?: (done: number, total: number) => void): Promise<ExtractedFrame[]> {
  const times = frameTimes(duration);
  if (!times.length) return [];
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const sink = new CanvasSink(track, { width: FRAME_WIDTH, fit: "contain" });
    const out: ExtractedFrame[] = [];
    let i = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      const t = times[i++];
      if (wrapped) out.push({ t, blob: await toJpeg(wrapped.canvas) });
      onFrame?.(i, times.length);
    }
    return out;
  } finally {
    input.dispose();
  }
}

/** Fallback for a video only reachable by URL (link import): frames through a <video> element. */
export async function extractFramesFromUrl(src: string, duration: number): Promise<ExtractedFrame[]> {
  const out: ExtractedFrame[] = [];
  try {
    for await (const f of captureFrames(src, frameTimes(duration), FRAME_WIDTH)) out.push({ t: f.t, blob: await (await fetch(f.data)).blob() });
  } catch {
    /* host without CORS: no frames, the analysis goes on with the audio */
  }
  return out;
}
