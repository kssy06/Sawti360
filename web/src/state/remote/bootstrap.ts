/**
 * GET /api/bootstrap → the store, for the connected account (after sign-in, on returning to the tab,
 * when a new notification arrives). Translations still being typed are sent first.
 */
import { api } from "../../api/client";
import type { Bootstrap } from "../../api/types";
import { PLANS } from "../../core/credits";
import { flushEdits } from "./projects";
import { accountsWith, type Get, type Set } from "./state";

export async function bootstrap(set: Set, get: Get): Promise<void> {
  await flushEdits(set);
  const b = await api.get<Bootstrap>("/bootstrap");
  const keep = get().currentId;
  set({
    session: { accountId: b.account.id },
    accounts: accountsWith({ ...b.account, balance: b.balance }),
    plan: b.account.plan,
    spent: PLANS[b.account.plan].monthly - b.balance,
    licenses: b.licenses,
    projects: b.projects,
    order: b.order,
    currentId: b.projects[keep] ? keep : (b.order[0] ?? ""),
    usage: b.usage,
    notifications: b.notifications,
    passports: b.passports,
    requests: b.requests,
    ownedVoices: b.ownedVoices,
    profiles: b.profiles,
    journalHead: b.journalHead,
    validator: b.account.name,
    server: { status: "ready" },
  });
}

let last = 0;

/** Re-reads the account's data when the tab comes back (at most every 10 s). */
export function refreshOnReturn(set: Set, get: Get): void {
  if (!get().session || Date.now() - last < 10_000) return;
  last = Date.now();
  void bootstrap(set, get).catch(() => undefined);
}
