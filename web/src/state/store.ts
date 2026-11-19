import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appendEntry } from "../core/audit";
import { sha256Hex } from "../core/canonical";
import { PROJECT, SEED_LICENSES, SEED_SEGMENTS, VOICES, voiceById } from "../core/catalog";
import { costOf, PLANS, split, type PlanId } from "../core/credits";
import { signLicense } from "../core/crypto";
import { runGate } from "../core/gate";
import { assemblePassport, signPassport, type Passport360 } from "../core/passport";
import { REASONS_FR } from "../core/rules";
import type { AuditEntry, Decision, Segment, Theme, Use, VoiceLicense } from "../core/types";
import { DEMO_ACCOUNTS, profileOf, type DemoAccount, type VoiceProfile } from "../mock/registry";
import { GEN_STAGES, reviewSegment, simulateFamilyCheck, wait, type Review } from "../mock/simulate";
import {
  dossierReference,
  EXPIRY_MS,
  FORMAT_LABEL,
  LIFE_LABEL,
  OUTCOME_LABEL,
  originalVoiceState,
  passportId,
  requestStatus,
  transparencyPolicy,
  voiceSlot,
  type Character,
  type FamilyDossier,
  type LicenseRequest,
  type LifeStatus,
  type VideoFormat,
} from "./workflow";

export type Persona = "creator" | "owner";
export const OWNER_VOICE = "v_lina";
export const CREATOR = { name: "Nour Films", role: "Studio de création · Tunis" };
export const OWNER = { name: "Lina M.", role: "Comédienne · titulaire de voix" };
export const DEMO_ID = PROJECT.id;

export interface GenState {
  status: "pending" | "ok" | "refused" | "error" | "skipped";
  decision?: Decision;
  message?: string;
  chars?: number;
  cost?: number;
  ownerShare?: number;
  ms?: number;
  bytes?: number;
  mock?: boolean;
  at?: string;
  by?: "client" | "server";
}

export interface UsageRow {
  id: string;
  at: string;
  project: string;
  creator: string;
  voice_id: string;
  chars: number;
  cost: number;
  owner: number;
  platform: number;
  ms?: number;
  bytes?: number;
}

export interface Notice {
  id: string;
  to: string;
  space: Persona;
  at: string;
  tone: "ok" | "red" | "warn" | "plain";
  title: string;
  body: string;
  read: boolean;
  link?: string;
}

export type Privacy = "publique" | "inedite";

export interface VideoMeta {
  name: string;
  size: number;
  type: string;
  duration: number;
  width: number;
  height: number;
  privacy: Privacy;
  poster?: string;
  /** SHA-256 of the source file, computed locally while importing. */
  sha256?: string;
  url?: string;
}

export interface Pipeline {
  status: "running" | "done";
  step: number;
  simulated: true;
}

export interface Speaker {
  name: string;
  gender: "femme" | "homme" | "inconnu";
}

export interface Generation {
  status: "idle" | "running" | "done";
  stage: number;
  synthDone: number;
  synthTotal: number;
  startedAt?: string;
  finishedAt?: string;
  etaMs?: number;
}

export type StepKey = "analyse" | "personnages" | "autorisations" | "voix" | "traduction" | "timeline" | "generation" | "resultat";

export interface Project {
  id: string;
  accountId: string;
  title: string;
  subtitle: string;
  kind: "demo" | "video";
  format: VideoFormat;
  createdAt: string;
  updatedAt: string;
  video?: VideoMeta;
  pipeline?: Pipeline;
  segments: Segment[];
  speakers: Record<string, Speaker>;
  characters: Record<string, Character>;
  speakerVoices: Record<string, string>;
  /** First-model translation, kept to tell « modifiée » from « générée ». */
  proposals: Record<string, string>;
  reviews: Record<string, Review>;
  use: Use;
  gens: Record<string, GenState>;
  generation: Generation;
  example: boolean;
}

export interface OwnedVoice {
  voiceId: string;
  profile: VoiceProfile;
  createdAt: string;
  published: boolean;
  sample?: { duration: number; peak: number; rms: number; recordedAt: string };
}

export interface Session {
  accountId: string;
}

interface Data {
  session: Session | null;
  accounts: DemoAccount[];
  persona: Persona;
  plan: PlanId;
  spent: number;
  licenses: VoiceLicense[];
  projects: Record<string, Project>;
  order: string[];
  currentId: string;
  usage: UsageRow[];
  notifications: Notice[];
  journal: AuditEntry[];
  passports: Record<string, Passport360>;
  requests: LicenseRequest[];
  ownedVoices: Record<string, OwnedVoice>;
  validator: string;
}

export interface NewProjectInput {
  meta: VideoMeta;
  title: string;
  format: VideoFormat;
}

interface Actions {
  login: (accountId: string) => void;
  signup: (name: string, email: string) => void;
  logout: () => void;
  setPersona: (p: Persona) => void;
  setPlan: (p: PlanId) => void;
  openProject: (id: string) => void;
  createVideoProject: (input: NewProjectInput) => string;
  patchProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setUse: (u: Use) => void;
  setSpeakerVoice: (speaker: string, voiceId: string) => void;
  editTranslation: (id: string, text: string) => void;
  setValidated: (id: string, v: boolean) => void;
  generate: (id: string) => Promise<void>;
  tryVoice: (voiceId: string, text: string) => Promise<GenState & { url?: string }>;
  updateOwnLicense: (patch: Pick<VoiceLicense, "allowed_uses" | "forbidden_themes">) => void;
  revoke: (licenseId: string) => void;
  reinstate: (licenseId: string) => void;
  exportPassport: (projectId?: string) => Passport360;
  logExport: (kind: string, detail: Record<string, unknown>) => void;
  markRead: () => void;
  reset: () => void;

  /* characters and authorizations */
  updateCharacter: (pid: string, key: string, patch: Partial<Character>) => void;
  confirmCharacter: (pid: string, key: string, name: string, description: string) => void;
  setUseOriginal: (pid: string, key: string, v: boolean) => void;
  setLifeStatus: (pid: string, key: string, s: LifeStatus) => void;
  sendConsent: (pid: string, key: string, email: string, registered: boolean) => string;
  respondConsent: (token: string, accept: boolean) => void;
  uploadDossier: (pid: string, key: string, d: Pick<FamilyDossier, "deceasedName" | "declaredRole" | "fileName" | "fileSize" | "fileType" | "fileHash">) => Promise<void>;
  validateDossier: (pid: string, key: string) => void;
  requestComplementary: (pid: string, key: string) => void;
  resetDossier: (pid: string, key: string) => void;

  /* voice licensing */
  requestLicense: (pid: string, key: string, voiceId: string, message: string) => LicenseRequest;
  respondLicense: (token: string, accept: boolean) => void;
  payLicense: (id: string, success: boolean) => void;
  expireRequest: (id: string) => void;
  assignVoice: (pid: string, key: string, voiceId: string) => void;

  /* translation, generation */
  applySuggestion: (pid: string, segId: string) => void;
  reviewAll: (pid: string) => void;
  startGeneration: (pid: string) => Promise<void>;

  /* voice owner */
  createOwnVoice: (profile: Omit<VoiceProfile, "voiceId" | "accountId">, sample: OwnedVoice["sample"]) => void;
  updateProfile: (patch: Partial<VoiceProfile>) => void;
}

export type Store = Data & Actions;

export const audioUrls = new Map<string, string>();
export const audioKey = (projectId: string, segId: string) => `${projectId}/${segId}`;
/** Voice samples recorded by owners: memory only, never persisted. */
export const sampleUrls = new Map<string, string>();

const id = () => Math.random().toString(36).slice(2, 10);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const at = (iso: string) => new Date(iso);

function safeStorage(): Storage {
  try {
    const k = "__sawti_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => void mem.set(key, value),
      removeItem: (key) => void mem.delete(key),
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
  }
}

export const kindOf = (voiceId: string): "licensed" | "ai" | null => {
  const v = voiceById(voiceId);
  if (!v) return null;
  return v.kind === "base" ? "ai" : "licensed";
};

const character = (key: string, name: string, description: string, over: Partial<Character> = {}): Character => ({
  key,
  proposedName: name,
  proposedDescription: description,
  name,
  description,
  confirmed: false,
  useOriginal: false,
  lifeStatus: "a_renseigner",
  ...over,
});

const emptyGen = (): Generation => ({ status: "idle", stage: 0, synthDone: 0, synthTotal: 0 });

function withReviews(segments: Segment[]) {
  return {
    proposals: Object.fromEntries(segments.map((s) => [s.id, s.translation])),
    reviews: Object.fromEntries(segments.map((s) => [s.id, reviewSegment(s)])),
  };
}

/* ------------------------------------------------------------------ seed (illustrative) */

const PODCAST_SEGMENTS: Segment[] = [
  { id: "s1", start: 0.8, end: 4.6, speaker: "narr", source: "اليوم نحكيو على جدّي و على الحكايات متاعو.", confidence: 0.94, translation: "Aujourd’hui, on parle de mon grand-père et de ses histoires.", validated: false },
  { id: "s2", start: 5.2, end: 9.4, speaker: "jeddi", source: "كي كنت صغير، كنا نمشيو للسوق على الكرّيطة.", confidence: 0.83, translation: "Quand j’étais petit, on allait au souk en charrette.", validated: false },
  { id: "s3", start: 10.1, end: 13.0, speaker: "jeddi", source: "الدنيا تبدّلت برشا، أما القلب ما تبدّلش.", confidence: 0.78, translation: "Le monde a beaucoup changé, mais le cœur, lui, n’a pas changé.", validated: false },
  { id: "s4", start: 13.8, end: 17.6, speaker: "narr", source: "هاذي آخر تسجيلة عملها قبل ما يمشي.", confidence: 0.9, translation: "C’est le dernier enregistrement qu’il a fait avant de partir.", validated: false },
];

const BLEDI_SEGMENTS: Segment[] = [
  { id: "s1", start: 0.6, end: 3.4, speaker: "selma", source: "وين كنت البارح؟ استنيتك برشا.", confidence: 0.92, translation: "Où étais-tu hier ? Je t’ai attendu longtemps.", validated: true },
  { id: "s2", start: 3.9, end: 6.8, speaker: "hamza", source: "كنت نخدم في الحانوت حتى العشية.", confidence: 0.89, translation: "Je travaillais à la boutique jusqu’au soir.", validated: true },
  { id: "s3", start: 7.4, end: 10.2, speaker: "selma", source: "باهي، أما المرة الجاية قلّي.", confidence: 0.91, translation: "D’accord, mais la prochaine fois, préviens-moi.", validated: true },
  { id: "s4", start: 10.8, end: 12.9, speaker: "hamza", source: "وعد، ما نعاودهاش.", confidence: 0.86, translation: "Promis, je ne recommencerai pas.", validated: true },
];

function seed(): Data {
  const licenses = SEED_LICENSES.map(signLicense);
  let journal: AuditEntry[] = [];
  const signedAt = ["2026-10-28T09:00:00Z", "2026-10-29T14:20:00Z", "2026-10-30T10:05:00Z", "2026-05-30T11:40:00Z", "2026-11-03T16:10:00Z"];
  licenses.forEach((l, i) => {
    journal = appendEntry(journal, "plateforme", "LICENCE_SIGNEE", { license_id: l.license_id, signature: l.signature }, "OK", at(signedAt[i] ?? "2026-10-27T08:00:00Z"));
  });
  journal = appendEntry(journal, "Hédi R.", "LICENCE_REVOQUEE", { license_id: "VL-2026-0004" }, "REVOQUEE", at("2026-11-10T09:12:00Z"));
  const prior: UsageRow[] = [
    { id: "u1", at: "2026-11-06T18:22:00Z", project: "Bledi, épisode 4", creator: "Atelier Bledi", voice_id: "v_lina", chars: 812, cost: 812, owner: 568, platform: 244 },
    { id: "u2", at: "2026-11-12T11:05:00Z", project: "Hkeyet, podcast", creator: "Studio Hkeyet", voice_id: "v_lina", chars: 640, cost: 640, owner: 448, platform: 192 },
    { id: "u3", at: "2026-11-14T15:47:00Z", project: "Bledi, épisode 5", creator: "Nour Films", voice_id: "v_lina", chars: 341, cost: 341, owner: 238, platform: 103 },
  ];
  prior.forEach((u) => {
    journal = appendEntry(journal, u.creator, "GENERATION_AUTORISEE", { license_id: "VL-2026-0001", chars: u.chars }, "OK", at(u.at));
  });

  const now = Date.now();
  const iso = (offsetH: number) => new Date(now + offsetH * 3600000).toISOString();

  // 1 · Le dernier car — translation in progress, two licensed voices.
  const demoSegs = SEED_SEGMENTS.map((s) => ({ ...s }));
  const demo: Project = {
    id: DEMO_ID,
    accountId: "nour",
    title: PROJECT.title,
    subtitle: "Court-métrage · extrait de 2 min",
    kind: "demo",
    format: "film",
    createdAt: "2026-11-14T10:00:00Z",
    updatedAt: iso(-2),
    segments: demoSegs,
    speakers: { amel: { name: "Amel", gender: "femme" }, yassine: { name: "Yassine", gender: "homme" } },
    characters: {
      amel: character("amel", "Intervenante A", "Voix féminine, ton pressé. 3 répliques.", { name: "Amel", description: "Jeune femme, personnage principal. Attend le car avec Yassine.", confirmed: true }),
      yassine: character("yassine", "Intervenant B", "Voix masculine, registre familier. 3 répliques.", { name: "Yassine", description: "Ami d’Amel, doit rentrer avant la nuit.", confirmed: true }),
    },
    speakerVoices: { amel: "v_lina", yassine: "v_sami" },
    ...withReviews(demoSegs),
    use: "doublage_film",
    gens: {},
    generation: emptyGen(),
    example: true,
  };

  // 2 · Hkeyet Jeddi — awaiting authorization: deceased (needs verification) and living (pending consent).
  const podSegs = PODCAST_SEGMENTS.map((s) => ({ ...s }));
  const jeddiDossier: FamilyDossier = {
    status: "verification",
    deceasedName: "Mohamed B.",
    declaredRole: "Le conteur de l’épisode",
    reference: dossierReference("hkeyet-jeddi"),
    fileName: "autorisation-famille-B.pdf",
    fileSize: 248_311,
    fileType: "application/pdf",
    fileHash: sha256Hex("exemple · autorisation famille B"),
    receivedAt: iso(-20),
    check: {
      outcome: "verification",
      extractedPerson: "Mohamed B.",
      extractedRole: "Le conteur de l’épisode",
      videoFinding: "Deux intervenants racontent une partie de l’histoire ; le rôle « conteur » ne désigne pas clairement l’un des deux.",
      explanation: "Le rôle déclaré est trop général pour être rattaché à un seul intervenant. Une vérification complémentaire est nécessaire.",
      at: iso(-19.5),
      simulated: true,
    },
  };
  const podcast: Project = {
    id: "p_hkeyet_jeddi",
    accountId: "nour",
    title: "Hkeyet Jeddi, épisode 3",
    subtitle: "Podcast vidéo · 18 min",
    kind: "demo",
    format: "podcast",
    createdAt: "2026-11-16T09:30:00Z",
    updatedAt: iso(-19.5),
    segments: podSegs,
    speakers: { narr: { name: "Narratrice", gender: "femme" }, jeddi: { name: "Jeddi", gender: "homme" } },
    characters: {
      narr: character("narr", "Intervenante A", "Voix féminine, présente au début et à la fin.", {
        name: "Narratrice",
        description: "Petite-fille, présente l’épisode.",
        confirmed: true,
        useOriginal: true,
        lifeStatus: "vivant",
        living: { status: "en_attente", email: "narratrice@exemple.tn", registered: false, token: token(), sentAt: iso(-26) },
      }),
      jeddi: character("jeddi", "Intervenant B", "Voix masculine âgée, enregistrement ancien.", {
        name: "Jeddi",
        description: "Grand-père, raconte ses souvenirs du souk.",
        confirmed: true,
        useOriginal: true,
        lifeStatus: "decede",
        dossier: jeddiDossier,
      }),
    },
    speakerVoices: {},
    ...withReviews(podSegs),
    use: "doublage_video_en_ligne",
    gens: {},
    generation: emptyGen(),
    example: true,
  };

  // 3 · Bledi, épisode 5 — completed, with a signed Passeport 360°.
  const bSegs = BLEDI_SEGMENTS.map((s) => ({ ...s }));
  const bledi: Project = {
    id: "p_bledi_5",
    accountId: "nour",
    title: "Bledi, épisode 5",
    subtitle: "Série web · 12 min",
    kind: "demo",
    format: "film",
    createdAt: "2026-11-08T08:00:00Z",
    updatedAt: "2026-11-14T16:02:00Z",
    segments: bSegs,
    speakers: { selma: { name: "Selma", gender: "femme" }, hamza: { name: "Hamza", gender: "homme" } },
    characters: {
      selma: character("selma", "Intervenante A", "Voix féminine.", { name: "Selma", description: "Sœur aînée.", confirmed: true }),
      hamza: character("hamza", "Intervenant B", "Voix masculine.", { name: "Hamza", description: "Frère cadet, travaille à la boutique.", confirmed: true }),
    },
    speakerVoices: { selma: "v_lina", hamza: "v_base_walid" },
    ...withReviews(bSegs),
    use: "doublage_video_en_ligne",
    gens: Object.fromEntries(bSegs.map((s) => [s.id, { status: "ok" as const, at: "2026-11-14T15:47:00Z" }])),
    generation: { status: "done", stage: GEN_STAGES.length, synthDone: 4, synthTotal: 4, startedAt: "2026-11-14T15:46:00Z", finishedAt: "2026-11-14T16:02:00Z" },
    example: true,
  };

  const requests: LicenseRequest[] = [
    {
      id: "r_bledi_lina", token: token(), projectId: bledi.id, projectTitle: bledi.title, characterKey: "selma", characterName: "Selma",
      voiceId: "v_lina", creator: "Nour Films", message: "Pour le personnage de Selma, sœur aînée.", price: 120,
      sentAt: "2026-11-09T10:00:00Z", expiresAt: new Date(at("2026-11-09T10:00:00Z").getTime() + EXPIRY_MS).toISOString(),
      status: "acceptee", decidedAt: "2026-11-09T18:40:00Z", payment: "confirme", paymentAt: "2026-11-09T19:02:00Z", reference: "LP-2026-0041",
    },
    {
      id: "r_demo_lina", token: token(), projectId: demo.id, projectTitle: demo.title, characterKey: "amel", characterName: "Amel",
      voiceId: "v_lina", creator: "Nour Films", message: "Court-métrage, personnage principal.", price: 120,
      sentAt: iso(-30), expiresAt: iso(42), status: "acceptee", decidedAt: iso(-28), payment: "confirme", paymentAt: iso(-27.5), reference: "LP-2026-0057",
    },
    {
      id: "r_demo_sami", token: token(), projectId: demo.id, projectTitle: demo.title, characterKey: "yassine", characterName: "Yassine",
      voiceId: "v_sami", creator: "Nour Films", message: "Court-métrage associatif, personnage de Yassine.", price: 0,
      sentAt: iso(-30), expiresAt: iso(42), status: "acceptee", decidedAt: iso(-29), payment: "non_requis", reference: "LP-2026-0058",
    },
    {
      id: "r_ext_lina", token: token(), projectId: "ext_atelier", projectTitle: "Dar Jedda, documentaire", characterKey: "voix_off", characterName: "Voix off",
      voiceId: "v_lina", creator: "Atelier Bledi", message: "Voix off d’un documentaire de 26 minutes sur la médina de Sfax.", price: 120,
      sentAt: iso(-5), expiresAt: iso(67), status: "envoyee", payment: "en_attente",
    },
  ];

  const base: Data = {
    session: null,
    accounts: DEMO_ACCOUNTS,
    persona: "creator",
    plan: "createur",
    spent: 0,
    licenses,
    projects: { [demo.id]: demo, [podcast.id]: podcast, [bledi.id]: bledi },
    order: [podcast.id, demo.id, bledi.id],
    currentId: demo.id,
    usage: prior,
    notifications: [
      { id: "n4", to: "nour", space: "creator", at: iso(-19.5), tone: "warn", title: "Analyse familiale terminée : vérification nécessaire", body: "Hkeyet Jeddi · Jeddi. L’autorisation n’est pas validée.", read: false, link: `/projet/${podcast.id}/autorisations` },
      { id: "n3", to: "nour", space: "creator", at: iso(-28), tone: "ok", title: "Lina M. a accepté votre demande", body: "Le dernier car · Amel. Paiement confirmé.", read: true, link: "/demandes" },
      { id: "n2", to: "nour", space: "creator", at: "2026-11-14T16:02:00Z", tone: "ok", title: "Génération terminée", body: "Bledi, épisode 5 · MP4 et Passeport 360° prêts.", read: true, link: `/projet/${bledi.id}/resultat` },
      { id: "n1", to: "lina", space: "owner", at: iso(-5), tone: "plain", title: "Nouvelle demande de licence", body: "Atelier Bledi · Dar Jedda, documentaire. Expire dans 72 h.", read: false, link: "/proprietaire/demandes" },
      { id: "n0", to: "lina", space: "owner", at: "2026-11-14T15:47:00Z", tone: "ok", title: "Votre voix a été utilisée", body: "Nour Films · Bledi, épisode 5 · +238 jetons", read: true },
    ],
    journal,
    passports: {},
    requests,
    ownedVoices: {
      lina: { voiceId: "v_lina", profile: profileOf("v_lina")!, createdAt: "2026-10-28T09:00:00Z", published: true, sample: { duration: 31.4, peak: 0.82, rms: 0.19, recordedAt: "2026-10-28T08:52:00Z" } },
    },
    validator: "Nour Films (adaptatrice)",
  };
  // The completed example gets its passport signed at seed time with the real Ed25519 path.
  base.passports[bledi.id] = buildPassport(base, bledi, new Date("2026-11-14T16:02:00Z"));
  base.journal = appendEntry(base.journal, "Nour Films", "PASSEPORT_EXPORTE", { projet: bledi.id, signature: base.passports[bledi.id].signature?.valeur }, "SIGNE", at("2026-11-14T16:02:00Z"));
  return base;
}

/* ------------------------------------------------------------------ passport assembly */

export function requestFor(s: Pick<Data, "requests">, pid: string, key: string, voiceId?: string): LicenseRequest | undefined {
  return [...s.requests].reverse().find((r) => r.projectId === pid && r.characterKey === key && (!voiceId || r.voiceId === voiceId));
}

function buildPassport(s: Data, project: Project, when = new Date()): Passport360 {
  const name = (k: string) => project.characters[k]?.name ?? project.speakers[k]?.name ?? k;
  const keys = Object.keys(project.characters);
  const speakers = keys.map((k) => {
    const c = project.characters[k];
    if (c.useOriginal) return { personnage: name(k), voice_id: `original:${k}`, voiceName: `voix originale de ${name(k)}`, kind: "originale" };
    const vid = project.speakerVoices[k];
    const v = voiceById(vid);
    return { personnage: name(k), voice_id: vid, voiceName: v?.name ?? vid, kind: v?.kind ?? "consentie" };
  });
  const mine = s.usage.filter((u) => u.project.startsWith(project.title));
  const draft = assemblePassport(
    {
      title: project.title,
      validator: s.validator,
      referent: "Ahmed, référent éthique",
      segments: project.segments,
      speakers,
      licenses: s.licenses,
      journal: s.journal,
      generated: Object.values(project.gens).filter((g) => g.status === "ok").length,
      charactersSynthesized: mine.reduce((a, u) => a + u.chars, 0),
    },
    when,
  );
  const policy = transparencyPolicy(project.format);
  draft.voix = draft.voix.map((v, i) => {
    const k = keys[i];
    const c = project.characters[k];
    if (c?.useOriginal) return { ...v, nature: "Voix originale de l’intervenant", titulaire: name(k), licence: null };
    const r = requestFor(s, project.id, k, project.speakerVoices[k]);
    return r && requestStatus(r) === "acceptee"
      ? { ...v, nature: "Voix licenciée · générée par IA avec autorisation du titulaire", licence_projet: { reference: r.reference ?? r.id, statut: "accordée", tarif: r.price ? `${r.price} DT` : "gratuit" } }
      : { ...v, nature: v.nature.includes("base") ? "Voix générée par IA · voix de synthèse Sawti, n’imite personne" : v.nature };
  });
  draft.transparence.label = `Doublé avec l’IA · ${draft.voix.length} voix · validé par ${s.validator}`;
  return signPassport({
    ...draft,
    identifiant: passportId(project.id),
    source: {
      nom: project.video?.name ?? `${project.title} (exemple)`,
      type: project.video?.url ? "lien externe" : project.video ? "fichier importé" : "exemple de démonstration",
      format: FORMAT_LABEL[project.format],
      langue_originale: "Derja tunisienne (ar-TN)",
      langue_cible: "Français (fr)",
      ...(project.video?.sha256 ? { empreinte_sha256: project.video.sha256 } : {}),
    },
    intervenants: keys.map((k) => {
      const c = project.characters[k];
      if (!c.useOriginal) return { personnage: name(k), voix_originale: false, statut_vie: "non requis", autorisation: "aucune : voix de remplacement", statut: "sans objet" };
      if (c.lifeStatus === "decede")
        return {
          personnage: name(k),
          voix_originale: true,
          statut_vie: LIFE_LABEL[c.lifeStatus],
          autorisation: "dossier familial",
          statut: c.dossier?.status === "valide" ? "validé" : "non validé",
          reference: c.dossier?.reference,
          controle_ia: c.dossier?.check ? `${OUTCOME_LABEL[c.dossier.check.outcome]} (contrôle de cohérence, ne certifie ni signature ni lien familial)` : undefined,
        };
      return { personnage: name(k), voix_originale: true, statut_vie: LIFE_LABEL[c.lifeStatus], autorisation: "consentement de la personne", statut: c.living?.status === "autorisee" ? "autorisée" : "non autorisée" };
    }),
    doublage_ia: {
      transcription: "Derja → texte, IA (simulée dans le prototype)",
      traduction: "LLM 1 traduit, LLM 2 vérifie (simulés dans le prototype)",
      verification: "Vérificateur de fidélité : chiffres et négations (règles)",
      validation_humaine: `${project.segments.filter((x) => x.validated).length} / ${project.segments.length} répliques approuvées par ${s.validator}`,
      synthese: "ElevenLabs eleven_multilingual_v2, après décision du moteur de règles",
      label_ia: policy.label,
      qr: policy.qr,
    },
  });
}

/* ------------------------------------------------------------------ selectors */

export const accountOf = (s: Pick<Data, "session" | "accounts">) => s.accounts.find((a) => a.id === s.session?.accountId) ?? null;
export const balanceOf = (s: Pick<Data, "plan" | "spent">) => Math.max(0, PLANS[s.plan].monthly - s.spent);
export const earningsOf = (s: Pick<Data, "usage">, voiceId: string) => s.usage.filter((u) => u.voice_id === voiceId).reduce((a, u) => a + u.owner, 0);
export const currentProject = (s: Pick<Data, "projects" | "currentId">): Project => s.projects[s.currentId] ?? s.projects[DEMO_ID];

export function slotsOf(s: Pick<Data, "requests">, p: Project, now = new Date()) {
  return Object.fromEntries(
    Object.values(p.characters).map((c) => [c.key, voiceSlot(c, p.speakerVoices[c.key], kindOf, requestFor(s, p.id, c.key, p.speakerVoices[c.key]), now)]),
  );
}

export function statusOf(s: Pick<Data, "requests">, p: Project) {
  const analysing = p.pipeline?.status === "running";
  const slots = slotsOf(s, p);
  const blocked = Object.values(p.characters).some((c) => {
    const st = originalVoiceState(c);
    return st === "en_attente" || st === "bloquee" || st === "a_obtenir" || st === "a_renseigner";
  }) || Object.values(slots).some((sl) => sl.mode === "licensed" && !sl.usable);
  if (p.generation.status === "done") return "termine" as const;
  if (p.generation.status === "running") return "generation" as const;
  if (analysing) return "analyse" as const;
  if (blocked) return "attente_autorisation" as const;
  return "brouillon" as const;
}

/* ------------------------------------------------------------------ store */

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const me = () => accountOf(get())?.name ?? CREATOR.name;
      const meId = () => get().session?.accountId ?? "nour";
      const log = (actor: string, action: string, payload: unknown, decisionCode = "") =>
        set((s) => ({ journal: appendEntry(s.journal, actor, action, payload, decisionCode) }));
      const notify = (n: Omit<Notice, "id" | "at" | "read">) =>
        set((s) => ({ notifications: [{ ...n, id: id(), at: new Date().toISOString(), read: false }, ...s.notifications] }));
      const restrictions = () => {
        const s = get();
        return {
          revoked: s.licenses.filter((l) => l.status === "revoked").map((l) => l.license_id),
          extra_themes: [...new Set(s.licenses.flatMap((l) => l.forbidden_themes))] as Theme[],
        };
      };
      const patch = (pid: string, fn: (p: Project) => Partial<Project>) =>
        set((s) => {
          const p = s.projects[pid];
          return p ? { projects: { ...s.projects, [pid]: { ...p, ...fn(p), updatedAt: new Date().toISOString() } } } : {};
        });
      const patchChar = (pid: string, key: string, fn: (c: Character) => Partial<Character>) =>
        patch(pid, (p) => (p.characters[key] ? { characters: { ...p.characters, [key]: { ...p.characters[key], ...fn(p.characters[key]) } } } : {}));
      const patchCurrent = (fn: (p: Project) => Partial<Project>) => patch(currentProject(get()).id, fn);

      /** Gate in the browser, then the same gate again on the server, then payment in jetons. */
      async function synthesize(voiceId: string, text: string, humanValidated: boolean, label: string, project = currentProject(get())): Promise<GenState & { url?: string }> {
        const s = get();
        const cost = costOf(text);
        const gate = runGate(
          { voice_id: voiceId, text, use: project.use, language: "fr", project_id: PROJECT.id, requested_by: me(), human_validated: humanValidated },
          s.licenses,
        );
        if (!gate.decision.allowed) {
          log(me(), "GENERATION_REFUSEE", { voice_id: voiceId, text_hash: sha256Hex(text), code: gate.decision.reason_code }, gate.decision.reason_code);
          if (gate.decision.reason_code === "THEME_INTERDIT_PAR_TITULAIRE" && voiceId === OWNER_VOICE) {
            notify({ to: "lina", space: "owner", tone: "red", title: "Tentative bloquée sur votre voix", body: `${me()} · ${gate.decision.detail ?? ""} · aucun audio généré` });
          }
          return { status: "refused", decision: gate.decision, chars: cost, by: "client" };
        }
        if (cost > balanceOf(s)) return { status: "error", decision: gate.decision, message: `Crédits insuffisants : ${cost} jetons nécessaires.`, chars: cost };
        const t0 = performance.now();
        let res: Response;
        try {
          res = await fetch("/api/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ voice_id: voiceId, text, use: project.use, language: "fr", human_validated: humanValidated, ...restrictions() }),
          });
        } catch {
          return { status: "error", decision: gate.decision, message: "Serveur injoignable.", chars: cost };
        }
        const ms = Math.round(performance.now() - t0);
        if (res.status === 403) {
          const body = await res.json();
          log(me(), "GENERATION_REFUSEE", { voice_id: voiceId, text_hash: sha256Hex(text), code: body.decision.reason_code, par: "serveur" }, body.decision.reason_code);
          return { status: "refused", decision: body.decision, chars: cost, by: "server" };
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { status: "error", decision: gate.decision, message: body.message ?? `Erreur ${res.status}`, chars: cost, ms };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const lic = gate.license!;
        const parts = split(cost, lic.owner_share);
        const row: UsageRow = { id: id(), at: new Date().toISOString(), project: `${project.title}, ${label}`, creator: me(), voice_id: voiceId, chars: cost, cost, owner: parts.owner, platform: parts.platform, ms, bytes: blob.size };
        set((st) => ({ spent: st.spent + cost, usage: [row, ...st.usage] }));
        log(me(), "GENERATION_AUTORISEE", { voice_id: voiceId, license_id: lic.license_id, text_hash: sha256Hex(text), jetons: cost, titulaire: parts.owner }, "OK");
        if (lic.owner_share > 0 && voiceId === OWNER_VOICE) {
          notify({ to: "lina", space: "owner", tone: "ok", title: "Votre voix a été utilisée", body: `${me()} · ${project.title} · ${cost} caractères · +${parts.owner} jetons` });
        }
        return {
          status: "ok", decision: gate.decision, chars: cost, cost, ownerShare: parts.owner, ms, bytes: blob.size,
          mock: res.headers.get("x-sawti-mock") === "1", at: new Date().toISOString(), by: "server", url,
        };
      }

      const generateIn = async (pid: string, sid: string) => {
        const project = get().projects[pid];
        const seg = project?.segments.find((x) => x.id === sid);
        if (!project || !seg) return;
        const setGen = (g: GenState) => patch(pid, (p) => ({ gens: { ...p.gens, [sid]: g } }));
        setGen({ status: "pending" });
        const { url, ...result } = await synthesize(project.speakerVoices[seg.speaker], seg.translation, seg.validated, `réplique ${sid.replace(/^s/, "")}`, project);
        const key = audioKey(pid, sid);
        const old = audioUrls.get(key);
        if (old) URL.revokeObjectURL(old);
        if (url) audioUrls.set(key, url);
        else audioUrls.delete(key);
        setGen(result);
      };

      return {
        ...seed(),
        login: (accountId) => {
          set({ session: { accountId }, persona: "creator" });
          log(accountOf(get())?.name ?? accountId, "CONNEXION", { compte: accountId }, "DEMO");
        },
        signup: (name, email) => {
          const acc: DemoAccount = { id: `u_${id()}`, name, email, org: "Compte de démonstration", initials: name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "U" };
          set((s) => ({ accounts: [...s.accounts, acc], session: { accountId: acc.id }, persona: "creator" }));
          log(name, "COMPTE_CREE", { email_hash: sha256Hex(email) }, "DEMO");
        },
        logout: () => set({ session: null }),
        setPersona: (persona) => set({ persona }),
        setPlan: (plan) => set({ plan }),
        openProject: (pid) => set((s) => (s.projects[pid] ? { currentId: pid } : {})),
        createVideoProject: ({ meta, title, format }) => {
          const pid = `v_${id()}`;
          const project: Project = {
            id: pid,
            accountId: meId(),
            title: title.trim() || meta.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Vidéo",
            subtitle: `${FORMAT_LABEL[format]} · ${meta.privacy === "publique" ? "déjà publique" : "inédite"}`,
            kind: "video",
            format,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            video: meta,
            pipeline: { status: "running", step: 0, simulated: true },
            segments: [],
            speakers: {},
            characters: {},
            speakerVoices: {},
            proposals: {},
            reviews: {},
            use: format === "film" ? "doublage_film" : "doublage_video_en_ligne",
            gens: {},
            generation: emptyGen(),
            example: false,
          };
          set((s) => ({ projects: { ...s.projects, [pid]: project }, order: [pid, ...s.order], currentId: pid }));
          log(me(), "VIDEO_IMPORTEE", { nom: meta.name, taille: meta.size, duree: meta.duration, empreinte: meta.sha256 ?? null, confidentialite: meta.privacy }, meta.privacy === "publique" ? "PUBLIQUE" : "INEDITE");
          return pid;
        },
        patchProject: (pid, p) => patch(pid, () => p),
        deleteProject: (pid) =>
          set((s) => {
            if (s.projects[pid]?.example) return {};
            const { [pid]: _gone, ...rest } = s.projects;
            return { projects: rest, order: s.order.filter((x) => x !== pid), currentId: s.currentId === pid ? DEMO_ID : s.currentId };
          }),
        setUse: (use) => patchCurrent(() => ({ use })),
        setSpeakerVoice: (speaker, voiceId) => patchCurrent((p) => ({ speakerVoices: { ...p.speakerVoices, [speaker]: voiceId } })),
        editTranslation: (sid, text) =>
          patchCurrent((p) => ({ segments: p.segments.map((x) => (x.id === sid ? { ...x, translation: text, validated: x.translation === text ? x.validated : false } : x)) })),
        setValidated: (sid, v) => {
          const seg = currentProject(get()).segments.find((x) => x.id === sid);
          patchCurrent((p) => ({ segments: p.segments.map((x) => (x.id === sid ? { ...x, validated: v } : x)) }));
          if (seg) log(get().validator, v ? "TEXTE_VALIDE" : "VALIDATION_RETIREE", { segment: sid, text_hash: sha256Hex(seg.translation) }, v ? "VALIDE" : "");
        },
        generate: (sid) => generateIn(currentProject(get()).id, sid),
        tryVoice: (voiceId, text) => synthesize(voiceId, text, true, "essai de voix"),
        updateOwnLicense: (p) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.voice_id === OWNER_VOICE ? signLicense({ ...l, ...p }) : l)) }));
          const lic = get().licenses.find((l) => l.voice_id === OWNER_VOICE)!;
          log(OWNER.name, "PASSEPORT_MIS_A_JOUR", { license_id: lic.license_id, usages: lic.allowed_uses, themes: lic.forbidden_themes, signature: lic.signature }, "SIGNE");
        },
        revoke: (licenseId) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.license_id === licenseId ? { ...l, status: "revoked", revoked_at: new Date().toISOString() } : l)) }));
          const lic = get().licenses.find((l) => l.license_id === licenseId)!;
          log(lic.holder_name, "LICENCE_REVOQUEE", { license_id: licenseId }, "REVOQUEE");
          notify({ to: "nour", space: "creator", tone: "red", title: `${lic.holder_name} a révoqué sa licence`, body: "Les prochaines générations avec cette voix seront refusées. L’audio déjà livré reste tel quel." });
        },
        reinstate: (licenseId) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.license_id === licenseId ? signLicense({ ...l, status: "active", revoked_at: null }) : l)) }));
          const lic = get().licenses.find((l) => l.license_id === licenseId)!;
          log(lic.holder_name, "LICENCE_RETABLIE", { license_id: licenseId, signature: lic.signature }, "SIGNE");
        },
        exportPassport: (projectId) => {
          const s = get();
          const project = projectId ? s.projects[projectId] : currentProject(s);
          const signed = buildPassport(s, project);
          set((st) => ({
            passports: { ...st.passports, [project.id]: signed },
            journal: appendEntry(st.journal, st.validator, "PASSEPORT_EXPORTE", { projet: project.id, signature: signed.signature?.valeur }, "SIGNE"),
          }));
          return signed;
        },
        logExport: (kind, detail) => log(get().validator, "EXPORT", { type: kind, ...detail }, "OK"),
        markRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.to === meId() && n.space === s.persona ? { ...n, read: true } : n)) })),
        reset: () => {
          audioUrls.forEach((u) => URL.revokeObjectURL(u));
          audioUrls.clear();
          const session = get().session;
          set({ ...seed(), session });
        },

        /* ---------------------------------------------- characters & authorizations */
        updateCharacter: (pid, key, p) => patchChar(pid, key, () => p),
        confirmCharacter: (pid, key, name, description) => {
          patchChar(pid, key, () => ({ name: name.trim(), description: description.trim(), confirmed: true }));
          patch(pid, (p) => ({ speakers: { ...p.speakers, [key]: { ...(p.speakers[key] ?? { gender: "inconnu" }), name: name.trim() } } }));
          log(me(), "PERSONNAGE_CONFIRME", { projet: pid, personnage: key, nom: name.trim() }, "HUMAIN");
        },
        setUseOriginal: (pid, key, v) => patchChar(pid, key, () => ({ useOriginal: v })),
        setLifeStatus: (pid, key, st) => {
          patchChar(pid, key, (c) => ({
            lifeStatus: st,
            living: st === "vivant" ? (c.living ?? { status: "a_obtenir", email: "", registered: false }) : c.living,
            dossier: st === "decede" ? (c.dossier ?? { status: "manquant", deceasedName: "", declaredRole: "" }) : c.dossier,
          }));
          log(me(), "STATUT_DE_VIE_RENSEIGNE", { projet: pid, personnage: key, statut: st }, st.toUpperCase());
        },
        sendConsent: (pid, key, email, registered) => {
          const t = token();
          patchChar(pid, key, () => ({ living: { status: "en_attente", email: email.trim(), registered, token: t, sentAt: new Date().toISOString() } }));
          log(me(), "CONSENTEMENT_DEMANDE", { projet: pid, personnage: key, email_hash: sha256Hex(email.trim().toLowerCase()) }, "EN_ATTENTE");
          return t;
        },
        respondConsent: (t, accept) => {
          const s = get();
          for (const p of Object.values(s.projects)) {
            const c = Object.values(p.characters).find((x) => x.living?.token === t);
            if (!c || !c.living) continue;
            patchChar(p.id, c.key, (x) => ({ living: { ...x.living!, status: accept ? "autorisee" : "refusee", decidedAt: new Date().toISOString(), registered: true } }));
            log(`titulaire (${c.name})`, accept ? "CONSENTEMENT_ACCORDE" : "CONSENTEMENT_REFUSE", { projet: p.id, personnage: c.key }, accept ? "AUTORISEE" : "REFUSEE");
            notify({
              to: p.accountId, space: "creator", tone: accept ? "ok" : "red",
              title: accept ? `${c.name} a donné son consentement` : `${c.name} a refusé l’utilisation de sa voix`,
              body: accept ? `${p.title} · la voix originale peut être utilisée.` : `${p.title} · la voix originale reste bloquée. Choisissez une voix de remplacement.`,
              link: `/projet/${p.id}/autorisations`,
            });
            return;
          }
        },
        uploadDossier: async (pid, key, d) => {
          const reference = dossierReference(`${pid}/${key}/${d.fileHash}`);
          patchChar(pid, key, (c) => ({ dossier: { ...(c.dossier ?? { status: "manquant", deceasedName: "", declaredRole: "" }), ...d, reference, status: "recu", receivedAt: new Date().toISOString(), check: undefined, validatedAt: undefined, complementaryRequestedAt: undefined } }));
          log(me(), "DOSSIER_FAMILIAL_RECU", { projet: pid, personnage: key, empreinte: d.fileHash, reference }, "RECU");
          const p0 = get().projects[pid];
          notify({ to: p0.accountId, space: "creator", tone: "plain", title: "Document familial reçu", body: `${p0.title} · ${p0.characters[key].name} · contrôle de cohérence lancé.`, link: `/projet/${pid}/autorisations` });
          await wait(700);
          patchChar(pid, key, (c) => ({ dossier: { ...c.dossier!, status: "analyse" } }));
          await wait(2600);
          const p = get().projects[pid];
          const target = p.characters[key];
          if (!target?.dossier) return;
          const lines = p.segments.filter((x) => x.speaker === key);
          const first = lines[0] ? new Date(lines[0].start * 1000).toISOString().slice(14, 19) : "–";
          const check = simulateFamilyCheck(target.dossier, target, Object.values(p.characters).filter((c) => c.key !== key), lines.length, first);
          patchChar(pid, key, (c) => ({ dossier: { ...c.dossier!, status: check.outcome, check } }));
          log("contrôle IA (simulé)", "CONTROLE_COHERENCE", { projet: pid, personnage: key, resultat: check.outcome }, check.outcome.toUpperCase());
          notify({
            to: p.accountId, space: "creator", tone: check.outcome === "correspondance" ? "ok" : "warn",
            title: check.outcome === "correspondance" ? "Analyse familiale terminée : correspondance détectée" : `Autorisation non validée : ${OUTCOME_LABEL[check.outcome].toLowerCase()}`,
            body: `${p.title} · ${target.name}.`,
            link: `/projet/${pid}/autorisations`,
          });
        },
        validateDossier: (pid, key) => {
          patchChar(pid, key, (c) => (c.dossier?.status === "correspondance" ? { dossier: { ...c.dossier, status: "valide", validatedAt: new Date().toISOString(), validatedBy: me() } } : {}));
          log(me(), "DOSSIER_FAMILIAL_VALIDE", { projet: pid, personnage: key }, "VALIDE");
        },
        requestComplementary: (pid, key) => {
          patchChar(pid, key, (c) => ({ dossier: { ...c.dossier!, complementaryRequestedAt: new Date().toISOString() } }));
          log(me(), "VERIFICATION_COMPLEMENTAIRE_DEMANDEE", { projet: pid, personnage: key }, "EN_ATTENTE");
        },
        resetDossier: (pid, key) => patchChar(pid, key, (c) => ({ dossier: { status: "manquant", deceasedName: c.dossier?.deceasedName ?? "", declaredRole: c.dossier?.declaredRole ?? "" } })),

        /* ---------------------------------------------- licensing */
        requestLicense: (pid, key, voiceId, message) => {
          const p = get().projects[pid];
          const prof = profileOf(voiceId);
          const now = new Date();
          const r: LicenseRequest = {
            id: `r_${id()}`, token: token(), projectId: pid, projectTitle: p.title, characterKey: key, characterName: p.characters[key]?.name ?? key,
            voiceId, creator: me(), message, price: prof?.price ?? 0, sentAt: now.toISOString(), expiresAt: new Date(now.getTime() + EXPIRY_MS).toISOString(),
            status: "envoyee", payment: (prof?.price ?? 0) > 0 ? "en_attente" : "non_requis",
          };
          set((s) => ({ requests: [...s.requests, r] }));
          patch(pid, (pp) => ({ speakerVoices: { ...pp.speakerVoices, [key]: voiceId }, characters: { ...pp.characters, [key]: { ...pp.characters[key], useOriginal: false } } }));
          log(me(), "LICENCE_DEMANDEE", { projet: pid, personnage: key, voix: voiceId }, "ENVOYEE");
          if (prof) notify({ to: prof.accountId, space: "owner", tone: "plain", title: "Nouvelle demande de licence", body: `${me()} · ${p.title} · expire dans 72 h.`, link: "/proprietaire/demandes" });
          return r;
        },
        respondLicense: (t, accept) => {
          const r = get().requests.find((x) => x.token === t);
          if (!r || requestStatus(r) !== "envoyee") return;
          const ref = `LP-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
          set((s) => ({ requests: s.requests.map((x) => (x.token === t ? { ...x, status: accept ? "acceptee" : "refusee", decidedAt: new Date().toISOString(), reference: accept ? ref : undefined } : x)) }));
          const prof = profileOf(r.voiceId);
          log(prof?.publicName ?? r.voiceId, accept ? "LICENCE_ACCEPTEE" : "LICENCE_REFUSEE", { demande: r.id, projet: r.projectId }, accept ? "ACCEPTEE" : "REFUSEE");
          const p = get().projects[r.projectId];
          notify({
            to: p?.accountId ?? "nour", space: "creator", tone: accept ? "ok" : "red",
            title: accept ? `${prof?.publicName} a accepté votre demande` : `${prof?.publicName} a refusé votre demande`,
            body: accept ? `${r.projectTitle} · ${r.characterName}. ${r.price ? `Paiement de ${r.price} DT à confirmer.` : "Licence gratuite."}` : `${r.projectTitle} · choisissez une autre voix ou une voix générée par IA.`,
            link: `/projet/${r.projectId}/voix`,
          });
        },
        payLicense: (rid, success) => {
          set((s) => ({ requests: s.requests.map((x) => (x.id === rid ? { ...x, payment: success ? "confirme" : "echoue", paymentAt: new Date().toISOString() } : x)) }));
          const r = get().requests.find((x) => x.id === rid)!;
          log(me(), success ? "PAIEMENT_CONFIRME" : "PAIEMENT_ECHOUE", { demande: rid, montant: r.price, simule: true }, success ? "CONFIRME" : "ECHOUE");
          notify({ to: meId(), space: "creator", tone: success ? "ok" : "red", title: success ? "Paiement confirmé (simulé)" : "Paiement échoué (simulé)", body: `${r.projectTitle} · ${profileOf(r.voiceId)?.publicName} · ${r.price} DT`, link: "/paiements" });
        },
        expireRequest: (rid) => {
          set((s) => ({ requests: s.requests.map((x) => (x.id === rid ? { ...x, sentAt: new Date(Date.now() - EXPIRY_MS - 60000).toISOString(), expiresAt: new Date(Date.now() - 60000).toISOString() } : x)) }));
          const r = get().requests.find((x) => x.id === rid)!;
          notify({ to: meId(), space: "creator", tone: "warn", title: "Demande expirée après 72 h", body: `${r.projectTitle} · ${profileOf(r.voiceId)?.publicName}. Choisissez une autre voix ou une voix IA.`, link: `/projet/${r.projectId}/voix` });
        },
        assignVoice: (pid, key, voiceId) => {
          patch(pid, (p) => ({ speakerVoices: { ...p.speakerVoices, [key]: voiceId }, characters: { ...p.characters, [key]: { ...p.characters[key], useOriginal: false } } }));
          log(me(), "VOIX_ATTRIBUEE", { projet: pid, personnage: key, voix: voiceId }, kindOf(voiceId) === "ai" ? "IA" : "LICENCE");
        },

        /* ---------------------------------------------- translation & generation */
        applySuggestion: (pid, segId) => {
          const p = get().projects[pid];
          const sug = p?.reviews[segId]?.suggestion;
          if (!sug) return;
          patch(pid, (pp) => ({
            segments: pp.segments.map((x) => (x.id === segId ? { ...x, translation: sug, validated: false } : x)),
            reviews: { ...pp.reviews, [segId]: { verdict: "ok", note: "Correction du LLM 2 appliquée. À approuver.", simulated: true } },
          }));
        },
        reviewAll: (pid) => patch(pid, (p) => ({ reviews: Object.fromEntries(p.segments.map((x) => [x.id, reviewSegment(x)])) })),
        startGeneration: async (pid) => {
          const p0 = get().projects[pid];
          if (!p0 || p0.generation.status === "running") return;
          const slots = slotsOf(get(), p0);
          const lines = p0.segments.filter((x) => x.validated);
          const simMs = GEN_STAGES.reduce((a, st) => a + ("ms" in st ? st.ms : 0), 0);
          patch(pid, () => ({ generation: { status: "running", stage: 0, synthDone: 0, synthTotal: lines.length, startedAt: new Date().toISOString(), etaMs: simMs + lines.length * 900 } }));
          log(me(), "GENERATION_LANCEE", { projet: pid, repliques: lines.length }, "EN_COURS");
          for (const seg of lines) {
            const slot = slots[seg.speaker];
            if (slot?.mode === "original") {
              patch(pid, (p) => ({ gens: { ...p.gens, [seg.id]: { status: "skipped", message: "Voix originale autorisée : son rendu demande le service de clonage vocal, non branché dans ce prototype." } } }));
            } else {
              await generateIn(pid, seg.id);
            }
            patch(pid, (p) => ({ generation: { ...p.generation, synthDone: p.generation.synthDone + 1, etaMs: Math.max(0, (p.generation.etaMs ?? 0) - 900) } }));
          }
          for (let i = 1; i < GEN_STAGES.length; i++) {
            patch(pid, (p) => ({ generation: { ...p.generation, stage: i } }));
            const st = GEN_STAGES[i];
            const ms = "ms" in st ? st.ms : 1000;
            await wait(ms);
            patch(pid, (p) => ({ generation: { ...p.generation, etaMs: Math.max(0, (p.generation.etaMs ?? 0) - ms) } }));
          }
          patch(pid, (p) => ({ generation: { ...p.generation, status: "done", stage: GEN_STAGES.length, finishedAt: new Date().toISOString(), etaMs: 0 } }));
          get().exportPassport(pid);
          const p = get().projects[pid];
          notify({ to: p.accountId, space: "creator", tone: "ok", title: "Rendu prêt", body: `${p.title} · résultat et Passeport 360° disponibles.`, link: `/projet/${pid}/resultat` });
        },

        /* ---------------------------------------------- voice owner */
        createOwnVoice: (profile, sample) => {
          const acc = accountOf(get());
          if (!acc) return;
          const voiceId = `v_user_${acc.id}`;
          set((s) => ({ ownedVoices: { ...s.ownedVoices, [acc.id]: { voiceId, profile: { ...profile, voiceId, accountId: acc.id }, createdAt: new Date().toISOString(), published: true, sample } } }));
          log(acc.name, "PASSEPORT_DE_VOIX_CREE", { voix: voiceId, echantillon_s: sample?.duration ?? 0 }, "CREE");
        },
        updateProfile: (p) => {
          const acc = accountOf(get());
          if (!acc) return;
          set((s) => {
            const ov = s.ownedVoices[acc.id];
            return ov ? { ownedVoices: { ...s.ownedVoices, [acc.id]: { ...ov, profile: { ...ov.profile, ...p } } } } : {};
          });
          log(acc.name, "PROFIL_PUBLIC_MIS_A_JOUR", p, "OK");
        },
      };
    },
    {
      name: "sawti360-demo",
      version: 3,
      storage: createJSONStorage(safeStorage),
      migrate: () => seed() as unknown as Store,
      partialize: (s) => {
        const projects = Object.fromEntries(
          Object.entries(s.projects).map(([pid, p]) => {
            const gens = Object.fromEntries(
              Object.entries(p.gens)
                .filter(([, g]) => g.status !== "pending")
                .map(([k, g]) => [k, g.status === "ok" && !p.example ? { ...g, message: "Audio non conservé après rechargement." } : g]),
            );
            const generation = p.generation.status === "running" ? emptyGen() : p.generation;
            return [pid, { ...p, gens, generation }];
          }),
        );
        return { ...s, projects } as unknown as Store;
      },
    },
  ),
);

/** Profiles of every voice in the library: catalogue holders plus voices created by demo accounts. */
export function allProfiles(s: Pick<Data, "ownedVoices">): VoiceProfile[] {
  const own = Object.values(s.ownedVoices).map((o) => o.profile);
  const ids = new Set(own.map((p) => p.voiceId));
  return [...own, ...VOICES.filter((v) => v.kind === "consentie" && !ids.has(v.voice_id)).map((v) => profileOf(v.voice_id)).filter((x): x is VoiceProfile => Boolean(x))];
}

export { REASONS_FR };
