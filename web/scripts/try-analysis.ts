/**
 * Tries the analysis chain (Whisper → Gemini → fallbacks) on local files, outside the interface (B0, B3):
 *   npx tsx --env-file=.env.local scripts/try-analysis.ts extrait.ogg [dossier_images] [durée_s]
 * Prepare the files from a video with ffmpeg, as the browser would:
 *   ffmpeg -i video.mp4 -vn -ac 1 -ar 16000 -c:a libopus -b:a 24k extrait.ogg
 *   mkdir images && ffmpeg -i video.mp4 -vf "fps=1/2,scale=384:-2" -q:v 5 images/%04d.jpg
 * Images are read in name order and placed every 2 s (the browser sends at most 60).
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { analyse } from "../server/ai/analysis";

const [audioFile, framesDir, durationArg] = process.argv.slice(2);
if (!audioFile) {
  console.error("Usage : npx tsx --env-file=.env.local scripts/try-analysis.ts <audio> [dossier_images] [durée_s]");
  process.exit(1);
}
const mime = extname(audioFile).toLowerCase() === ".wav" ? "audio/wav" : "audio/ogg";
const frames = framesDir
  ? readdirSync(framesDir)
      .filter((f) => /\.jpe?g$/i.test(f))
      .sort()
      .slice(0, 60)
      .map((f, i) => ({ t: 1 + i * 2, bytes: new Uint8Array(readFileSync(join(framesDir, f))), mime: "image/jpeg" }))
  : [];
const duration = Number(durationArg) || frames.length * 2 || 120;
const t0 = Date.now();
const r = await analyse(
  { audio: { bytes: new Uint8Array(readFileSync(audioFile)), mime }, frames, title: "Essai", format: "film", duration },
  async (n, d) => console.log(`étape ${n} · ${d ?? ""} (${((Date.now() - t0) / 1000).toFixed(1)} s)`),
);
console.log("\nModèles :", r.providers, r.notes.length ? `\nReplis : ${r.notes.join(" | ")}` : "");
console.log("Intervenants :", r.assembled.speakers);
for (const s of r.assembled.segments) {
  console.log(`\n${s.id} ${s.start}–${s.end} [${s.speaker}] confiance ${s.confidence.toFixed(2)}${s.fits ? "" : " · trop longue"}`);
  console.log(`  derja : ${s.source}\n  fr    : ${s.translation}\n  note  : ${s.context ?? ""}`);
}
console.log(`\nTotal : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
