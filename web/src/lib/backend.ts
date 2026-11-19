/**
 * Which mode the interface runs in.
 * VITE_BACKEND=1 (with the Supabase URL and publishable key) → the real back-end (/api, Supabase).
 * Anything else → the fully simulated demo, exactly as before the back-end (src/mock/).
 * VITE_* values are public by nature: no secret here.
 */
type ViteEnv = Record<string, string | undefined>;
const vite: ViteEnv = (import.meta as unknown as { env?: ViteEnv }).env ?? {};

export const SUPABASE_URL = vite.VITE_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = vite.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Public key of the platform (Ed25519, hex) for passports and licences signed by the server. */
export const SAWTI_PUBLIC_KEY = vite.VITE_SAWTI_PUBLIC_KEY ?? "";

export const BACKEND = vite.VITE_BACKEND === "1" && Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Captured before Supabase reads (and clears) the URL hash of a password-recovery link. */
export const RECOVERY_LINK = typeof location !== "undefined" && /type=recovery/.test(location.hash);
