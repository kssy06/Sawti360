/**
 * Accounts (public.accounts, created by the on_auth_user_created trigger with 100 000 jetons).
 * ensureAccount() repairs a missing row (user created before the schema was applied).
 */
import type { Sql } from "postgres";
import { PLANS, type PlanId } from "../src/core/credits.js";
import type { AuthUser } from "./auth.js";
import { env } from "./env.js";
import { notFound } from "./errors.js";

export interface AccountOut {
  id: string;
  name: string;
  email: string;
  org: string;
  initials: string;
  plan: PlanId;
  isDemo: boolean;
  /** Demo key ("nour", "lina") when this account is one of DEMO_EMAILS. */
  demoKey: string | null;
  balance: number;
}

/** Same rule as the SQL trigger: first letter of the first two words, upper case. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "U";
}

export function demoKeyOf(email: string): string | null {
  const entry = Object.entries(env().demoEmails).find(([, e]) => e === email.toLowerCase());
  return entry ? entry[0] : null;
}

interface AccountRow {
  id: string;
  name: string;
  email: string;
  org: string;
  initials: string;
  plan: PlanId;
  is_demo: boolean;
  balance: number | string | null;
}

function toAccount(r: AccountRow): AccountOut {
  const demoKey = demoKeyOf(r.email);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    org: r.org,
    initials: r.initials || initialsOf(r.name),
    plan: r.plan in PLANS ? r.plan : "createur",
    isDemo: r.is_demo || demoKey !== null,
    demoKey,
    balance: Number(r.balance ?? 0),
  };
}

export async function ensureAccount(sql: Sql, user: AuthUser): Promise<void> {
  const name = user.email.split("@")[0] || "Compte";
  await sql.begin(async (tx) => {
    const inserted = await tx`
      insert into public.accounts (id, name, email, initials)
      select ${user.id}, ${name}, ${user.email}, ${initialsOf(name)}
      where exists (select 1 from auth.users where id = ${user.id})
      on conflict (id) do nothing
      returning id`;
    if (inserted.length) {
      await tx`insert into public.token_ledger (account_id, delta, reason, ref) values (${user.id}, ${PLANS.createur.monthly}, 'allocation_plan', 'createur')`;
    }
  });
}

export async function loadAccount(sql: Sql, id: string): Promise<AccountOut | null> {
  const [row] = await sql<AccountRow[]>`
    select a.id, a.name, a.email, a.org, a.initials, a.plan, a.is_demo,
           (select coalesce(sum(delta), 0)::int from public.token_ledger l where l.account_id = a.id) as balance
    from public.accounts a where a.id = ${id}`;
  return row ? toAccount(row) : null;
}

/** The connected account, repaired if its row is missing. */
export async function requireAccount(sql: Sql, user: AuthUser): Promise<AccountOut> {
  let acc = await loadAccount(sql, user.id);
  if (!acc) {
    await ensureAccount(sql, user);
    acc = await loadAccount(sql, user.id);
  }
  if (!acc) throw notFound("Compte introuvable : reconnectez-vous.");
  return acc;
}
