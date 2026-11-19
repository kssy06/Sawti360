/**
 * Back-end mode: the store starts empty (no simulated data), then GET /api/bootstrap fills it.
 * `set` and `get` are the zustand store's own, passed by store.ts (no import cycle).
 */
import type { StoreApi } from "zustand";
import { DEMO_ACCOUNTS, type DemoAccount } from "../../mock/registry";
import type { Me } from "../../api/types";
import type { Data, Store } from "../store";

export type Set = StoreApi<Store>["setState"];
export type Get = StoreApi<Store>["getState"];

export interface RemoteState {
  /** off: simulated mode · booting: restoring the Supabase session · ready: signed in or out. */
  status: "off" | "booting" | "ready";
  error?: string;
}

export function emptyData(): Data {
  return {
    session: null,
    accounts: DEMO_ACCOUNTS,
    persona: "creator",
    plan: "createur",
    spent: 0,
    licenses: [],
    projects: {},
    order: [],
    currentId: "",
    usage: [],
    notifications: [],
    journal: [],
    passports: {},
    requests: [],
    ownedVoices: {},
    validator: "",
  };
}

/** The demo buttons keep their keys ("nour", "lina"); the signed-in account takes its real id. */
export function accountsWith(me: Me): DemoAccount[] {
  const mine: DemoAccount = { id: me.id, name: me.name, email: me.email, org: me.org, initials: me.initials };
  const list = DEMO_ACCOUNTS.map((d) => (d.id === me.demoKey ? mine : d));
  return me.demoKey && DEMO_ACCOUNTS.some((d) => d.id === me.demoKey) ? list : [...list, mine];
}
