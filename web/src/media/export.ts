/**
 * MP4 export, in the browser (ARCHITECTURE.md § 4.10, C3). Nothing is sent anywhere:
 *  1. the synthesized lines are decoded and placed at their timestamps in an OfflineAudioContext
 *     (48 kHz, stereo): one « voices » track;
 *  2. mediabunny's Conversion copies the video packets as they are (no re-encoding: fast) and, in
 *     `audio.process`, replaces each sample of the original sound by the mix at the same instant:
 *     the original ducked to 18 % under each line (80 ms ramps), plus the French voice;
 *  3. audio codec: AAC when this browser can encode it, otherwise Opus.
 */
import { ALL_FORMATS, AudioSample, BlobSource, BufferTarget, canEncodeAudio, Conversion, Input, Mp4OutputFormat, Output, UrlSource, type AudioCodec } from "mediabunny";

export const DUCK = 0.18;
export const RAMP = 0.08;
export const RATE = 48_000;
const CHANNELS = 2;

export interface TimedLine {
  start: number;
  end: number;
}

export interface ExportLine extends TimedLine {
  /** Object URL (simulated mode) or signed URL (back-end mode) of the synthesized line. */
  url: string;
}

/**
 * Gain of the original sound, one value per output frame: 1 outside the lines, DUCK under them,
 * linear ramps of RAMP seconds before the start and after the end. Pure: unit-tested.
 */
export function duckEnvelope(lines: TimedLine[], frames: number, rate = RATE, duck = DUCK, ramp = RAMP): Float32Array {
  const g = new Float32Array(frames).fill(1);
  const r = Math.max(1, Math.round(ramp * rate));
  for (const l of lines) {
    const a = Math.round(l.start * rate);
    const b = Math.round(l.end * rate);
    for (let k = Math.max(0, a - r); k < Math.min(frames, b + r); k++) {
      const v = k < a ? 1 - (1 - duck) * ((k - (a - r)) / r) : k <= b ? duck : duck + (1 - duck) * ((k - b) / r);
      if (v < g[k]) g[k] = v;
    }
  }
  return g;
}

/** The French lines, each at its timestamp, in one stereo buffer as long as the video. */
export async function renderVoices(lines: ExportLine[], duration: number, fetcher: typeof fetch = fetch): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(CHANNELS, Math.max(1, Math.ceil(duration * RATE)), RATE);
  for (const l of lines) {
    const res = await fetcher(l.url);
    if (!res.ok) throw new Error(`Audio d’une réplique illisible (${res.status}) : rechargez la page puis réessayez.`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(Math.max(0, l.start));
  }
  return ctx.startRendering();
}

/** One audio sample of the original, mixed: original × envelope + voices, clipped to [-1, 1]. */
export function mixSample(sample: AudioSample, voices: AudioBuffer, gain: Float32Array): AudioSample {
  const n = sample.numberOfFrames;
  const ch = sample.numberOfChannels;
  const sr = sample.sampleRate;
  const out = new Float32Array(n * ch);
  const first = Math.round(sample.timestamp * RATE);
  for (let c = 0; c < ch; c++) {
    const plane = out.subarray(c * n, (c + 1) * n);
    sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    const voice = voices.getChannelData(Math.min(c, voices.numberOfChannels - 1));
    for (let i = 0; i < n; i++) {
      const k = sr === RATE ? first + i : Math.round((sample.timestamp + i / sr) * RATE);
      const v = plane[i] * (k >= 0 && k < gain.length ? gain[k] : 1) + (k >= 0 && k < voice.length ? voice[k] : 0);
      plane[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
  const mixed = new AudioSample({ data: out, format: "f32-planar", numberOfChannels: ch, sampleRate: sr, timestamp: sample.timestamp });
  sample.close();
  return mixed;
}

export interface ExportResult {
  blob: Blob;
  audioCodec: AudioCodec;
  /** The video packets were copied as they are (no re-encoding). */
  videoCopied: boolean;
  duration: number;
  lines: number;
  ms: number;
}

export type ExportPhase = "voix" | "assemblage";

/** The dubbed MP4 of a source video (File, Blob or URL) and its French lines. */
export async function exportMp4(source: Blob | string, lines: ExportLine[], onProgress?: (fraction: number, phase: ExportPhase) => void): Promise<ExportResult> {
  const t0 = performance.now();
  const input = new Input({ formats: ALL_FORMATS, source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source) });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error("Aucune piste vidéo dans ce fichier.");
  if (!(await input.getPrimaryAudioTrack())) throw new Error("Cette vidéo n’a pas de piste son : rien sous lequel poser les voix françaises.");
  const duration = await input.computeDuration();

  onProgress?.(0, "voix");
  const voices = await renderVoices(lines, duration);
  const gain = duckEnvelope(lines, voices.length);

  const audioCodec: AudioCodec = (await canEncodeAudio("aac", { numberOfChannels: CHANNELS, sampleRate: RATE })) ? "aac" : "opus";
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    audio: {
      codec: audioCodec,
      numberOfChannels: CHANNELS,
      sampleRate: RATE,
      forceTranscode: true,
      process: (sample) => mixSample(sample, voices, gain),
      processedNumberOfChannels: CHANNELS,
      processedSampleRate: RATE,
    },
  });
  if (!conversion.isValid) {
    const why = conversion.discardedTracks.map((d) => `${d.track.type} : ${d.reason}`).join(", ");
    throw new Error(`Export impossible dans ce navigateur (${why || "configuration refusée"}).`);
  }
  conversion.onProgress = (p) => onProgress?.(p, "assemblage");
  await conversion.execute();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Le fichier MP4 n’a pas été produit.");
  return {
    blob: new Blob([buffer], { type: format.mimeType }),
    audioCodec,
    videoCopied: video.codec !== null && (format.getSupportedCodecs() as string[]).includes(video.codec),
    duration,
    lines: lines.length,
    ms: Math.round(performance.now() - t0),
  };
}
