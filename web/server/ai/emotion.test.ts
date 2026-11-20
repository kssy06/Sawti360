import { describe, expect, it } from "vitest";
import { EMOTION_KEYS, EMOTIONS } from "../../src/core/emotion.js";
import { assembleAnalysis } from "./analysis.js";
import { voiceSettings } from "./elevenlabs.js";

describe("Émotions des voix françaises", () => {
  it("neutre : les réglages d'avant (stabilité 0,55, pas de style, vitesse normale)", () => {
    expect(voiceSettings()).toEqual({ stability: 0.55, similarity_boost: 0.75, style: 0, use_speaker_boost: true });
  });

  it("chaque émotion change la voix : plus expressive que neutre, rythme borné à 0,7–1,2", () => {
    for (const k of EMOTION_KEYS.filter((k) => k !== "neutre")) {
      const v = voiceSettings({ emotion: k });
      expect(v.style).toBeGreaterThan(0);
      expect(v.speed ?? 1).toBeGreaterThanOrEqual(0.7);
      expect(v.speed ?? 1).toBeLessThanOrEqual(1.2);
    }
    expect(voiceSettings({ emotion: "colere" }).stability).toBeLessThan(EMOTIONS.neutre.stability);
    expect(voiceSettings({ emotion: "tristesse" }).speed).toBeLessThan(1);
  });

  it("l'ajustement du débit (C2) s'ajoute au rythme de l'émotion, sans dépasser 1,2", () => {
    expect(voiceSettings({ emotion: "tristesse", speed: 1.1 }).speed).toBe(1.01);
    expect(voiceSettings({ emotion: "enthousiasme", speed: 1.15 }).speed).toBe(1.2);
  });

  it("l'analyse garde l'émotion entendue ; une valeur inconnue ou neutre n'est pas écrite", () => {
    const speakers = [{ key: "p1", proposedName: "A", nameEvidence: "aucun", proposedDescription: "", gender: "inconnu" as const }];
    const seg = (id: string, emotion: unknown) => ({ id, speaker: "p1", source: "س", certainty: 0.9, translation: "T", context: "", emotion: emotion as never });
    const a = assembleAnalysis(
      ["s1", "s2", "s3"].map((id, i) => ({ id, start: i * 2, end: i * 2 + 1.5, text: "x" })),
      { speakers, segments: [seg("s1", "tristesse"), seg("s2", "neutre"), seg("s3", "hurlement")] },
    );
    expect(a.segments.map((s) => s.emotion)).toEqual(["tristesse", undefined, undefined]);
  });
});
