/**
 * Claude: second reviewer (LLM 2) of the derja → French translation, and reader of family dossiers
 * when Gemini is unavailable (PDF and photos natively). Optional: used only if ANTHROPIC_API_KEY is set.
 * Its API takes neither audio nor video, so it never does the first translation (that is Gemini's job).
 *
 * Structured output: beta.messages.parse + betaZodOutputFormat → parsed_output validated by zod.
 * Server-side fallback on a policy refusal ("default" routing), except for a Haiku model (no fallback there).
 * A refusal or an unreadable answer becomes a ProviderError: the review chain then falls back to Groq.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env.js";
import { ProviderError } from "./groq.js";

type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

/** What the SDK call looks like (the real client, or a fake in tests). */
export interface ClaudeLike {
  beta: {
    messages: {
      parse(params: Record<string, unknown>): Promise<{ parsed_output?: unknown; stop_reason: string | null; model: string }>;
    };
  };
}

let client: ClaudeLike | null = null;

export function claude(): ClaudeLike {
  if (client) return client;
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new ProviderError("claude", "", "ANTHROPIC_API_KEY absent");
  // 150 s per call and one retry: the whole review must fit in the 300 s of the function.
  client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 150_000 }) as unknown as ClaudeLike;
  return client;
}

export function setClaudeForTests(c: ClaudeLike | null): void {
  client = c;
}

export const claudeConfigured = () => Boolean(client || env().ANTHROPIC_API_KEY);

const isHaiku = (model: string) => model.startsWith("claude-haiku");

/** One structured call: system prompt, user content, JSON validated by zod (parsed_output). */
export async function claudeJson<T>(
  schema: z.ZodType<T>,
  system: string,
  content: string | ContentBlock[],
  opts: { effort?: "low" | "medium" | "high" } = {},
): Promise<{ data: T; model: string }> {
  const model = env().models.claude;
  let res: Awaited<ReturnType<ClaudeLike["beta"]["messages"]["parse"]>>;
  try {
    res = await claude().beta.messages.parse({
      model,
      max_tokens: 16000,
      // Server-side fallback when the model declines: routed by refusal category, no model list to maintain.
      ...(isHaiku(model) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(schema as never) },
      system,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    throw new ProviderError("claude", model, `Claude : ${err instanceof Error ? err.message : String(err)}`, status);
  }
  if (res.stop_reason === "refusal") throw new ProviderError("claude", model, "Claude a décliné la demande (refus de sécurité).");
  if (res.stop_reason === "max_tokens") throw new ProviderError("claude", model, "Réponse de Claude tronquée (limite de longueur).");
  if (res.parsed_output === null || res.parsed_output === undefined) throw new ProviderError("claude", model, "Réponse de Claude illisible.");
  // res.model is the model that really answered (a server-side fallback may have taken over).
  return { data: res.parsed_output as T, model: res.model || model };
}

/** A document for Claude's native reading (dossier fallback): PDF or photo, base64. */
export function documentBlock(bytes: Uint8Array, mime: string): ContentBlock {
  const data = Buffer.from(bytes).toString("base64");
  if (mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  return { type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp", data } };
}
