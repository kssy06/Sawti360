/**
 * The translation pass (LLM 1, text), after the listening. Gemini's analysis keeps what needs the
 * audio (the derja, the speakers, the emotions); this pass writes the French from that derja, the
 * whole dialogue at once, with each line's character budget so the dub fits its time on screen.
 * Claude when ANTHROPIC_API_KEY is set (paid API), otherwise Gemini in a second, text-only call
 * (free tier). On any failure the analysis keeps the translation it already had.
 */
import { z } from "zod";
import { FR_CHARS_PER_SECOND } from "../../src/core/catalog.js";
import type { Segment } from "../../src/core/types.js";
import { claudeConfigured, claudeJson } from "./claude.js";
import { geminiConfigured, geminiJson } from "./gemini.js";
import { GLOSSAIRE } from "./prompts.js";

export const PROMPT_TRADUCTION = `Tu es l'adaptateur d'un studio de doublage tunisien. Tu reçois les répliques d'une vidéo en
derja tunisienne (graphie arabe, mots français en lettres latines), dans l'ordre, avec qui parle,
l'émotion entendue et le nombre maximal de caractères que la réplique française peut avoir
pour tenir dans son temps à l'écran (max_caracteres).
Pour chaque réplique, écris la traduction française que le comédien dira :
- français oral et naturel, jamais mot à mot ; garde le sens exact, rien d'ajouté, rien d'inventé ;
- garde TOUS les nombres et montants, les noms propres, et chaque négation (« ma … ch »,
  « mouch » = « ne … pas ») ;
- garde le registre : tutoiement entre proches, vouvoiement de politesse, familier si l'original
  l'est ; un tic de langage (« ya3ni ») ne se traduit pas ;
- lis toute la conversation avant de traduire : une réplique coupée en deux se traduit en deux
  morceaux qui s'enchaînent ;
- respecte max_caracteres : si le sens ne tient pas, garde l'essentiel et dis ce que tu as enlevé
  dans note ;
- une transcription manifestement fautive ou incompréhensible : traduis ce qui est sûr et dis-le
  dans note ; « [inaudible] » : traduction vide.
note : une phrase courte (choix de traduction, doute, ce qui a été raccourci), vide si rien à dire.
Garde EXACTEMENT les identifiants. Utilise le glossaire fourni. Réponds uniquement par un JSON
conforme au schéma.`;

export const TranslationOut = z.object({
  lines: z.array(z.object({ id: z.string(), translation: z.string(), note: z.string() })),
});

/** The most French characters a line can hold: its time on screen plus 0.2 s, at 14 characters a second. */
export const charBudget = (s: Pick<Segment, "start" | "end">) => Math.max(8, Math.floor((s.end - s.start + 0.2) * FR_CHARS_PER_SECOND));

export type Translator = "claude" | "gemini";

/** Who translates: Claude if its key is set, else Gemini (free tier), else nobody. */
export function translator(): Translator | null {
  if (claudeConfigured()) return "claude";
  if (geminiConfigured()) return "gemini";
  return null;
}

export async function translateLines(
  who: Translator,
  segments: Segment[],
  names: Record<string, string>,
  media: { title: string; format: string },
): Promise<{ lines: Map<string, { translation: string; note: string }>; model: string }> {
  const repliques = segments
    .filter((s) => s.source.trim())
    .map((s) => ({ id: s.id, qui: names[s.speaker] ?? s.speaker, emotion: s.emotion ?? "neutre", max_caracteres: charBudget(s), derja: s.source, contexte: s.context ?? "" }));
  const input = JSON.stringify({ titre: media.title, format: media.format, glossaire: GLOSSAIRE, repliques });
  const r = who === "claude" ? await claudeJson(TranslationOut, PROMPT_TRADUCTION, input) : await geminiJson(TranslationOut, PROMPT_TRADUCTION, [{ text: input }]);
  const known = new Set(repliques.map((x) => x.id));
  return { lines: new Map(r.data.lines.filter((l) => known.has(l.id)).map((l) => [l.id, { translation: l.translation.trim(), note: l.note.trim() }])), model: r.model };
}
