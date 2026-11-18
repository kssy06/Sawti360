import type { Segment } from "./types";

function stamp(s: number): string {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
}

/** French subtitles from the lines a human validated, in time order. */
export function toSrt(segments: Segment[]): string {
  return segments
    .filter((s) => s.validated && s.translation.trim())
    .sort((a, b) => a.start - b.start)
    .map((s, i) => `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.translation.trim()}\n`)
    .join("\n");
}
