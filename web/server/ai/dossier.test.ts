import { afterEach, describe, expect, it } from "vitest";
import { setEnvForTests } from "../env.js";
import { setClaudeForTests, type ClaudeLike } from "./claude.js";
import { checkDossier, decideOutcome, toFamilyCheck } from "./dossier.js";
import { setGeminiForTests, type GeminiLike } from "./gemini.js";
import type { DossierOut } from "./schemas.js";

const base: DossierOut = {
  documentReadable: true,
  extractedPerson: "Mohamed B.",
  extractedRole: "le conteur de l’épisode (le grand-père)",
  nameMatchesDeclared: true,
  matchedCharacterKey: "jeddi",
  proposedOutcome: "correspondance",
  videoFinding: "Le grand-père raconte ses souvenirs du souk.",
  explanation: "Le rôle écrit correspond au personnage Jeddi.",
};

describe("D3 · règles déterministes du dossier familial (IA.md § 4.4)", () => {
  it("(1) document qui nomme la bonne personne et le bon rôle → correspondance", () => {
    expect(decideOutcome(base, "jeddi").outcome).toBe("correspondance");
  });
  it("(2) même document, rôle de la narratrice → incohérence", () => {
    expect(decideOutcome({ ...base, extractedRole: "la narratrice", matchedCharacterKey: "narr" }, "jeddi")).toMatchObject({ outcome: "incoherence", rule: expect.stringContaining("autre personnage") });
  });
  it("(3) page sans rôle, ou photo floue → vérification nécessaire", () => {
    expect(decideOutcome({ ...base, extractedRole: "" }, "jeddi").outcome).toBe("verification");
    expect(decideOutcome({ ...base, documentReadable: false }, "jeddi").outcome).toBe("verification");
  });
  it("le document nomme une autre personne → incohérence, même si l'IA proposait une correspondance", () => {
    expect(decideOutcome({ ...base, nameMatchesDeclared: false }, "jeddi")).toMatchObject({ outcome: "incoherence", rule: expect.stringContaining("autre personne") });
  });
  it("l'IA hésite (verification) ou ne rattache personne → vérification ; correspondance exige l'IA ET les règles", () => {
    expect(decideOutcome({ ...base, proposedOutcome: "verification" }, "jeddi").outcome).toBe("verification");
    expect(decideOutcome({ ...base, matchedCharacterKey: null }, "jeddi").outcome).toBe("verification");
    expect(decideOutcome({ ...base, nameMatchesDeclared: null }, "jeddi").outcome).toBe("correspondance");
  });
  it("le résultat devient un FamilyCheck réel avec le nom du modèle", () => {
    expect(toFamilyCheck({ ...base, matchedCharacterKey: "narr" }, "jeddi", "gemini-3.8-flash", new Date("2026-11-20T10:00:00Z"))).toMatchObject({
      outcome: "incoherence",
      extractedPerson: "Mohamed B.",
      simulated: false,
      provider: "gemini-3.8-flash",
      at: "2026-11-20T10:00:00.000Z",
    });
  });
});

describe("D3 · chaîne Gemini → Claude → vérification", () => {
  const input = { document: { bytes: new Uint8Array([37, 80, 68, 70]), mime: "application/pdf" }, declaredName: "Mohamed B.", declaredRole: "le grand-père", targetKey: "jeddi", characters: [], frames: [] };
  afterEach(() => {
    setGeminiForTests(null);
    setClaudeForTests(null);
    setEnvForTests(null);
  });
  it("Gemini lit le PDF ; s'il échoue, Claude le lit ; sans modèle : vérification nécessaire, jamais une correspondance", async () => {
    setEnvForTests({ GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    const seen: Record<string, unknown>[] = [];
    setGeminiForTests({ models: { generateContent: async (r) => (seen.push(r), { text: JSON.stringify(base) }) } } as GeminiLike);
    let r = await checkDossier(input);
    expect(r.check).toMatchObject({ outcome: "correspondance", provider: "gemini-3.8-flash" });
    expect(((seen[0].contents as { parts: Record<string, unknown>[] }[])[0].parts[0] as { inlineData: { mimeType: string } }).inlineData.mimeType).toBe("application/pdf");

    setGeminiForTests({ models: { generateContent: async () => Promise.reject(new Error("quota")) } } as GeminiLike);
    setClaudeForTests({ beta: { messages: { parse: async () => ({ parsed_output: { ...base, documentReadable: false }, stop_reason: "end_turn", model: "claude-opus-5-5" }) } } } as ClaudeLike);
    r = await checkDossier(input);
    expect(r.check).toMatchObject({ outcome: "verification", provider: "claude-opus-5-5" });
    expect(r.notes[0]).toContain("quota");

    setEnvForTests({});
    setGeminiForTests(null);
    setClaudeForTests(null);
    r = await checkDossier(input);
    expect(r.check).toMatchObject({ outcome: "verification", provider: "aucun modèle disponible" });
  });
});
