/**
 * MOCK PROCESSING LAYER — every function here stands in for a model or a server that is not wired yet.
 * Results are labelled « Simulé » in the interface. Nothing here claims a real verification.
 */
import { checkFidelity } from "../core/fidelity.js";
import type { Segment } from "../core/types";
import { keywords, type Character, type FamilyCheck, type FamilyDossier } from "../state/workflow.js";

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ analysis (Écran 04) */

export const ANALYSIS_STEPS = [
  { key: "audio", label: "Importation et extraction audio", detail: "Lecture du fichier dans votre navigateur, extraction de la piste audio." },
  { key: "speakers", label: "Détection des intervenants et segmentation", detail: "Repérage des prises de parole et de leurs positions dans la vidéo." },
  { key: "names", label: "Proposition de noms et de descriptions", detail: "L’IA propose un identifiant et une description pour chaque intervenant." },
  { key: "assoc", label: "Association des voix aux personnages", detail: "Chaque prise de parole est rattachée à un personnage proposé." },
  { key: "checks", label: "Vérification des autorisations et licences", detail: "Recherche d’un Passeport de voix correspondant. La détection ne prouve pas l’identité." },
] as const;

/* ------------------------------------------------------------------ LLM 2 review (Écran 10) */

export interface Review {
  verdict: "ok" | "correction";
  note: string;
  suggestion?: string;
  /** false when a real model (or the fidelity rules) produced it, with its name in `provider`. */
  simulated: boolean;
  provider?: string;
}

/** Prepared second-model reviews for the example clips, keyed by derja source. */
const PREPARED: Record<string, Omit<Review, "simulated">> = {
  "خلّصت فيه 300 دينار، موش شوية!": {
    verdict: "correction",
    note: "Le montant de la source (300) n’est pas celui de la traduction (30).",
    suggestion: "Je l’ai payé 300 dinars, ce n’est pas rien !",
  },
  "ما نخليهمش يسكتونا.": {
    verdict: "correction",
    note: "La négation de la source (« ma … ch ») a disparu : le sens est inversé.",
    suggestion: "Je ne les laisserai pas nous faire taire.",
  },
  "ما عنديش وقت، نستناك قدام الدار.": {
    verdict: "ok",
    note: "Sens et registre conservés. Négation présente.",
  },
  "الدنيا تبدّلت برشا، أما القلب ما تبدّلش.": {
    verdict: "correction",
    note: "Phrase longue pour la durée à l’écran ; une formulation plus courte garde le sens.",
    suggestion: "Le monde a beaucoup changé, pas le cœur.",
  },
};

/** Review of one line: prepared example if any, otherwise derived from the real fidelity rules. */
export function reviewSegment(seg: Pick<Segment, "source" | "translation">): Review {
  const prepared = PREPARED[seg.source];
  if (prepared) return { ...prepared, simulated: true };
  const alerts = checkFidelity(seg.source, seg.translation);
  const num = alerts.find((a) => a.type === "CHIFFRES");
  if (num && num.source.length === num.target.length && num.source.length) {
    let t = seg.translation;
    num.target.forEach((n, i) => (t = t.replace(n, num.source[i])));
    return { verdict: "correction", note: num.message, suggestion: t, simulated: true };
  }
  if (alerts.length) return { verdict: "correction", note: alerts[0].message, simulated: true };
  return { verdict: "ok", note: "Aucune erreur détectée. Cela ne garantit pas la fidélité : relisez.", simulated: true };
}

/* ------------------------------------------------------------------ family dossier check (Écran 06) */

/**
 * Stand-in for the AI that reads the family document and compares the declared role with the video.
 * Here the comparison is a transparent keyword overlap between the declared role and the confirmed
 * character sheets. It never assesses signatures, family ties or the legal standing of signatories.
 */
export function simulateFamilyCheck(dossier: FamilyDossier, target: Character, others: Character[], lines: number, firstAt: string): FamilyCheck {
  const role = keywords(dossier.declaredRole);
  const own = new Set(keywords(`${target.name} ${target.description}`));
  const hitsOwn = role.filter((w) => own.has(w));
  const other = others.find((o) => {
    const k = new Set(keywords(`${o.name} ${o.description}`));
    return role.some((w) => k.has(w));
  });
  const at = new Date().toISOString();
  const base = {
    extractedPerson: dossier.deceasedName || "Nom non lisible dans le document",
    extractedRole: dossier.declaredRole,
    at,
    simulated: true as const,
  };
  if (hitsOwn.length && !(other && role.filter((w) => new Set(keywords(`${other.name} ${other.description}`)).has(w)).length > hitsOwn.length)) {
    return {
      ...base,
      outcome: "correspondance",
      videoFinding: `« ${target.name} » prend la parole dans ${lines} réplique${lines > 1 ? "s" : ""}, dès ${firstAt}.`,
      explanation: `Le rôle déclaré dans le document correspond à la fiche du personnage confirmé « ${target.name} ».`,
    };
  }
  if (other) {
    return {
      ...base,
      outcome: "incoherence",
      videoFinding: `Le rôle déclaré correspond plutôt à l’intervenant « ${other.name} ».`,
      explanation: `Le document attribue à la personne un rôle qui ne correspond pas au personnage « ${target.name} » sélectionné.`,
    };
  }
  return {
    ...base,
    outcome: "verification",
    videoFinding: `Aucun élément de la vidéo ne permet de rattacher clairement ce rôle à « ${target.name} ».`,
    explanation: "Le rôle déclaré est trop général ou absent des fiches des personnages. Une vérification complémentaire est nécessaire.",
  };
}

/* ------------------------------------------------------------------ generation (Écran 12) */

export const GEN_STAGES = [
  { key: "synth", label: "Génération des voix françaises", detail: "Moteur de règles, puis synthèse de chaque réplique approuvée.", real: true },
  { key: "timing", label: "Respect des moments d’apparition", detail: "Chaque réplique est placée à son horodatage.", real: false, ms: 1500 },
  { key: "rythme", label: "Adaptation de la durée et du rythme", detail: "Ajustement de la durée à la place disponible à l’écran.", real: false, ms: 1700 },
  { key: "lips", label: "Synchronisation labiale", detail: "Alignement des voix sur le mouvement des lèvres.", real: false, ms: 2200 },
  { key: "mix", label: "Intégration audio / vidéo", detail: "Mixage des voix avec la musique et l’ambiance.", real: false, ms: 1500 },
  { key: "transp", label: "Éléments de transparence", detail: "Label IA et QR code selon le format, création du Passeport 360°.", real: false, ms: 1200 },
  { key: "export", label: "Export MP4", detail: "Assemblage du fichier final.", real: false, ms: 1400 },
] as const;
