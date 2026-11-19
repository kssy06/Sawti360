/**
 * Errors of the API, always JSON: { error: "CODE", message: "Phrase en français pour l'interface." }.
 * Codes and statuses are listed in docs/backend/API.md § 1.
 */
import type { Context } from "hono";
import { z } from "zod";
import { fr } from "zod/locales";

z.config(fr());

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Extra fields merged into the JSON body (e.g. { decision } for a refusal of the rules engine). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string) => new ApiError(400, "REQUETE_INVALIDE", message);
export const unauthorized = (message = "Connexion requise.") => new ApiError(401, "NON_CONNECTE", message);
export const forbidden = (message = "Ce contenu n’appartient pas à votre compte.") => new ApiError(403, "INTERDIT", message);
export const notFound = (message = "Ressource introuvable.") => new ApiError(404, "INTROUVABLE", message);
export const conflict = (code: "DEJA_DECIDE" | "EN_COURS" | "CONFLIT", message: string) => new ApiError(409, code, message);
export const notConfigured = (what: string) =>
  new ApiError(503, "NON_CONFIGURE", `${what} n’est pas configuré sur ce déploiement.`);

export function errorBody(err: ApiError): Record<string, unknown> {
  return { error: err.code, message: err.message, ...err.extra };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** One readable French sentence from a zod error (first issue, with the field path). */
export function describeIssues(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Requête invalide.";
  const path = issue.path.map(String).join(".");
  return path ? `Requête invalide : « ${path} » ${issue.message}` : `Requête invalide : ${issue.message}`;
}

/** Parses the JSON body with a zod schema; 400 REQUETE_INVALIDE otherwise. */
export async function readBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const textBody = await c.req.text();
    raw = textBody ? JSON.parse(textBody) : {};
  } catch {
    throw badRequest("Corps JSON attendu.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest(describeIssues(parsed.error));
  return parsed.data;
}

/** Same for query strings. */
export function readQuery<T>(c: Context, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw badRequest(describeIssues(parsed.error));
  return parsed.data;
}
