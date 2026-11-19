/**
 * Projects in the base: reading (composed with consents and dossiers), ownership checks,
 * and updates under a row lock (two tabs editing the same project never lose each other's change).
 */
import type { Sql, TransactionSql } from "postgres";
import type { Project } from "../src/state/store.js";
import type { AuthUser } from "./auth.js";
import type { Db } from "./audit.js";
import { projectOut, stripAuthorizations, type ConsentRow, type DossierRow, type ProjectRow } from "./compose.js";
import { forbidden, notFound } from "./errors.js";

/** Columns a route may write; JSON ones are wrapped for jsonb. */
const COLUMNS = {
  title: false,
  subtitle: false,
  format: false,
  use_case: false,
  video: true,
  pipeline: true,
  segments: true,
  speakers: true,
  characters: true,
  speaker_voices: true,
  proposals: true,
  reviews: true,
  gens: true,
  generation: true,
  audio_hash: false,
} as const;

export type ProjectPatch = Partial<Pick<ProjectRow, keyof typeof COLUMNS>>;

export async function updateProject(tx: Db, id: string, patch: ProjectPatch): Promise<void> {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !(k in COLUMNS)) continue;
    const json = COLUMNS[k as keyof typeof COLUMNS];
    values[k] = json ? (tx as Sql).json((k === "characters" ? stripAuthorizations(v as ProjectRow["characters"]) : v) as never) : v;
  }
  if (!Object.keys(values).length) return;
  await (tx as Sql)`update public.projects set ${(tx as Sql)(values as Record<string, never>)} where id = ${id}`;
}

export async function composeRows(sql: Db, rows: ProjectRow[]): Promise<Project[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [consents, dossiers] = await Promise.all([
    (sql as Sql)<ConsentRow[]>`select * from public.consents where project_id = any(${ids}::text[])`,
    (sql as Sql)<DossierRow[]>`select * from public.dossiers where project_id = any(${ids}::text[])`,
  ]);
  return rows.map((r) => projectOut(r, consents, dossiers));
}

export async function readProject(sql: Db, id: string): Promise<Project> {
  const [row] = await (sql as Sql)<ProjectRow[]>`select * from public.projects where id = ${id}`;
  if (!row) throw notFound("Projet introuvable.");
  return (await composeRows(sql, [row]))[0];
}

export async function projectsOf(sql: Db, accountId: string): Promise<Project[]> {
  const rows = await (sql as Sql)<ProjectRow[]>`select * from public.projects where account_id = ${accountId} order by updated_at desc`;
  return composeRows(sql, rows);
}

/** The project, if it belongs to the connected account (404 unknown, 403 someone else's). */
export async function ownedProject(sql: Db, user: AuthUser, id: string, lock = false): Promise<ProjectRow> {
  const rows = lock
    ? await (sql as Sql)<ProjectRow[]>`select * from public.projects where id = ${id} for update`
    : await (sql as Sql)<ProjectRow[]>`select * from public.projects where id = ${id}`;
  const row = rows[0];
  if (!row) throw notFound("Projet introuvable.");
  if (row.account_id !== user.id) throw forbidden();
  return row;
}

/** Runs `fn` in a transaction with the project row locked, then returns the composed project. */
export async function mutateProject(
  sql: Sql,
  user: AuthUser,
  id: string,
  fn: (tx: TransactionSql, row: ProjectRow) => Promise<void>,
): Promise<Project> {
  return (await sql.begin(async (tx) => {
    const row = await ownedProject(tx, user, id, true);
    await fn(tx, row);
    return readProject(tx, id);
  })) as Project;
}
