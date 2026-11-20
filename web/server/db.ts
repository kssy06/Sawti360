/**
 * Postgres connection through Supabase's « Session pooler » (port 5432), which behaves like a direct
 * connection. Not the « Transaction pooler » (6543): several queries sent at once on this connection
 * (GET /api/bootstrap) left the page waiting forever there (seen on 20 November).
 * The browser never reads the tables: RLS is on without any policy, only this server connects.
 *
 * Rule for transactions: inside `sql.begin(async (tx) => …)` use `tx` only. With `max: 1`,
 * a query on the outer `sql` would wait for the connection the transaction holds.
 */
import postgres, { type Sql } from "postgres";
import { env } from "./env.js";
import { notConfigured } from "./errors.js";

let client: Sql | null = null;

export function db(): Sql {
  if (client) return client;
  const url = env().DATABASE_URL;
  if (!url) throw notConfigured("La base de données (DATABASE_URL)");
  client = postgres(url, {
    prepare: false, // harmless in session mode, and still safe if a transaction pooler is ever used
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return client;
}

/** Tests only: use another connection (a local Postgres), or forget it. */
export function setDbForTests(sql: Sql | null): void {
  client = sql;
}

/** Wraps a value for a jsonb column (works on the pool and inside a transaction). */
export const jsonb = (sql: Pick<Sql, "json">, value: unknown) => sql.json(value as postgres.JSONValue);
