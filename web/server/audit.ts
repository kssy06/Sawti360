/**
 * The platform's audit log: ONE SHA-256 chain for everybody, exactly the format of
 * src/core/audit.ts (appendEntry), so the browser's verifyChain() checks what the base holds.
 * Appends are serialized by a transaction-level advisory lock: no two entries get the same index,
 * and each one links to the real previous head. Works through the pooler (transaction-scoped lock).
 */
import type { Sql, TransactionSql } from "postgres";
import { entryHash, GENESIS } from "../src/core/audit.js";
import { canonicalJson, nowIso, sha256Hex } from "../src/core/canonical.js";
import type { AuditEntry } from "../src/core/types.js";

export type Db = Sql | TransactionSql;

export const AUDIT_LOCK = 360360;

export interface AuditMeta {
  projectId?: string | null;
  accountId?: string | null;
  /** Only for replaying the example journal (scripts/seed.ts); otherwise now. */
  at?: Date;
}

interface AuditRow {
  idx: number;
  ts: string;
  actor: string;
  action: string;
  payload_hash: string;
  decision: string;
  prev_hash: string;
  entry_hash: string;
}

export const toEntry = (r: AuditRow): AuditEntry => ({
  index: r.idx,
  timestamp: r.ts,
  actor: r.actor,
  action: r.action,
  payload_hash: r.payload_hash,
  decision: r.decision,
  prev_hash: r.prev_hash,
  entry_hash: r.entry_hash,
});

/** Appends one entry. Inside a transaction, the entry commits (or rolls back) with it. */
export async function appendAudit(
  sql: Db,
  actor: string,
  action: string,
  payload: unknown,
  decision = "",
  meta: AuditMeta = {},
): Promise<AuditEntry> {
  return (sql as Sql).begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${AUDIT_LOCK}::bigint)`;
    const [head] = await tx<{ idx: number; entry_hash: string }[]>`
      select idx, entry_hash from public.audit_entries order by idx desc limit 1`;
    const draft = {
      index: head ? head.idx + 1 : 0,
      timestamp: nowIso(meta.at ?? new Date()),
      actor,
      action,
      payload_hash: sha256Hex(canonicalJson(payload)),
      decision,
      prev_hash: head ? head.entry_hash : GENESIS,
    };
    const entry: AuditEntry = { ...draft, entry_hash: entryHash(draft) };
    await tx`
      insert into public.audit_entries (idx, ts, actor, action, payload_hash, decision, prev_hash, entry_hash, project_id, account_id)
      values (${entry.index}, ${entry.timestamp}, ${entry.actor}, ${entry.action}, ${entry.payload_hash},
              ${entry.decision}, ${entry.prev_hash}, ${entry.entry_hash}, ${meta.projectId ?? null}, ${meta.accountId ?? null})`;
    return entry;
  }) as Promise<AuditEntry>;
}

/** The whole chain (or the entries tagged with a project), in order. */
export async function readJournal(sql: Db, opts: { projectId?: string; uptoIndex?: number } = {}): Promise<AuditEntry[]> {
  const rows = await (sql as Sql)<AuditRow[]>`
    select idx, ts, actor, action, payload_hash, decision, prev_hash, entry_hash
    from public.audit_entries
    where (${opts.projectId ?? null}::text is null or project_id = ${opts.projectId ?? null})
      and (${opts.uptoIndex ?? null}::int is null or idx <= ${opts.uptoIndex ?? null})
    order by idx`;
  return rows.map(toEntry);
}

export async function journalHead(sql: Db): Promise<{ count: number; head: string }> {
  const [row] = await (sql as Sql)<{ idx: number; entry_hash: string }[]>`
    select idx, entry_hash from public.audit_entries order by idx desc limit 1`;
  return row ? { count: row.idx + 1, head: row.entry_hash } : { count: 0, head: GENESIS };
}
