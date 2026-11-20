/**
 * IA.md § 4.5: a shorter French version of a line too long for its place on screen. It is only a
 * suggestion of the LLM 2 (reviews[segId].suggestion), never applied without the creator's approval.
 * Claude, then Groq; without a language model, nothing is proposed (the line is still flagged).
 */
import { claudeConfigured, claudeJson } from "./claude.js";
import { groqConfigured, groqJson } from "./groq.js";
import { promptShorten } from "./prompts.js";
import { ShortenOut } from "./schemas.js";

export async function shorterLine(text: string, max: number): Promise<{ translation: string; model: string } | null> {
  const user = JSON.stringify({ traduction: text, max });
  const tries: [boolean, () => Promise<{ data: { translation: string }; model: string }>][] = [
    [claudeConfigured(), () => claudeJson(ShortenOut, promptShorten(max), user)],
    [groqConfigured(), () => groqJson(ShortenOut, promptShorten(max), user)],
  ];
  for (const [configured, call] of tries) {
    if (!configured) continue;
    try {
      const { data, model } = await call();
      const t = data.translation.trim();
      if (t && [...t].length < [...text].length) return { translation: t, model };
    } catch {
      /* next model */
    }
  }
  return null;
}
