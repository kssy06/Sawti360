/**
 * Passeport 360° in back-end mode (A8): signed by the server with its own key (SAWTI_SIGNING_SEED),
 * read by anyone from its identifier (QR → /verifier?id=S360-…); signature and journal chain are
 * checked in the browser with the published public key (VITE_SAWTI_PUBLIC_KEY).
 */
import { api } from "../../api/client";
import type { Passport360 } from "../../core/passport";
import type { AuditEntry } from "../../core/types";
import { loadJournal } from "./journal";
import { report } from "./report";
import type { Get, Set } from "./state";

export async function exportPassport(set: Set, _get: Get, pid: string): Promise<Passport360 | undefined> {
  try {
    const passport = await api.post<Passport360>(`/projects/${pid}/passport`);
    set((s) => ({ passports: { ...s.passports, [pid]: passport } }));
    await loadJournal(set, true);
    return passport;
  } catch (err) {
    report(err);
    return undefined;
  }
}

export interface PublicPassport {
  passport: Passport360;
  journal: AuditEntry[];
}

/** The passport and the chain up to the head it cites (public, no account). */
export const fetchPublicPassport = (id: string) => api.get<PublicPassport>(`/public/passports/${encodeURIComponent(id.trim())}`, { anonymous: true });
