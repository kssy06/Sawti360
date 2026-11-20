/**
 * LLM 2 review (IA.md § 4.3): a second model, from another family than Gemini, rereads every line.
 * Chain: Claude (if ANTHROPIC_API_KEY) → Groq's open model → the fidelity rules alone.
 * The rules (checkFidelity: numbers and negations) are merged with the model's verdict: when they flag
 * something the model judged correct, the line is marked « à relire » rather than silently accepted.
 */
import { checkFidelity } from "../../src/core/fidelity.js";
import type { Segment } from "../../src/core/types.js";
import type { Review } from "../../src/mock/simulate.js";
import { claudeConfigured, claudeJson } from "./claude.js";
import { groqConfigured, groqJson } from "./groq.js";
import { GLOSSAIRE, PROMPT_LLM2 } from "./prompts.js";
import { ReviewOut } from "./schemas.js";

export const RULES_PROVIDER = "règles (vérificateur de fidélité)";

type LlmReview = ReviewOut["reviews"][number];

const reviewable = (s: Segment) => Boolean(s.translation.trim()) && !/^\s*\[(inaudible|silence)\]\s*$/i.test(s.source);

/** The fidelity rules alone: numbers swapped back when they can be, negation flagged. Pure. */
export function rulesReview(seg: Pick<Segment, "source" | "translation">): Review {
  const alerts = checkFidelity(seg.source, seg.translation);
  const num = alerts.find((a) => a.type === "CHIFFRES");
  if (num && num.source.length === num.target.length && num.source.length) {
    let t = seg.translation;
    num.target.forEach((n, i) => (t = t.replace(n, num.source[i])));
    return { verdict: "correction", note: num.message, suggestion: t, simulated: false, provider: RULES_PROVIDER };
  }
  if (alerts.length) return { verdict: "correction", note: alerts.map((a) => a.message).join(" "), simulated: false, provider: RULES_PROVIDER };
  return { verdict: "ok", note: "Aucune erreur détectée par les règles. Cela ne garantit pas la fidélité : relisez.", simulated: false, provider: RULES_PROVIDER };
}

/** § 3.4 — the model's verdict, checked by the rules. Pure: unit-tested. */
export function mergeReview(seg: Pick<Segment, "source" | "translation">, llm: LlmReview | undefined, provider: string): Review {
  if (!llm) return rulesReview(seg);
  const alerts = checkFidelity(seg.source, seg.translation);
  const suggestion = llm.suggestion?.trim();
  if (llm.verdict === "correction") {
    return {
      verdict: "correction",
      note: llm.note.trim() || "Correction proposée par le LLM 2.",
      ...(suggestion && suggestion !== seg.translation.trim() ? { suggestion } : {}),
      simulated: false,
      provider,
    };
  }
  if (alerts.length) {
    return {
      verdict: "correction",
      note: `Le vérificateur automatique signale : ${alerts.map((a) => a.message.replace(/\.$/, "")).join(" ; ")} : à relire.${llm.note.trim() ? ` (Sawti Check : ${llm.note.trim()})` : ""}`,
      simulated: false,
      provider,
    };
  }
  return { verdict: "ok", note: llm.note.trim() || "Sens, nombres et négations conservés.", simulated: false, provider };
}

export interface ReviewResult {
  reviews: Record<string, Review>;
  provider: string;
  /** Failures on the way (a fallback was used). */
  notes: string[];
}

/** Reviews the given lines with the first provider that answers; the rules always answer. */
export async function reviewSegments(segments: Segment[]): Promise<ReviewResult> {
  const lines = segments.filter(reviewable);
  const repliques = lines.map((s) => ({
    id: s.id,
    source: s.source,
    translation: s.translation,
    context: s.context ?? "",
    duree: Math.round((s.end - s.start) * 10) / 10,
    alertes: checkFidelity(s.source, s.translation).map((a) => a.message),
  }));
  const user = JSON.stringify({ glossaire: GLOSSAIRE, repliques });
  const notes: string[] = [];
  let llm: { data: ReviewOut; model: string } | null = null;
  if (lines.length && claudeConfigured()) {
    try {
      llm = await claudeJson(ReviewOut, PROMPT_LLM2, user);
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (lines.length && !llm && groqConfigured()) {
    try {
      llm = await groqJson(ReviewOut, PROMPT_LLM2, user);
    } catch (err) {
      notes.push(err instanceof Error ? err.message : String(err));
    }
  }
  const byId = new Map((llm?.data.reviews ?? []).map((r) => [r.id, r]));
  const provider = llm?.model ?? RULES_PROVIDER;
  return {
    reviews: Object.fromEntries(lines.map((s) => [s.id, llm ? mergeReview(s, byId.get(s.id), provider) : rulesReview(s)])),
    provider,
    notes,
  };
}
