/** A short silent WAV, used only when SAWTI_TTS_MOCK=1 (test audio, always flagged as such). */
export function silentWav(seconds: number): ArrayBuffer {
  const rate = 16000;
  const n = Math.round(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  return buf;
}

/* ------------------------------------------------------------------ duration of a synthesized line (C2) */

const MP3_BITRATES: Record<string, number[]> = {
  // kbps by index 1..14: MPEG-1 Layer III, then MPEG-2/2.5 Layer III
  v1: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Seconds of an MP3 (Layer III frames, CBR or VBR, with or without ID3v2), or null if unreadable. */
export function mp3Seconds(b: Uint8Array): number | null {
  let i = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (b[i + 1] >> 3) & 3; // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
    const layer = (b[i + 1] >> 1) & 3; // 1: Layer III
    const bitrateIndex = b[i + 2] >> 4;
    const rateIndex = (b[i + 2] >> 2) & 3;
    const padding = (b[i + 2] >> 1) & 1;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      i++;
      continue;
    }
    const kbps = MP3_BITRATES[version === 3 ? "v1" : "v2"][bitrateIndex - 1];
    const rate = MP3_RATES[version][rateIndex];
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + padding;
    if (length < 4) break;
    seconds += samples / rate;
    frames++;
    i += length;
  }
  return frames ? seconds : null;
}

/** Seconds of a PCM WAV (from its fmt and data chunks), or null if unreadable. */
export function wavSeconds(b: Uint8Array): number | null {
  if (b.length < 44 || String.fromCharCode(...b.subarray(0, 4)) !== "RIFF") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let byteRate = 0;
  for (let i = 12; i + 8 <= b.length; ) {
    const id = String.fromCharCode(...b.subarray(i, i + 4));
    const size = v.getUint32(i + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(i + 16, true);
    if (id === "data") return byteRate ? Math.min(size, b.length - i - 8) / byteRate : null;
    i += 8 + size + (size % 2);
  }
  return null;
}

export const audioSeconds = (bytes: Uint8Array, mime: string): number | null => (mime === "audio/wav" ? wavSeconds(bytes) : mp3Seconds(bytes));
