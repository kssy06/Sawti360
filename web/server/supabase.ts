/**
 * Supabase admin client (secret key): token verification, demo sessions, signed storage URLs.
 * Server only. The browser has its own client with the publishable key (src/lib/supabase.ts).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { notConfigured } from "./errors.js";

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const e = env();
  if (!e.supabaseUrl || !e.SUPABASE_SECRET_KEY) throw notConfigured("Supabase (SUPABASE_URL, SUPABASE_SECRET_KEY)");
  admin = createClient(e.supabaseUrl, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}

/** Tests only. */
export function setSupabaseForTests(client: SupabaseClient | null): void {
  admin = client;
}
