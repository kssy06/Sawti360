/**
 * ElevenLabs text-to-speech (eleven_multilingual_v2), on the server only: the key never reaches the browser.
 * SAWTI_TTS_MOCK=1 (development) returns a silent WAV as long as the line would be, flagged « mock »:
 * no credits spent, and the rest of the chain (rules, jetons, storage, journal) runs for real.
 */
import { EMOTIONS, type Emotion } from "../../src/core/emotion.js";
import { silentWav } from "../audio.js";
import { env } from "../env.js";
import { ApiError } from "../errors.js";

export interface Speech {
  bytes: Uint8Array<ArrayBuffer>;
  mime: "audio/mpeg" | "audio/wav";
  mock: boolean;
  /** Time spent by the voice engine. */
  ms: number;
}

export interface SpeechOptions {
  /** voice_settings.speed (0.7 to 1.2 at ElevenLabs); used by the rate adjustment (C2). */
  speed?: number;
  /** The feeling to play (absent: neutral). */
  emotion?: Emotion;
}

/**
 * ElevenLabs voice settings for a line: the feeling sets stability, style and pace; the rate
 * adjustment (C2) multiplies the pace, kept within ElevenLabs' 0.7–1.2. Pure: unit-tested.
 */
export function voiceSettings(opts: SpeechOptions = {}): { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed?: number } {
  const e = EMOTIONS[opts.emotion ?? "neutre"] ?? EMOTIONS.neutre;
  const pace = (e.speed ?? 1) * (opts.speed ?? 1);
  const speed = Math.round(Math.min(1.2, Math.max(0.7, pace)) * 100) / 100;
  return { stability: e.stability, similarity_boost: 0.75, style: e.style, use_speaker_boost: true, ...(speed !== 1 ? { speed } : {}) };
}

export type Synthesizer = (elevenVoiceId: string, text: string, opts?: SpeechOptions) => Promise<Speech>;

/** About 15 characters a second in French: the test audio lasts as long as the real line would. */
export const mockSeconds = (text: string) => Math.min(12, Math.max(0.6, [...text].length / 15));

const elevenlabs: Synthesizer = async (voice, text, opts = {}) => {
  const e = env();
  const t0 = performance.now();
  if (e.SAWTI_TTS_MOCK) return { bytes: new Uint8Array(silentWav(mockSeconds(text) / (voiceSettings(opts).speed ?? 1))), mime: "audio/wav", mock: true, ms: Math.round(performance.now() - t0) };
  if (!e.ELEVENLABS_API_KEY) throw new ApiError(503, "SYNTHESE_NON_CONFIGUREE", "Autorisé par le Passeport de voix, mais la clé ElevenLabs n’est pas configurée sur ce déploiement.");
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": e.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: e.models.tts,
        voice_settings: voiceSettings(opts),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new ApiError(502, "MOTEUR_VOIX_INDISPONIBLE", `Le moteur de voix ne répond pas (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const why = res.status === 401 ? " : clé refusée" : res.status === 429 ? " : quota ou crédits épuisés" : "";
    throw new ApiError(502, "MOTEUR_VOIX_INDISPONIBLE", `Le moteur de voix a répondu ${res.status}${why}.`, { detail });
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: "audio/mpeg", mock: false, ms: Math.round(performance.now() - t0) };
};

let current: Synthesizer = elevenlabs;

export const speak: Synthesizer = (voice, text, opts) => current(voice, text, opts);

/** Tests only. */
export function setSynthesizerForTests(fn: Synthesizer | null): void {
  current = fn ?? elevenlabs;
}
