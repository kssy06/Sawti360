/**
 * Family dossier consistency check (IA.md § 4.4). The AI reads the document and proposes; the CODE
 * decides between the three outcomes with deterministic rules. A « correspondance » needs both the AI
 * and the rules; validation stays human. The check verifies role consistency only: it never certifies
 * the signature, the family tie or the legal standing of the signatories.
 * Chain: Gemini (PDF and photos) → Claude (PDF native) if configured → « Vérification nécessaire ».
 */
import type { CheckOutcome, FamilyCheck } from "../../src/state/workflow.js";
import { claudeConfigured, claudeJson, documentBlock } from "./claude.js";
import { geminiConfigured, geminiJson, inline } from "./gemini.js";
import { PROMPT_DOSSIER } from "./prompts.js";
import { DossierOut } from "./schemas.js";

export interface DossierInput {
  document: { bytes: Uint8Array; mime: string };
  declaredName: string;
  declaredRole: string;
  targetKey: string;
  characters: { key: string; name: string; description: string; lines: number; firstLines: string[] }[];
  /** Images where the target character speaks (4 at most). */
  frames: { t: number; bytes: Uint8Array; mime: string }[];
}

/** § 4.4 table, in this order. Pure: unit-tested. */
export function decideOutcome(out: DossierOut, targetKey: string): { outcome: CheckOutcome; rule: string } {
  if (!out.documentReadable || !out.extractedRole.trim()) return { outcome: "verification", rule: "Document illisible, ou sans rôle écrit : vérification nécessaire." };
  if (out.nameMatchesDeclared === false) return { outcome: "incoherence", rule: "Le document nomme une autre personne que celle déclarée." };
  if (out.matchedCharacterKey && out.matchedCharacterKey !== targetKey) return { outcome: "incoherence", rule: "Le rôle du document correspond à un autre personnage que celui sélectionné." };
  if (out.matchedCharacterKey === targetKey && out.proposedOutcome === "correspondance") return { outcome: "correspondance", rule: "" };
  return { outcome: "verification", rule: "Le rôle ne peut pas être rattaché avec certitude au personnage sélectionné : vérification nécessaire." };
}

export function toFamilyCheck(out: DossierOut, targetKey: string, provider: string, at = new Date()): FamilyCheck {
  const { outcome, rule } = decideOutcome(out, targetKey);
  return {
    outcome,
    extractedPerson: out.extractedPerson.trim() || "Nom non lisible dans le document",
    extractedRole: out.extractedRole.trim() || "Rôle non indiqué dans le document",
    videoFinding: out.videoFinding.trim() || "Aucun élément de la vidéo ne permet de conclure.",
    explanation: [rule, out.explanation.trim()].filter(Boolean).join(" "),
    at: at.toISOString(),
    simulated: false,
    provider,
  };
}

/** When no model could read the document: never a match, a human looks at it. */
export function unavailableCheck(reason: string, input: Pick<DossierInput, "declaredName" | "declaredRole">, at = new Date()): FamilyCheck {
  return {
    outcome: "verification",
    extractedPerson: input.declaredName || "Non lu",
    extractedRole: input.declaredRole || "Non lu",
    videoFinding: "Contrôle automatique indisponible : le document n’a pas été lu par l’IA.",
    explanation: `Vérification nécessaire : ${reason}`,
    at: at.toISOString(),
    simulated: false,
    provider: "aucun modèle disponible",
  };
}

function context(i: DossierInput) {
  return JSON.stringify({
    personne_declaree: i.declaredName,
    role_declare: i.declaredRole,
    personnage_vise: i.targetKey,
    personnages: i.characters.map((c) => ({ cle: c.key, nom: c.name, description: c.description, repliques: c.lines, premieres_repliques: c.firstLines })),
  });
}

export async function checkDossier(input: DossierInput): Promise<{ check: FamilyCheck; notes: string[] }> {
  const notes: string[] = [];
  if (geminiConfigured()) {
    try {
      const parts = [
        inline(input.document.bytes, input.document.mime),
        ...input.frames.flatMap((f) => [{ text: `Image où parle le personnage visé, à ${f.t.toFixed(1).replace(".", ",")} s :` }, inline(f.bytes, f.mime)]),
        { text: context(input) },
      ];
      const g = await geminiJson(DossierOut, PROMPT_DOSSIER, parts);
      return { check: toFamilyCheck(g.data, input.targetKey, g.model), notes };
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (claudeConfigured()) {
    try {
      const frames = input.frames.map((f) => documentBlock(f.bytes, f.mime));
      const c = await claudeJson(DossierOut, PROMPT_DOSSIER, [documentBlock(input.document.bytes, input.document.mime), ...frames, { type: "text", text: context(input) }]);
      return { check: toFamilyCheck(c.data, input.targetKey, c.model), notes };
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { check: unavailableCheck(notes.length ? notes.join(" · ") : "aucun modèle n’est configuré pour lire le document.", input), notes };
}
