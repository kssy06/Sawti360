/**
 * Example data of the simulated demo (illustrative): three projects of Nour Films, licence requests,
 * licences, usages, notifications. Moved out of store.ts unchanged, so that the simulated store and
 * scripts/seed.ts (which fills Supabase for the back-end mode) share exactly the same data.
 */
import { appendEntry } from "../core/audit";
import { sha256Hex } from "../core/canonical";
import { PROJECT, SEED_LICENSES, SEED_SEGMENTS } from "../core/catalog";
import { signLicense } from "../core/crypto";
import type { AuditEntry, Segment } from "../core/types";
import { DEMO_ACCOUNTS, profileOf } from "../mock/registry";
import { GEN_STAGES, reviewSegment } from "../mock/simulate";
import { buildPassport } from "./passportBuild";
import type { Data, Generation, Project, UsageRow } from "./store";
import { dossierReference, EXPIRY_MS, type Character, type FamilyDossier, type LicenseRequest } from "./workflow";

export const DEMO_ID = PROJECT.id;

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const at = (iso: string) => new Date(iso);

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

export const emptyGen = (): Generation => ({ status: "idle", stage: 0, synthDone: 0, synthTotal: 0 });

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

export function seed(): Data {
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

