/**
 * Browser Supabase client (publishable key): sign-in, sessions, uploads through signed URLs.
 * It never reads the tables (RLS without policies): data goes through /api.
 * Loaded on demand, so the simulated demo does not download it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./backend";

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "sawti360-auth" },
    }),
  );
  return client;
}

/** Access token of the current session, or null. */
export async function accessToken(): Promise<string | null> {
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}
