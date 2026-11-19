/**
 * Long tasks (analysis, LLM 2 review, dossier check, voice-sample check, generation).
 * The route answers 202 { jobId } at once; the work continues after the response (waitUntil,
 * 300 s at most on Vercel) and writes its progress to the `jobs` table; the browser polls
 * GET /api/jobs/:id every 1.5 s. A task silent for more than 300 s is read as failed and can be rerun.
 */
import { waitUntil } from "@vercel/functions";
import type { Sql } from "postgres";
import type { Db } from "./audit.js";
import { conflict, forbidden, notFound } from "./errors.js";

export type JobKind = "analysis" | "review" | "dossier_check" | "voice_check" | "generation";
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  step: number;
  detail?: string;
  result?: unknown;
  error?: string;
  providers?: Record<string, string>;
  projectId?: string;
}

interface JobRow {
  id: string;
  account_id: string | null;
  project_id: string | null;
  kind: JobKind;
  status: JobStatus;
  step: number;
  detail: string | null;
  result: unknown;
  error: string | null;
  providers: Record<string, string> | null;
  updated_at: Date;
}

export const STALE_MS = 300_000;
export const STALE_MESSAGE = "Tâche interrompue (plus de 300 s sans nouvelles) : relancez-la.";

export function jobOut(r: JobRow): Job {
  const out: Job = { id: r.id, kind: r.kind, status: r.status, step: r.step };
  if (r.detail) out.detail = r.detail;
  if (r.result !== null && r.result !== undefined) out.result = r.result;
  if (r.error) out.error = r.error;
  if (r.providers) out.providers = r.providers;
  if (r.project_id) out.projectId = r.project_id;
  return out;
}

export const isStale = (r: Pick<JobRow, "status" | "updated_at">, now = Date.now()) =>
  (r.status === "queued" || r.status === "running") && now - new Date(r.updated_at).getTime() > STALE_MS;

/** Background work: waitUntil on Vercel; in tests, a collector the test can await. */
type Background = (p: Promise<unknown>) => void;
const vercelBackground: Background = (p) => {
  try {
    waitUntil(p);
  } catch {
    /* outside Vercel the promise simply keeps running */
  }
};
let background: Background = vercelBackground;
export function setBackgroundForTests(fn: Background | null): void {
  background = fn ?? vercelBackground;
}

export interface JobContext {
  id: string;
  /** Moves to step n (index in ANALYSIS_STEPS / GEN_STAGES) with a sentence for the interface. */
  step(n: number, detail?: string): Promise<void>;
  /** Models really used, shown as « Réel · <model> ». */
  providers: Record<string, string>;
}

/** Reads a job; a stale one is marked failed the first time it is seen. */
export async function readJob(sql: Db, id: string): Promise<JobRow | null> {
  const q = sql as Sql;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await q<JobRow[]>`select * from public.jobs where id = ${id}`;
  if (!row) return null;
  if (isStale(row)) {
    const [failed] = await q<JobRow[]>`
      update public.jobs set status = 'error', error = ${STALE_MESSAGE}
      where id = ${id} and status in ('queued', 'running') returning *`;
    return failed ?? row;
  }
  return row;
}

/** 409 EN_COURS when the same kind of task already runs on this project (a stale one does not count). */
export async function ensureIdle(sql: Db, projectId: string, kind: JobKind): Promise<void> {
  const rows = await (sql as Sql)<JobRow[]>`
    select * from public.jobs
    where project_id = ${projectId} and kind = ${kind} and status in ('queued', 'running')
    order by created_at desc`;
  for (const r of rows) {
    if (isStale(r)) await readJob(sql, r.id);
    else throw conflict("EN_COURS", "Une tâche de ce type est déjà en cours sur ce projet.");
  }
}

/**
 * Creates the job, then runs `work` in the background. Returns the job id immediately.
 * `work` returns the result stored on the job (the routes also write their own tables).
 */
export async function startJob<T>(
  sql: Sql,
  meta: { kind: JobKind; accountId: string | null; projectId: string | null; detail?: string },
  work: (ctx: JobContext) => Promise<T>,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.jobs (account_id, project_id, kind, status, step, detail)
    values (${meta.accountId}, ${meta.projectId}, ${meta.kind}, 'queued', 0, ${meta.detail ?? null}) returning id`;
  const id = row.id;
  const ctx: JobContext = {
    id,
    providers: {},
    async step(n, detail) {
      await sql`update public.jobs set status = 'running', step = ${n}, detail = ${detail ?? null} where id = ${id}`;
    },
  };
  const run = (async () => {
    try {
      await sql`update public.jobs set status = 'running' where id = ${id}`;
      const result = await work(ctx);
      await sql`
        update public.jobs set status = 'done', result = ${result === undefined ? null : sql.json(result as never)},
          providers = ${sql.json(ctx.providers as never)} where id = ${id}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tâche ${meta.kind} ${id}]`, message);
      await sql`
        update public.jobs set status = 'error', error = ${message.slice(0, 500)}, providers = ${sql.json(ctx.providers as never)}
        where id = ${id}`.catch(() => undefined);
    }
  })();
  background(run);
  return id;
}

/** The job, if the connected account may read it. */
export async function ownedJob(sql: Db, accountId: string, id: string): Promise<Job> {
  const row = await readJob(sql, id);
  if (!row) throw notFound("Tâche introuvable.");
  if (row.account_id !== accountId) throw forbidden("Cette tâche n’appartient pas à votre compte.");
  return jobOut(row);
}

/** Jobs started from a public page (voice passport of an invited person): no account. */
export async function publicJob(sql: Db, id: string): Promise<Job> {
  const row = await readJob(sql, id);
  if (!row || row.account_id !== null) throw notFound("Tâche introuvable.");
  const { result: _r, ...rest } = jobOut(row);
  return rest;
}
