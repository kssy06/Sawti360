/**
 * Calls to /api from the browser (back-end mode only): adds the Supabase access token,
 * turns { error, message } answers into ApiCallError with a French message for the interface.
 */
import { accessToken } from "../lib/supabase";

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when the server answers 401 to a signed-in request (session expired elsewhere). */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export interface CallOptions {
  /** Skip the access token (public pages). */
  anonymous?: boolean;
  /** Expect a binary answer (audio). */
  blob?: boolean;
}

export async function request<T>(method: string, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = opts.anonymous ? null : await accessToken().catch(() => null);
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiCallError(0, "RESEAU", "Serveur injoignable : vérifiez votre connexion puis réessayez.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const b = type.includes("json") ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
    if (res.status === 401 && token) onUnauthorized?.();
    const message = typeof b.message === "string" ? b.message : res.status >= 500 ? "Le serveur a rencontré une erreur. Réessayez." : `Erreur ${res.status}`;
    throw new ApiCallError(res.status, typeof b.error === "string" ? b.error : "ERREUR", message, b);
  }
  if (res.status === 204) return undefined as T;
  if (opts.blob) return (await res.blob()) as T;
  return (type.includes("json") ? await res.json() : await res.text()) as T;
}

export const api = {
  get: <T>(path: string, opts?: CallOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) => request<T>("POST", path, body ?? {}, opts),
  patch: <T>(path: string, body: unknown, opts?: CallOptions) => request<T>("PATCH", path, body, opts),
  del: <T>(path: string, opts?: CallOptions) => request<T>("DELETE", path, undefined, opts),
};

/** French message for any error thrown by a remote action. */
export function messageOf(err: unknown): string {
  if (err instanceof ApiCallError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Erreur inattendue. Réessayez.";
}
