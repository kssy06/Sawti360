/**
 * npm run seed  (= tsx --env-file=.env.local scripts/seed.ts)
 *
 * Creates (or updates) the two demo accounts in Supabase Auth with DEMO_PASSWORD, then writes the
 * example data of the simulated demo into the base (scripts/lib/seed-db.ts). Run it once after
 * applying schema.sql, and again whenever the demo accounts must be reset (before the demo).
 * Needs: SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, DEMO_EMAILS, DEMO_PASSWORD.
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { DEMO_ACCOUNTS } from "../src/mock/registry";
import { parseDemoEmails } from "../server/env";
import { seedDatabase } from "./lib/seed-db";

function need(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`Variable manquante : ${name} (voir docs/backend/SETUP.md § 5).`);
    process.exit(1);
  }
  return value;
}

const url = need("SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL);
const secret = need("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
const dbUrl = need("DATABASE_URL", process.env.DATABASE_URL);
const password = need("DEMO_PASSWORD", process.env.DEMO_PASSWORD);
const emails = parseDemoEmails(process.env.DEMO_EMAILS);
const nourEmail = need("DEMO_EMAILS (nour=…)", emails.nour);
const linaEmail = need("DEMO_EMAILS (lina=…)", emails.lina);
if (password.length < 8) {
  console.error("DEMO_PASSWORD : 8 caractères au minimum.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });

async function ensureUser(key: "nour" | "lina", email: string): Promise<string> {
  const demo = DEMO_ACCOUNTS.find((a) => a.id === key)!;
  const meta = { name: demo.name, org: demo.org };
  const [found] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email.toLowerCase()} limit 1`;
  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: meta });
    if (error) throw new Error(`Mise à jour de ${email} : ${error.message}`);
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (error || !data.user) throw new Error(`Création de ${email} : ${error?.message ?? "réponse vide"}`);
  return data.user.id;
}

try {
  const nour = await ensureUser("nour", nourEmail);
  const lina = await ensureUser("lina", linaEmail);
  const summary = await seedDatabase(sql, { nour, lina });
  console.log(`Comptes de démonstration : Nour Films <${nourEmail}>, Lina M. <${linaEmail}>`);
  console.table(summary);
} catch (err) {
  console.error("Échec du remplissage :", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
