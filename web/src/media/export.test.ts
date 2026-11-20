import { describe, expect, it } from "vitest";
import { DUCK, duckEnvelope, RAMP } from "./export";

const RATE = 1000; // 1 frame per millisecond: easy to read

describe("C3 · mixage de l'export MP4", () => {
  it("l'original garde son niveau hors des répliques et passe à 18 % dessous", () => {
    const g = duckEnvelope([{ start: 1, end: 2 }], 4000, RATE);
    expect(g[0]).toBe(1);
    expect(g[800]).toBe(1);
    expect(g[1500]).toBeCloseTo(DUCK, 5);
    expect(g[3000]).toBe(1);
  });

  it("rampes de 80 ms avant le début et après la fin", () => {
    const g = duckEnvelope([{ start: 1, end: 2 }], 4000, RATE);
    const r = RAMP * RATE;
    expect(g[1000 - r]).toBeCloseTo(1, 5);
    expect(g[1000 - r / 2]).toBeCloseTo(1 - (1 - DUCK) / 2, 5);
    expect(g[1000]).toBeCloseTo(DUCK, 5);
    expect(g[2000 + r / 2]).toBeCloseTo(DUCK + (1 - DUCK) / 2, 5);
    expect(g[2000 + r]).toBe(1);
  });

  it("répliques rapprochées : le plus bas l'emporte, sans remonter entre elles", () => {
    const g = duckEnvelope([{ start: 1, end: 2 }, { start: 2.05, end: 3 }], 4000, RATE);
    expect(Math.max(...g.slice(1000, 3000))).toBeLessThan(0.5);
  });

  it("une réplique au tout début ou au-delà de la fin ne déborde pas", () => {
    const g = duckEnvelope([{ start: 0, end: 0.5 }, { start: 3.9, end: 5 }], 4000, RATE);
    expect(g.length).toBe(4000);
    expect(g[0]).toBeCloseTo(DUCK, 5);
    expect(g[3999]).toBeCloseTo(DUCK, 5);
  });
});
