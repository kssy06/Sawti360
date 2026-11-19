import { canonicalJson, nowIso, sha256Hex } from "./canonical.js";
import type { AuditEntry } from "./types.js";

export const GENESIS = "0".repeat(64);

/** Same rule as sawti/audit.py: entry_hash covers every field except itself. */
export function entryHash(e: Omit<AuditEntry, "entry_hash"> | AuditEntry): string {
  const { entry_hash: _h, ...rest } = e as AuditEntry;
  return sha256Hex(canonicalJson(rest));
}

export function appendEntry(
  entries: AuditEntry[],
  actor: string,
  action: string,
  payload: unknown,
  decision = "",
  at: Date = new Date(),
): AuditEntry[] {
  const prev = entries.length ? entries[entries.length - 1].entry_hash : GENESIS;
  const draft = {
    index: entries.length,
    timestamp: nowIso(at),
    actor,
    action,
    payload_hash: sha256Hex(canonicalJson(payload)),
    decision,
    prev_hash: prev,
  };
  return [...entries, { ...draft, entry_hash: entryHash(draft) }];
}

/** Returns the first broken index, or null when the whole chain holds. */
export function verifyChain(entries: AuditEntry[]): { ok: boolean; brokenAt: number | null } {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prev_hash !== prev || entryHash(e) !== e.entry_hash || e.index !== i) return { ok: false, brokenAt: i };
    prev = e.entry_hash;
  }
  return { ok: true, brokenAt: null };
}

export function headHash(entries: AuditEntry[]): string {
  return entries.length ? entries[entries.length - 1].entry_hash : GENESIS;
}
