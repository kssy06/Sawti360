import { describe, expect, it } from "vitest";
import { frameTimes, MAX_FRAMES } from "./extract";

describe("B1 · images envoyées au modèle de vision", () => {
  it("une image toutes les max(2 s, durée / 60), 60 au plus, au milieu de chaque intervalle", () => {
    expect(frameTimes(10)).toEqual([1, 3, 5, 7, 9]);
    const long = frameTimes(300);
    expect(long).toHaveLength(MAX_FRAMES);
    expect(long[0]).toBe(2.5);
    expect(long[1] - long[0]).toBeCloseTo(5);
    expect(frameTimes(120)).toHaveLength(60);
  });
  it("durée inconnue ou nulle : aucune image", () => {
    expect(frameTimes(0)).toEqual([]);
    expect(frameTimes(Number.NaN)).toEqual([]);
  });
});
