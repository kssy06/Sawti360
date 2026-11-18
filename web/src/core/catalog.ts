import { sha256Hex } from "./canonical";
import type { Segment, Use, Voice, VoiceLicense } from "./types";

/** Stand-in for the SHA-256 of a signed consent form (only the hash enters the licence). */
const consentHash = (holder: string) => sha256Hex(`formulaire de consentement de démonstration · ${holder}`);

/**
 * Demo catalogue, shared by the browser and the server function.
 * Every holder below is a fictional profile. The audio is rendered with ElevenLabs'
 * built-in synthetic voices, which belong to no real person.
 */

export const PROJECT = {
  id: "le_dernier_car_extrait",
  title: "Le dernier car",
  subtitle: "Court-métrage · extrait de 2 min",
  sourceLang: "Derja tunisienne",
  targetLang: "Français",
};

export const USES: Record<Use, string> = {
  doublage_film: "Doublage de film",
  doublage_video_en_ligne: "Vidéo en ligne (YouTube, Shorts, podcast)",
  bande_annonce: "Bande-annonce",
  publicite: "Publicité",
  contenu_politique: "Contenu politique",
  contenu_intime: "Contenu intime",
};

export const VOICES: Voice[] = [
  {
    voice_id: "v_lina",
    name: "Lina M.",
    kind: "consentie",
    eleven_voice_id: "EXAVITQu4vr4xnSDxMaL",
    description: "Voix féminine posée, chaleureuse. Comédienne de doublage.",
    gender: "femme",
    hue: [352, 18],
  },
  {
    voice_id: "v_sami",
    name: "Sami K.",
    kind: "consentie",
    eleven_voice_id: "JBFqnCBsd6RMkjVDRZzb",
    description: "Voix masculine grave, rythme de conteur. Comédien.",
    gender: "homme",
    hue: [214, 230],
  },
  {
    voice_id: "v_neutre",
    name: "Voix neutre Sawti",
    kind: "neutre",
    eleven_voice_id: "SAz9YHcvj6GT2YYXdXww",
    description: "Voix de synthèse qui n’imite aucune personne. Aucun titulaire à rémunérer.",
    gender: "neutre",
    hue: [40, 70],
  },
  {
    voice_id: "v_hedi",
    name: "Hédi R.",
    kind: "consentie",
    eleven_voice_id: "nPczCjzI2devNBz1zQrb",
    description: "Voix masculine ronde, registre de narration.",
    gender: "homme",
    hue: [22, 36],
  },
  {
    voice_id: "v_maya",
    name: "Maya T.",
    kind: "consentie",
    eleven_voice_id: "XrExE9yKIg1WjnnlVkGX",
    description: "Voix féminine claire, alto. Animatrice de podcast.",
    gender: "femme",
    hue: [92, 112],
  },
];

const base = {
  holder_role: "comédien·ne",
  projects: ["*"],
  no_training: true,
  status: "active" as const,
  revoked_at: null,
  demo: true,
  signature: "",
};

/** Unsigned licences; the platform signs them at start-up (see crypto.ts). */
export const SEED_LICENSES: VoiceLicense[] = [
  {
    ...base,
    license_id: "VL-2026-0001",
    voice_id: "v_lina",
    holder_name: "Lina M.",
    holder_role: "comédienne",
    allowed_uses: ["doublage_film", "doublage_video_en_ligne"],
    forbidden_uses: ["publicite", "contenu_politique", "contenu_intime"],
    forbidden_themes: ["politique", "religion", "publicite"],
    languages: ["fr"],
    valid_from: "2026-11-01",
    valid_until: "2027-10-31",
    owner_share: 0.7,
    consent_evidence_sha256: consentHash("Lina M."),
  },
  {
    ...base,
    license_id: "VL-2026-0002",
    voice_id: "v_sami",
    holder_name: "Sami K.",
    holder_role: "comédien",
    allowed_uses: ["doublage_film", "bande_annonce"],
    forbidden_uses: ["publicite", "contenu_politique"],
    forbidden_themes: ["politique", "intime", "grossierete"],
    languages: ["fr", "en"],
    valid_from: "2026-11-01",
    valid_until: "2027-10-31",
    owner_share: 0.7,
    consent_evidence_sha256: consentHash("Sami K."),
  },
  {
    ...base,
    license_id: "VL-2026-0003",
    voice_id: "v_neutre",
    holder_name: "Sawti 360",
    holder_role: "voix de synthèse, aucune personne",
    allowed_uses: ["doublage_film", "doublage_video_en_ligne", "bande_annonce"],
    forbidden_uses: ["contenu_politique", "contenu_intime"],
    forbidden_themes: [],
    languages: ["fr", "en"],
    valid_from: "2026-01-01",
    valid_until: "2030-12-31",
    owner_share: 0,
    consent_evidence_sha256: "sans objet : voix de synthèse",
  },
  {
    ...base,
    license_id: "VL-2026-0004",
    voice_id: "v_hedi",
    holder_name: "Hédi R.",
    holder_role: "comédien",
    allowed_uses: ["doublage_film"],
    forbidden_uses: ["publicite", "contenu_politique", "contenu_intime"],
    forbidden_themes: ["politique"],
    languages: ["fr"],
    valid_from: "2026-06-01",
    valid_until: "2027-05-31",
    owner_share: 0.7,
    status: "revoked",
    revoked_at: "2026-11-10T09:12:00+00:00",
    consent_evidence_sha256: consentHash("Hédi R."),
  },
  {
    ...base,
    license_id: "VL-2026-0005",
    voice_id: "v_maya",
    holder_name: "Maya T.",
    holder_role: "animatrice",
    allowed_uses: ["doublage_video_en_ligne"],
    forbidden_uses: ["contenu_politique"],
    forbidden_themes: ["alcool_paris"],
    languages: ["fr"],
    valid_from: "2027-01-01",
    valid_until: "2027-12-31",
    owner_share: 0.7,
    consent_evidence_sha256: consentHash("Maya T."),
  },
];

export const SPEAKERS: Record<string, { name: string; defaultVoice: string }> = {
  amel: { name: "Amel", defaultVoice: "v_lina" },
  yassine: { name: "Yassine", defaultVoice: "v_sami" },
};

/** Transcript and machine translation, as the pipeline would hand them to the adapter.
 * Segments 3 and 5 carry the two classic errors the fidelity checker must catch. */
export const SEED_SEGMENTS: Segment[] = [
  { id: "s1", start: 0.4, end: 3.1, speaker: "amel", source: "يا ياسين، الكار يخرج على الخمسة و نص.", confidence: 0.93, translation: "Yassine, le car part à cinq heures et demie.", validated: false },
  { id: "s2", start: 3.4, end: 6.2, speaker: "yassine", source: "ما عنديش وقت، نستناك قدام الدار.", confidence: 0.88, translation: "Je n’ai pas le temps, je t’attends devant la maison.", validated: false },
  { id: "s3", start: 6.8, end: 9.9, speaker: "amel", source: "خلّصت فيه 300 دينار، موش شوية!", confidence: 0.81, translation: "Je l’ai payé 30 dinars, ce n’est pas rien !", validated: false },
  { id: "s4", start: 10.3, end: 12.6, speaker: "yassine", source: "أمي قالتلي نرجع قبل الليل.", confidence: 0.95, translation: "Ma mère m’a dit de rentrer avant la nuit.", validated: false },
  { id: "s5", start: 13.1, end: 15.4, speaker: "amel", source: "ما نخليهمش يسكتونا.", confidence: 0.67, translation: "Je les laisse nous faire taire.", validated: false },
  { id: "s6", start: 15.9, end: 19.2, speaker: "yassine", source: "نحب نوري للعالم الكل شنوة نعملو هوني.", confidence: 0.9, translation: "Je veux montrer au monde entier ce que nous faisons ici.", validated: false },
];

export const MAX_TTS_CHARS = 400;

export function voiceById(id: string): Voice | undefined {
  return VOICES.find((v) => v.voice_id === id);
}
