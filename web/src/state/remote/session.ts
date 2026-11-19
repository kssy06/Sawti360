/**
 * Back-end versions of login, signup, logout (Supabase Auth) and of the start-up session restore.
 * Demo accounts: POST /api/demo/session returns a one-time token, the browser exchanges it with
 * verifyOtp — no password in the browser's code.
 */
import { api, setUnauthorizedHandler } from "../../api/client";
import { supabase } from "../../lib/supabase";
import { bootstrap } from "./bootstrap";
import { emptyData, type Get, type Set } from "./state";

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  user_already_exists: "Un compte existe déjà avec cette adresse.",
  email_exists: "Un compte existe déjà avec cette adresse.",
  email_not_confirmed: "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.",
  weak_password: "Mot de passe trop faible : 8 caractères au minimum.",
  over_email_send_rate_limit: "Trop d’e-mails demandés : réessayez dans quelques minutes.",
  over_request_rate_limit: "Trop de tentatives : réessayez dans une minute.",
  otp_expired: "Lien expiré : demandez-en un nouveau.",
  same_password: "Le nouveau mot de passe doit être différent de l’ancien.",
};

export function authMessage(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "Erreur inattendue du service de connexion.";
  if (err.code && AUTH_MESSAGES[err.code]) return AUTH_MESSAGES[err.code];
  if (/invalid login credentials/i.test(err.message ?? "")) return AUTH_MESSAGES.invalid_credentials;
  if (/already registered/i.test(err.message ?? "")) return AUTH_MESSAGES.user_already_exists;
  return `Le service de connexion a refusé la demande${err.message ? ` : ${err.message}` : "."}`;
}

/** Fills the store for the signed-in account. */
export const hydrate = (set: Set, get: Get) => bootstrap(set, get);

function signedOut(set: Set): void {
  set({ ...emptyData(), server: { status: "ready" } });
}

let listening = false;

/** At start-up: restore the Supabase session (if any), then hydrate; follow sign-outs from other tabs. */
export async function restore(set: Set, get: Get): Promise<void> {
  try {
    const sb = await supabase();
    if (!listening) {
      listening = true;
      sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") signedOut(set);
      });
      setUnauthorizedHandler(() => void sb.auth.signOut({ scope: "local" }));
    }
    const { data } = await sb.auth.getSession();
    if (data.session) await hydrate(set, get);
    else set({ server: { status: "ready" } });
  } catch (err) {
    set({ server: { status: "ready", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function signIn(set: Set, get: Get, email: string, password: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(authMessage(error));
  await hydrate(set, get);
}

/** Demo buttons and the account menu: `key` is a demo key ("nour", "lina"), or the current account. */
export async function demoLogin(set: Set, get: Get, key: string): Promise<void> {
  if (get().session?.accountId === key) return;
  const { token_hash } = await api.post<{ token_hash: string; email: string }>("/demo/session", { account: key }, { anonymous: true });
  const sb = await supabase();
  await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { error } = await sb.auth.verifyOtp({ token_hash, type: "magiclink" });
  if (error) throw new Error(authMessage(error));
  await hydrate(set, get);
}

/** Returns "ok" when signed in, "confirm" when Supabase asks to confirm the address first. */
export async function signUp(set: Set, get: Get, name: string, email: string, password: string): Promise<"ok" | "confirm"> {
  const sb = await supabase();
  const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name: name.trim(), org: "" } } });
  if (error) throw new Error(authMessage(error));
  if (!data.session) return "confirm";
  await hydrate(set, get);
  return "ok";
}

export async function logout(set: Set): Promise<void> {
  const sb = await supabase();
  await sb.auth.signOut().catch(() => undefined);
  signedOut(set);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${location.origin}/mot-de-passe-oublie` });
  if (error) throw new Error(authMessage(error));
}

export async function updatePassword(set: Set, get: Get, password: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(authMessage(error));
  await hydrate(set, get);
}
