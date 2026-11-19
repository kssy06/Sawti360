/**
 * The audit journal in back-end mode: read from the base (GET /api/journal) when a screen needs it,
 * checked by verifyChain() in the browser. The simulated tampering acts on a local copy only.
 */
import { api } from "../../api/client";
import type { AuditEntry } from "../../core/types";
import { report } from "./report";
import type { Get, Set } from "./state";

let lastLoad = 0;
let inflight: Promise<void> | null = null;

/** Loads the chain into the store (at most every 5 s unless forced). */
export function loadJournal(set: Set, force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastLoad < 5000) return Promise.resolve();
  inflight = api
    .get<AuditEntry[]>("/journal")
    .then((journal) => {
      lastLoad = Date.now();
      set({ journal, journalHead: journal.length ? { count: journal.length, head: journal[journal.length - 1].entry_hash } : { count: 0, head: "0".repeat(64) } });
    })
    .catch(report)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** logExport: the EXPORT entry is written by the server (actor = connected account). */
export function logExport(set: Set, get: Get, kind: string, detail: Record<string, unknown>): void {
  const clean = Object.fromEntries(Object.entries(detail).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v)));
  void api
    .post<AuditEntry>("/journal/export", { kind, detail: clean })
    .then((entry) => {
      const j = get().journal;
      if (j.length && j[j.length - 1].index === entry.index - 1) set({ journal: [...j, entry] });
    })
    .catch(report);
}
