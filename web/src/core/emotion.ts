/**
 * The feeling a French line is spoken with. The analysis model hears the original voice and proposes
 * one per line; the creator can change it on the Traduction step; the voice engine plays it.
 *
 * With ElevenLabs' eleven_multilingual_v2 the feeling is carried by the voice settings: a lower
 * stability lets the voice vary more (livelier, more emotional), a higher « style » exaggerates the
 * delivery, and a small speed change helps (sadness slower, fear faster). The effect is real but
 * subtle: v2 cannot whisper, cry or shout on demand.
 */

export type Emotion = "neutre" | "joie" | "enthousiasme" | "tendresse" | "tristesse" | "colere" | "peur" | "surprise" | "ironie";

export interface EmotionVoice {
  /** Label in the interface. */
  label: string;
  /** ElevenLabs voice_settings.stability (0–1): lower = more expressive. */
  stability: number;
  /** ElevenLabs voice_settings.style (0–1): higher = more exaggerated delivery. */
  style: number;
  /** ElevenLabs voice_settings.speed (0.7–1.2), when the feeling changes the pace. */
  speed?: number;
}

export const EMOTIONS: Record<Emotion, EmotionVoice> = {
  neutre: { label: "Neutre", stability: 0.55, style: 0 },
  joie: { label: "Joie", stability: 0.35, style: 0.45, speed: 1.03 },
  enthousiasme: { label: "Enthousiasme", stability: 0.25, style: 0.65, speed: 1.06 },
  tendresse: { label: "Tendresse", stability: 0.65, style: 0.3, speed: 0.95 },
  tristesse: { label: "Tristesse", stability: 0.7, style: 0.4, speed: 0.92 },
  colere: { label: "Colère", stability: 0.25, style: 0.75, speed: 1.04 },
  peur: { label: "Peur", stability: 0.3, style: 0.55, speed: 1.06 },
  surprise: { label: "Surprise", stability: 0.3, style: 0.55 },
  ironie: { label: "Ironie", stability: 0.4, style: 0.5 },
};

export const EMOTION_KEYS = Object.keys(EMOTIONS) as [Emotion, ...Emotion[]];

export const isEmotion = (x: unknown): x is Emotion => typeof x === "string" && Object.hasOwn(EMOTIONS, x);
