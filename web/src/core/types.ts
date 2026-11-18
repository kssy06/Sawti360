export type Use =
  | "doublage_film"
  | "doublage_video_en_ligne"
  | "bande_annonce"
  | "publicite"
  | "contenu_politique"
  | "contenu_intime";

export type Lang = "fr" | "ar" | "en";

export type Theme = "politique" | "religion" | "publicite" | "violence" | "grossierete" | "intime" | "alcool_paris";

export type LicenseStatus = "active" | "revoked" | "expired";

/** consentie: a real holder's voice, paid 70 %. base: Sawti's synthetic voices, available to everyone. */
export type VoiceKind = "consentie" | "base";

/** Mirrors sawti/models.py VoiceLicense, plus the owner's forbidden themes. */
export interface VoiceLicense {
  license_id: string;
  voice_id: string;
  holder_name: string;
  holder_role: string;
  allowed_uses: Use[];
  forbidden_uses: Use[];
  forbidden_themes: Theme[];
  projects: string[];
  languages: Lang[];
  valid_from: string;
  valid_until: string;
  owner_share: number;
  no_training: boolean;
  status: LicenseStatus;
  revoked_at: string | null;
  consent_evidence_sha256: string;
  demo: boolean;
  signature: string;
}

export interface GenerationRequest {
  request_id: string;
  voice_id: string;
  project_id: string;
  use: Use;
  language: Lang;
  requested_by: string;
  text_hash: string;
  timestamp: string;
  human_validated: boolean;
}

export type ReasonCode =
  | "OK"
  | "VOIX_NON_ENREGISTREE"
  | "LICENCE_REVOQUEE"
  | "LICENCE_EXPIREE"
  | "LICENCE_PAS_ENCORE_VALIDE"
  | "USAGE_NON_AUTORISE"
  | "USAGE_INTERDIT"
  | "PROJET_NON_AUTORISE"
  | "LANGUE_NON_AUTORISEE"
  | "SIGNATURE_INVALIDE"
  | "PERSONNALITE_BLOQUEE"
  | "VALIDATION_HUMAINE_MANQUANTE"
  | "CONTENU_INTERDIT"
  | "THEME_INTERDIT_PAR_TITULAIRE";

export interface Decision {
  allowed: boolean;
  reason_code: ReasonCode;
  reason_fr: string;
  license_id: string | null;
  checked_at: string;
  detail?: string;
}

export interface Voice {
  voice_id: string;
  name: string;
  kind: VoiceKind;
  /** ElevenLabs premade (synthetic) voice used to render this demo voice. */
  eleven_voice_id: string;
  description: string;
  gender: "femme" | "homme" | "neutre";
  hue: [number, number];
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  speaker: string;
  source: string;
  confidence: number;
  translation: string;
  validated: boolean;
  /** What the vision model used to choose this translation (who speaks, to whom, what is on screen). */
  context?: string;
  /** Whether the vision model judged the French line short enough for the time on screen. */
  fits?: boolean;
}

export interface AuditEntry {
  index: number;
  timestamp: string;
  actor: string;
  action: string;
  payload_hash: string;
  decision: string;
  prev_hash: string;
  entry_hash: string;
}
