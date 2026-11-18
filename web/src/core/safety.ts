import type { Theme } from "./types";

/**
 * Two layers, both checked before any synthesis (in the browser for instant feedback,
 * and again by the server function, which is the one that cannot be bypassed):
 *  1. Red lines no voice may ever say, whatever its owner allows.
 *  2. Themes each owner forbids for their own voice in their Voice Passport.
 * Keyword lists are a deterministic V1 (French + Tunisian derja, Arabic script and Arabizi).
 * A match blocks; no match is not a proof of harmlessness.
 */

export type RedLine = "haine" | "mineurs" | "usurpation" | "arnaque";

export const RED_LINES: Record<RedLine, { label: string; why: string }> = {
  haine: { label: "Discours de haine", why: "insultes visant une origine, une religion ou une couleur de peau" },
  mineurs: { label: "Mineurs et sexualité", why: "contenu sexuel impliquant des mineurs" },
  usurpation: { label: "Usurpation d’identité", why: "se faire passer pour une autorité ou une personnalité réelle" },
  arnaque: { label: "Arnaque", why: "demande de codes, mots de passe ou virements" },
};

export const THEMES: Record<Theme, { label: string; hint: string }> = {
  politique: { label: "Politique", hint: "élections, partis, gouvernement" },
  religion: { label: "Religion", hint: "prières, figures religieuses" },
  publicite: { label: "Publicité", hint: "promotions, appels à acheter" },
  violence: { label: "Violence", hint: "armes, menaces, sang" },
  grossierete: { label: "Grossièretés", hint: "jurons et insultes" },
  intime: { label: "Contenu intime", hint: "sexualité, scènes intimes" },
  alcool_paris: { label: "Alcool et paris", hint: "boissons alcoolisées, jeux d’argent" },
};

const RED_LINE_WORDS: Record<RedLine, string[]> = {
  haine: ["sale arabe", "sale juif", "sale noir", "sale negre", "negre", "bougnoule", "youpin", "race inferieure", "kahlouch", "oussif", "كحلوش", "وصيف"],
  mineurs: [],
  usurpation: ["je suis le president", "en tant que ministre", "au nom du gouvernement", "communique officiel de la presidence", "ana el rais", "انا الرئيس", "انا الوزير"],
  arnaque: ["code de verification", "code secret", "mot de passe", "numero de carte", "virement urgent", "envoie moi ton code", "envoie-moi ton code", "ابعثلي الكود"],
};

const MINORS = /\b(enfant|enfants|mineur|mineure|mineurs|fillette|petit garcon|ado de \d+ ans)\b/;
const SEXUAL = /\b(sexe|sexuel|sexuelle|nu|nue|nus|porno|erotique|coucher avec)\b/;

const THEME_WORDS: Record<Theme, string[]> = {
  politique: ["election", "elections", "votez", "vote", "parti", "president", "gouvernement", "ministre", "depute", "parlement", "manifestation", "انتخابات", "حزب", "حكومة", "hkouma"],
  religion: ["dieu", "allah", "prophete", "priere", "mosquee", "eglise", "coran", "bible", "imam", "الله", "جامع", "صلاة"],
  publicite: ["achetez", "promo", "promotion", "reduction", "offre speciale", "code promo", "abonnez-vous", "commandez", "soldes"],
  violence: ["tuer", "tue", "sang", "arme", "pistolet", "couteau", "frapper", "massacre", "bombe", "نقتلك", "nektlek"],
  grossierete: ["merde", "putain", "con", "connard", "connasse", "salaud", "batard", "zebi", "nikomek", "يلعن"],
  intime: ["sexe", "sexuel", "sexuelle", "porno", "erotique", "coucher avec", "nue"],
  alcool_paris: ["alcool", "biere", "vin", "whisky", "boukha", "pari", "paris sportifs", "casino", "jeu d'argent", "كحول", "بيرة"],
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWord(normalized: string, words: string[]): string | null {
  for (const raw of words) {
    const w = normalize(raw);
    const isArabic = /[؀-ۿ]/.test(w);
    const re = isArabic
      ? new RegExp(`(^|[^\\u0600-\\u06ff])${escape(w)}($|[^\\u0600-\\u06ff])`)
      : new RegExp(`(^|[^a-z0-9])${escape(w)}($|[^a-z0-9])`);
    if (re.test(normalized)) return raw;
  }
  return null;
}

export type SafetyResult =
  | { ok: true }
  | { ok: false; layer: "red_line"; category: RedLine; label: string; matched: string }
  | { ok: false; layer: "owner_theme"; category: Theme; label: string; matched: string };

export function checkText(text: string, forbiddenThemes: Theme[] = []): SafetyResult {
  const n = normalize(text);
  if (MINORS.test(n) && SEXUAL.test(n)) {
    return { ok: false, layer: "red_line", category: "mineurs", label: RED_LINES.mineurs.label, matched: "mineurs + sexualité" };
  }
  for (const cat of Object.keys(RED_LINE_WORDS) as RedLine[]) {
    const m = findWord(n, RED_LINE_WORDS[cat]);
    if (m) return { ok: false, layer: "red_line", category: cat, label: RED_LINES[cat].label, matched: m };
  }
  for (const theme of forbiddenThemes) {
    const m = findWord(n, THEME_WORDS[theme]);
    if (m) return { ok: false, layer: "owner_theme", category: theme, label: THEMES[theme].label, matched: m };
  }
  return { ok: true };
}
