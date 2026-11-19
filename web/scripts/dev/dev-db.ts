/**
 * DEVELOPMENT ONLY — prepares a local Postgres database for trying the back-end mode without
 * Supabase: schema.sql applied verbatim, plus stand-ins of auth.users and storage.buckets.
 *
 *   ADMIN_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npx tsx scripts/dev/dev-db.ts sawti_dev
 *
 * Drops and recreates the named database. Then start scripts/dev/fake-supabase.ts and run
 * `npm run seed` with the local values (see docs/backend/SETUP.md § 7).
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { SCHEMA, SUPABASE_STANDINS } from "../../server/test/db";

const admin = process.env.ADMIN_DATABASE_URL;
const name = process.argv[2] ?? "sawti_dev";
if (!admin || !/^[a-z_][a-z0-9_]*$/.test(name)) {
  console.error("Usage : ADMIN_DATABASE_URL=postgres://… npx tsx scripts/dev/dev-db.ts <nom_de_base>");
  process.exit(1);
}
const root = postgres(admin, { max: 1, onnotice: () => {} });
await root.unsafe(`drop database if exists ${name} with (force)`);
await root.unsafe(`create database ${name}`);
await root.end();
const url = new URL(admin);
url.pathname = `/${name}`;
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
await sql.unsafe(SUPABASE_STANDINS);
await sql.unsafe(readFileSync(SCHEMA, "utf8"));
await sql.end();
console.log(`Base ${name} prête : ${url.toString().replace(/:[^:@/]+@/, ":***@")}`);
