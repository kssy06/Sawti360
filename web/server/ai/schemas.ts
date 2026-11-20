/**
 * Output schemas of the AI tasks (docs/backend/IA.md § 4). `.nullable()` rather than `.optional()`:
 * better accepted by the structured outputs of Gemini, Claude and Groq.
 */
import { z } from "zod";
import { EMOTION_KEYS } from "../../src/core/emotion.js";

export const Speaker = z.object({
  key: z.string(),
  proposedName: z.string(),
  nameEvidence: z.string(),
  proposedDescription: z.string(),
  gender: z.enum(["femme", "homme", "inconnu"]),
});

export const AnalysisSegment = z.object({
  id: z.string(),
  speaker: z.string(),
  source: z.string(),
  certainty: z.number(),
  translation: z.string(),
  context: z.string(),
  /** The feeling heard in the original voice (absent or null: neutral). */
  emotion: z.enum(EMOTION_KEYS).nullish(),
});

/** § 4.2 */
export const AnalysisOut = z.object({
  speakers: z.array(Speaker),
  segments: z.array(AnalysisSegment),
});
export type AnalysisOut = z.infer<typeof AnalysisOut>;

/** § 4.6 — Gemini alone: it also gives the times. */
export const AnalysisOutTimed = z.object({
  speakers: z.array(Speaker),
  segments: z.array(AnalysisSegment.omit({ id: true }).extend({ start: z.number(), end: z.number() })),
});
export type AnalysisOutTimed = z.infer<typeof AnalysisOutTimed>;

/** § 4.3 */
export const ReviewOut = z.object({
  reviews: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["ok", "correction"]),
      note: z.string(),
      suggestion: z.string().nullable(),
    }),
  ),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

/** § 4.4 */
export const DossierOut = z.object({
  documentReadable: z.boolean(),
  extractedPerson: z.string(),
  extractedRole: z.string(),
  nameMatchesDeclared: z.boolean().nullable(),
  matchedCharacterKey: z.string().nullable(),
  proposedOutcome: z.enum(["correspondance", "incoherence", "verification"]),
  videoFinding: z.string(),
  explanation: z.string(),
});
export type DossierOut = z.infer<typeof DossierOut>;

/** § 4.5 */
export const ShortenOut = z.object({ translation: z.string() });

/** JSON Schema for the providers' structured outputs (without the $schema key some reject). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Parses a model's JSON answer, tolerating a ```json fence around it. */
export function parseModelJson<T>(schema: z.ZodType<T>, text: string | null | undefined): T {
  const raw = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return schema.parse(JSON.parse(raw || "{}"));
}
