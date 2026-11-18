import type { Decision, GenerationRequest, ReasonCode, VoiceLicense } from "./types";

/** Port of sawti/models.py REASONS_FR, plus the two content-safety refusals. */
export const REASONS_FR: Record<ReasonCode, string> = {
  OK: "Génération autorisée : licence valide et consentement vérifié.",
  VOIX_NON_ENREGISTREE: "Voix non enregistrée : aucun Passeport de voix, consentement absent.",
  LICENCE_REVOQUEE: "Licence révoquée par le titulaire : génération refusée.",
  LICENCE_EXPIREE: "Licence expirée : génération refusée.",
  LICENCE_PAS_ENCORE_VALIDE: "Licence pas encore valide à cette date.",
  USAGE_NON_AUTORISE: "Cet usage ne figure pas dans les usages autorisés par le titulaire.",
  USAGE_INTERDIT: "Cet usage est explicitement interdit par le titulaire.",
  PROJET_NON_AUTORISE: "Ce projet n’est pas couvert par la licence.",
  LANGUE_NON_AUTORISEE: "Cette langue n’est pas couverte par la licence.",
  SIGNATURE_INVALIDE: "Signature du Passeport de voix invalide : licence altérée.",
  PERSONNALITE_BLOQUEE: "Voix d’une personnalité publique : génération bloquée.",
  VALIDATION_HUMAINE_MANQUANTE: "Le texte n’a pas été validé par un humain.",
  CONTENU_INTERDIT: "Texte refusé par le filtre de sécurité : aucune voix ne peut le dire.",
  THEME_INTERDIT_PAR_TITULAIRE: "Le titulaire a interdit ce thème pour sa voix.",
};

export const BLOCKED_VOICE_IDS = [
  "voice_personnalite_publique",
  "voice_chef_etat",
  "voice_chanteur_celebre",
  "voice_journaliste_tv",
];

export function decision(code: ReasonCode, now: Date, lic?: VoiceLicense | null, detail?: string): Decision {
  return {
    allowed: code === "OK",
    reason_code: code,
    reason_fr: REASONS_FR[code],
    license_id: lic ? lic.license_id : null,
    checked_at: now.toISOString().slice(0, 19) + "+00:00",
    ...(detail ? { detail } : {}),
  };
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Pure port of sawti/rules.py authorize(): refuses by default, same order of checks.
 * Blocked personality → registered voice → signature → revocation → dates → forbidden use →
 * allowed use → project → language → human validation.
 */
export function authorize(
  request: GenerationRequest,
  licenses: VoiceLicense[],
  now: Date,
  opts: { blockedVoiceIds?: string[]; signatureValid?: (lic: VoiceLicense) => boolean } = {},
): Decision {
  const blocked = new Set((opts.blockedVoiceIds ?? BLOCKED_VOICE_IDS).map((v) => v.toLowerCase()));
  if (blocked.has(request.voice_id.toLowerCase())) return decision("PERSONNALITE_BLOQUEE", now);

  const candidates = licenses
    .filter((l) => l.voice_id === request.voice_id)
    .sort((a, b) => a.license_id.localeCompare(b.license_id));
  if (candidates.length === 0) return decision("VOIX_NON_ENREGISTREE", now);

  let last: Decision | null = null;
  for (const lic of candidates) {
    last = checkOne(request, lic, now, opts.signatureValid);
    if (last.allowed) return last;
  }
  return last as Decision;
}

function checkOne(
  request: GenerationRequest,
  lic: VoiceLicense,
  now: Date,
  signatureValid?: (lic: VoiceLicense) => boolean,
): Decision {
  const today = day(now);
  if (signatureValid && !signatureValid(lic)) return decision("SIGNATURE_INVALIDE", now, lic);
  if (lic.status === "revoked" || lic.revoked_at) return decision("LICENCE_REVOQUEE", now, lic);
  if (today < lic.valid_from) return decision("LICENCE_PAS_ENCORE_VALIDE", now, lic);
  if (lic.status === "expired" || today > lic.valid_until) return decision("LICENCE_EXPIREE", now, lic);
  if (lic.forbidden_uses.includes(request.use)) return decision("USAGE_INTERDIT", now, lic);
  if (!lic.allowed_uses.includes(request.use)) return decision("USAGE_NON_AUTORISE", now, lic);
  if (!lic.projects.includes("*") && !lic.projects.includes(request.project_id))
    return decision("PROJET_NON_AUTORISE", now, lic);
  if (!lic.languages.includes(request.language)) return decision("LANGUE_NON_AUTORISEE", now, lic);
  if (!request.human_validated) return decision("VALIDATION_HUMAINE_MANQUANTE", now, lic);
  return decision("OK", now, lic);
}
