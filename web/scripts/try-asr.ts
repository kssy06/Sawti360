/**
 * Tries Groq Whisper on a local audio file, outside the interface (B0, B2):
 *   npx tsx --env-file=.env.local scripts/try-asr.ts extrait.ogg [fr]
 * Prints the timed turns kept for the analysis (silences dropped, short turns merged).
 * With "fr", transcribes in French without prompt (voice-sample check, B7).
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { transcribeFrench, whisperTimeline } from "../server/ai/groq";

const [file, lang] = process.argv.slice(2);
if (!file) {
  console.error("Usage : npx tsx --env-file=.env.local scripts/try-asr.ts <fichier audio> [fr]");
  process.exit(1);
}
const mime = { ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".webm": "audio/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" }[extname(file).toLowerCase()] ?? "audio/ogg";
const audio = { bytes: new Uint8Array(readFileSync(file)), mime };
const t0 = Date.now();
if (lang === "fr") {
  const { text, model } = await transcribeFrench(audio);
  console.log(`${model} · ${((Date.now() - t0) / 1000).toFixed(1)} s\n${text}`);
} else {
  const { segments, model } = await whisperTimeline(audio);
  console.log(`${model} · ${segments.length} segments · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const s of segments) console.log(`${s.id}\t${s.start.toFixed(2)}–${s.end.toFixed(2)}\t${s.text}`);
}
