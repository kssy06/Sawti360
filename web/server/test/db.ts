/**
 * Integration tests on a real Postgres (never Supabase): each test file gets its own fresh database
 * with docs/backend/schema.sql applied verbatim, plus small stand-ins for what Supabase provides
 * (auth.users, storage.buckets, the anon and authenticated roles).
 *
 * Enabled when TEST_DATABASE_URL points to a server where the user may create databases, e.g.
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
 * Otherwise the database tests are skipped (the pure tests still run).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

const SCHEMA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/backend/schema.sql");

const SUPABASE_STANDINS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
exception when duplicate_object or unique_violation then null; end $$;
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
`;

export interface TestDb {
  sql: Sql;
  name: string;
  drop: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL absent");
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  const name = `sawti_test_${randomBytes(5).toString("hex")}`;
  await admin.unsafe(`create database ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 10, prepare: false, onnotice: () => {} });
  await sql.unsafe(SUPABASE_STANDINS);
  await sql.unsafe(readFileSync(SCHEMA, "utf8"));
  return {
    sql,
    name,
    drop: async () => {
      await sql.end({ timeout: 1 });
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end({ timeout: 1 });
    },
  };
}

/** Inserts an auth user: the on_auth_user_created trigger creates the account and its 100 000 jetons. */
export async function createUser(sql: Sql, email: string, meta: Record<string, string> = {}): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${sql.json(meta)})`;
  return id;
}
