/**
 * SQL rows → the front's own objects (Project, LicenseRequest, Notice…), so the store keeps
 * the API answers as they are. Pure functions: unit-tested without a database.
 *
 * Composition at read time: characters[key].living comes from the latest consent row,
 * characters[key].dossier from the latest dossier row (never its file path). Raw link tokens are
 * never returned here: they are stored hashed and given out once, when the link is created.
 */
import type { Segment, Use, VoiceLicense } from "../src/core/types.js";
import type { Review } from "../src/mock/simulate.js";
import type { VoiceProfile } from "../src/mock/registry.js";
import type { GenState, Generation, Notice, OwnedVoice, Pipeline, Project, Speaker, UsageRow, VideoMeta } from "../src/state/store.js";
import type {
  Character,
  DossierStatus,
  FamilyCheck,
  FamilyDossier,
  LicenseRequest,
  LivingConsent,
  LivingStatus,
  PaymentStatus,
  RequestStatus,
  VideoFormat,
} from "../src/state/workflow.js";

type Ts = Date | string;
const iso = (d: Ts) => (d instanceof Date ? d : new Date(d)).toISOString();
const isoOpt = (d: Ts | null | undefined) => (d ? iso(d) : undefined);

/* ------------------------------------------------------------------ rows */

export interface ProjectRow {
  id: string;
  account_id: string;
  title: string;
  subtitle: string;
  kind: "demo" | "video";
  format: VideoFormat;
  use_case: Use;
  example: boolean;
  video: VideoMeta | null;
  pipeline: Pipeline | null;
  segments: Segment[];
  speakers: Record<string, Speaker>;
  characters: Record<string, Character>;
  speaker_voices: Record<string, string>;
  proposals: Record<string, string>;
  reviews: Record<string, Review>;
  gens: Record<string, GenState>;
  generation: Generation;
  audio_hash: string | null;
  created_at: Ts;
  updated_at: Ts;
}

export interface ConsentRow {
  id: string;
  project_id: string;
  character_key: string;
  email: string;
  registered: boolean;
  status: LivingStatus;
  token_hash: string;
  voice_id: string | null;
  sent_at: Ts;
  decided_at: Ts | null;
  superseded: boolean;
}

export interface DossierRow {
  id: string;
  project_id: string;
  character_key: string;
  status: DossierStatus;
  deceased_name: string;
  declared_role: string;
  reference: string;
  file_path: string;
  file_name: string;
  file_size: number | string;
  file_type: string;
  file_hash: string;
  received_at: Ts;
  ai_check: FamilyCheck | null;
  validated_at: Ts | null;
  validated_by: string | null;
  complementary_requested_at: Ts | null;
  superseded: boolean;
}

export interface LicenseRequestRow {
  id: string;
  project_id: string;
  project_title: string;
  character_key: string;
  character_name: string;
  voice_id: string;
  creator_account_id: string | null;
  creator_name: string;
  owner_account_id: string | null;
  message: string;
  price: number | string;
  sent_at: Ts;
  expires_at: Ts;
  status: RequestStatus;
  decided_at: Ts | null;
  payment: PaymentStatus;
  payment_at: Ts | null;
  reference: string | null;
}

export interface NoticeRow {
  id: string;
  account_id: string;
  space: "creator" | "owner";
  at: Ts;
  tone: Notice["tone"];
  title: string;
  body: string;
  link: string | null;
  read: boolean;
}

export interface UsageRowDb {
  id: string;
  at: Ts;
  project_id: string | null;
  project_label: string;
  creator_account_id: string | null;
  creator_name: string;
  voice_id: string;
  chars: number;
  cost: number;
  owner: number;
  platform: number;
  ms: number | null;
  bytes: number | null;
}

export interface VoiceProfileRow {
  voice_id: string;
  account_id: string | null;
  profile: Omit<VoiceProfile, "voiceId" | "accountId"> & Partial<Pick<VoiceProfile, "voiceId" | "accountId">>;
  published: boolean;
  sample: { path?: string; duration: number; peak: number; rms: number; recordedAt: string; transcript?: string; wer?: number; match?: string } | null;
  eleven_voice_id: string | null;
  cloned: boolean;
  created_at: Ts;
}

export interface VoiceLicenseRow {
  license_id: string;
  voice_id: string;
  data: VoiceLicense;
  status: VoiceLicense["status"];
  revoked_at: Ts | null;
}

/* ------------------------------------------------------------------ authorizations */

export function livingOut(c: ConsentRow): LivingConsent {
  return {
    status: c.status,
    email: c.email,
    registered: c.registered,
    sentAt: iso(c.sent_at),
    ...(c.decided_at ? { decidedAt: iso(c.decided_at) } : {}),
  };
}

export function dossierOut(d: DossierRow): FamilyDossier {
  const out: FamilyDossier = {
    status: d.status,
    deceasedName: d.deceased_name,
    declaredRole: d.declared_role,
    reference: d.reference,
    fileName: d.file_name,
    fileSize: Number(d.file_size),
    fileType: d.file_type,
    fileHash: d.file_hash,
    receivedAt: iso(d.received_at),
  };
  if (d.ai_check) out.check = d.ai_check;
  if (d.validated_at) out.validatedAt = iso(d.validated_at);
  if (d.validated_by) out.validatedBy = d.validated_by;
  if (d.complementary_requested_at) out.complementaryRequestedAt = iso(d.complementary_requested_at);
  return out;
}

/** Latest row for (project, character), rows of any order. */
function latest<T extends { project_id: string; character_key: string }>(rows: T[], pid: string, key: string, at: (r: T) => Ts): T | undefined {
  let best: T | undefined;
  for (const r of rows) {
    if (r.project_id !== pid || r.character_key !== key) continue;
    if (!best || new Date(at(r)).getTime() > new Date(at(best)).getTime()) best = r;
  }
  return best;
}

export function characterOut(stored: Character, consent: ConsentRow | undefined, dossier: DossierRow | undefined): Character {
  const { living: _l, dossier: _d, ...base } = stored;
  const out: Character = { ...base };
  if (consent) out.living = livingOut(consent);
  else if (stored.lifeStatus === "vivant") out.living = { status: "a_obtenir", email: "", registered: false };
  if (dossier && !dossier.superseded) out.dossier = dossierOut(dossier);
  else if (stored.lifeStatus === "decede" || dossier)
    out.dossier = { status: "manquant", deceasedName: dossier?.deceased_name ?? "", declaredRole: dossier?.declared_role ?? "" };
  return out;
}

/** Characters as stored: the authorization parts live in their own tables. */
export function stripAuthorizations(chars: Record<string, Character>): Record<string, Character> {
  return Object.fromEntries(
    Object.entries(chars).map(([k, c]) => {
      const { living: _l, dossier: _d, ...rest } = c;
      return [k, rest as Character];
    }),
  );
}

/* ------------------------------------------------------------------ project */

export function projectOut(row: ProjectRow, consents: ConsentRow[] = [], dossiers: DossierRow[] = []): Project {
  const characters = Object.fromEntries(
    Object.entries(row.characters ?? {}).map(([key, c]) => [
      key,
      characterOut(
        c,
        latest(consents, row.id, key, (r) => r.sent_at),
        latest(dossiers, row.id, key, (r) => r.received_at),
      ),
    ]),
  );
  const p: Project = {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    format: row.format,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    segments: row.segments ?? [],
    speakers: row.speakers ?? {},
    characters,
    speakerVoices: row.speaker_voices ?? {},
    proposals: row.proposals ?? {},
    reviews: row.reviews ?? {},
    use: row.use_case,
    gens: row.gens ?? {},
    generation: row.generation,
    example: row.example,
  };
  if (row.video) p.video = row.video;
  if (row.pipeline) p.pipeline = row.pipeline;
  return p;
}

/* ------------------------------------------------------------------ licensing, notices, usage */

export function requestOut(r: LicenseRequestRow): LicenseRequest {
  const out: LicenseRequest = {
    id: r.id,
    token: "",
    projectId: r.project_id,
    projectTitle: r.project_title,
    characterKey: r.character_key,
    characterName: r.character_name,
    voiceId: r.voice_id,
    creator: r.creator_name,
    message: r.message,
    price: Number(r.price),
    sentAt: iso(r.sent_at),
    expiresAt: iso(r.expires_at),
    status: r.status,
    payment: r.payment,
  };
  const decidedAt = isoOpt(r.decided_at);
  const paymentAt = isoOpt(r.payment_at);
  if (decidedAt) out.decidedAt = decidedAt;
  if (paymentAt) out.paymentAt = paymentAt;
  if (r.reference) out.reference = r.reference;
  return out;
}

export function noticeOut(n: NoticeRow): Notice {
  const out: Notice = { id: n.id, to: n.account_id, space: n.space, at: iso(n.at), tone: n.tone, title: n.title, body: n.body, read: n.read };
  if (n.link) out.link = n.link;
  return out;
}

export function usageOut(u: UsageRowDb): UsageRow {
  const out: UsageRow = {
    id: u.id,
    at: iso(u.at),
    project: u.project_label,
    creator: u.creator_name,
    voice_id: u.voice_id,
    chars: u.chars,
    cost: u.cost,
    owner: u.owner,
    platform: u.platform,
  };
  if (u.ms != null) out.ms = u.ms;
  if (u.bytes != null) out.bytes = u.bytes;
  return out;
}

/* ------------------------------------------------------------------ voices */

export function licenseOut(l: VoiceLicenseRow): VoiceLicense {
  return { ...l.data, status: l.status, revoked_at: l.revoked_at ? iso(l.revoked_at) : null };
}

/** Public profile; unavailable when its licence is revoked or the profile is unpublished. */
export function profileOut(p: VoiceProfileRow, licenses: VoiceLicense[]): VoiceProfile {
  const lic = licenses.find((l) => l.voice_id === p.voice_id);
  const blocked = !p.published || lic?.status === "revoked";
  return {
    ...p.profile,
    voiceId: p.voice_id,
    accountId: p.account_id ?? "",
    availability: blocked ? "indisponible" : "disponible",
  };
}

export function ownedVoiceOut(p: VoiceProfileRow, licenses: VoiceLicense[]): OwnedVoice {
  const out: OwnedVoice = { voiceId: p.voice_id, profile: profileOut(p, licenses), createdAt: iso(p.created_at), published: p.published };
  if (p.sample) out.sample = { duration: p.sample.duration, peak: p.sample.peak, rms: p.sample.rms, recordedAt: p.sample.recordedAt };
  return out;
}

