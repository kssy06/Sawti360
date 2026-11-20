/**
 * Back-end versions of the voice-owner actions (A10, écrans 14 à 16): the Passport is created by the server
 * after checking the reading (8 s at least), the rules are signed again by the server at each change,
 * and a revocation reaches the creators who use the voice.
 */
import { api } from "../../api/client";
import { uploadFile } from "../../api/upload";
import { waitJob } from "../../api/useJob";
import type { VoiceLicense } from "../../core/types";
import type { VoiceProfile } from "../../mock/registry";
import type { OwnedVoice } from "../store";
import { bootstrap } from "./bootstrap";
import { report } from "./report";
import type { Get, Set } from "./state";

export async function createOwnVoice(set: Set, get: Get, profile: Omit<VoiceProfile, "voiceId" | "accountId">, sample: OwnedVoice["sample"], audioUrl?: string): Promise<void> {
  if (!sample || !audioUrl) throw new Error("Enregistrement manquant : lisez le paragraphe à voix haute.");
  const blob = await (await fetch(audioUrl)).blob();
  const sent = await uploadFile("sample", blob);
  const { jobId } = await api.post<{ jobId: string }>("/owner/voice", { profile, samplePath: sent.path, duration: sample.duration, peak: sample.peak, rms: sample.rms });
  const job = await waitJob(jobId);
  if (job.status === "error") throw new Error(job.error ?? "Enregistrement refusé par le contrôle.");
  await bootstrap(set, get);
}

const mine = (get: Get) => {
  const id = get().session?.accountId;
  return id ? get().ownedVoices[id] : undefined;
};

export async function updateProfile(set: Set, get: Get, patch: Partial<VoiceProfile>): Promise<void> {
  const id = get().session?.accountId;
  const before = mine(get);
  if (!id || !before) return;
  const { voiceId: _v, accountId: _a, ...fields } = patch;
  set((s) => ({ ownedVoices: { ...s.ownedVoices, [id]: { ...before, profile: { ...before.profile, ...fields } } } }));
  try {
    const owned = await api.patch<OwnedVoice>("/owner/voice/profile", fields);
    set((s) => ({ ownedVoices: { ...s.ownedVoices, [id]: owned } }));
  } catch (err) {
    report(err);
    await bootstrap(set, get).catch(() => undefined);
  }
}

function putLicence(set: Set, lic: VoiceLicense): void {
  set((s) => ({ licenses: s.licenses.some((l) => l.license_id === lic.license_id) ? s.licenses.map((l) => (l.license_id === lic.license_id ? lic : l)) : [...s.licenses, lic] }));
}

async function change(set: Set, get: Get, optimistic: VoiceLicense | undefined, call: () => Promise<VoiceLicense>): Promise<void> {
  if (optimistic) putLicence(set, optimistic);
  try {
    putLicence(set, await call());
  } catch (err) {
    report(err);
    await bootstrap(set, get).catch(() => undefined);
  }
}

export function updateRules(set: Set, get: Get, rules: Pick<VoiceLicense, "allowed_uses" | "forbidden_themes">): Promise<void> {
  const voice = mine(get);
  const lic = voice ? get().licenses.find((l) => l.voice_id === voice.voiceId) : undefined;
  return change(set, get, lic && { ...lic, ...rules }, () => api.patch<VoiceLicense>("/owner/voice/rules", rules));
}

export function revoke(set: Set, get: Get, licenseId: string): Promise<void> {
  const lic = get().licenses.find((l) => l.license_id === licenseId);
  return change(set, get, lic && { ...lic, status: "revoked", revoked_at: new Date().toISOString() }, () => api.post<VoiceLicense>(`/owner/licenses/${encodeURIComponent(licenseId)}/revoke`));
}

export function reinstate(set: Set, get: Get, licenseId: string): Promise<void> {
  const lic = get().licenses.find((l) => l.license_id === licenseId);
  return change(set, get, lic && { ...lic, status: "active", revoked_at: null }, () => api.post<VoiceLicense>(`/owner/licenses/${encodeURIComponent(licenseId)}/reinstate`));
}
