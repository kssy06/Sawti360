import { describe, expect, it } from "vitest";
import { audioSeconds, mp3Seconds, silentWav, wavSeconds } from "./audio.js";

/** N frames of MPEG-1 Layer III, 128 kbps, 44.1 kHz (417 or 418 bytes each), optionally after an ID3v2 tag. */
function fakeMp3(frames: number, id3 = 0): Uint8Array {
  const parts: number[] = [];
  if (id3) parts.push(0x49, 0x44, 0x33, 4, 0, 0, 0, 0, (id3 >> 7) & 0x7f, id3 & 0x7f, ...new Array(id3).fill(0));
  for (let f = 0; f < frames; f++) {
    const padding = f % 3 === 0 ? 1 : 0;
    const header = [0xff, 0xfb, 0x90 | (padding << 1), 0x64];
    parts.push(...header, ...new Array(417 + padding - 4).fill(0x55));
  }
  return new Uint8Array(parts);
}

describe("C2 · durée de l'audio synthétisé", () => {
  it("WAV : durée exacte d'après les en-têtes", () => {
    expect(wavSeconds(new Uint8Array(silentWav(2.5)))).toBeCloseTo(2.5, 3);
    expect(audioSeconds(new Uint8Array(silentWav(0.6)), "audio/wav")).toBeCloseTo(0.6, 3);
    expect(wavSeconds(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("MP3 : somme des trames (1152 échantillons à 44,1 kHz), étiquette ID3 ignorée", () => {
    expect(mp3Seconds(fakeMp3(100))).toBeCloseTo((100 * 1152) / 44100, 3);
    expect(mp3Seconds(fakeMp3(50, 300))).toBeCloseTo((50 * 1152) / 44100, 3);
    expect(audioSeconds(fakeMp3(10), "audio/mpeg")).toBeCloseTo((10 * 1152) / 44100, 3);
    expect(mp3Seconds(new TextEncoder().encode("pas un mp3"))).toBeNull();
  });
});
