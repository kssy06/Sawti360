/**
 * Jetons (1 jeton = 1 caractère synthétisé): an append-only ledger per account (token_ledger).
 * Prototype: plan changes credit the plan's monthly jetons at once (no real money);
 * a synthesis debits the creator and credits 70 % to the voice owner (src/core/credits.ts split).
 */
import type { Sql } from "postgres";
import type { Db } from "./audit.js";

export type LedgerReason = "allocation_plan" | "achat_prototype" | "synthese" | "part_titulaire" | "remboursement";

export async function balanceOf(sql: Db, accountId: string): Promise<number> {
  const [row] = await (sql as Sql)<{ balance: number }[]>`
    select coalesce(sum(delta), 0)::int as balance from public.token_ledger where account_id = ${accountId}`;
  return row?.balance ?? 0;
}

export async function addEntry(sql: Db, accountId: string, delta: number, reason: LedgerReason, ref: string | null = null): Promise<void> {
  await (sql as Sql)`insert into public.token_ledger (account_id, delta, reason, ref) values (${accountId}, ${Math.trunc(delta)}, ${reason}, ${ref})`;
}

/** Locks the account's ledger for the transaction (two syntheses cannot both spend the last jetons). */
export async function lockLedger(tx: Db, accountId: string): Promise<void> {
  await (tx as Sql)`select pg_advisory_xact_lock(hashtext(${`ledger:${accountId}`})::bigint)`;
}
