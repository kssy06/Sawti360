/**
 * MOCK DATA LAYER — illustrative only.
 * Public voice profiles, demo accounts and prices. None of this comes from a backend:
 * every holder is a fictional profile and every price is an example, not Sawti's pricing grid
 * (which the specification lists as « à confirmer »).
 */

export type Availability = "disponible" | "indisponible";

export interface VoiceProfile {
  voiceId: string;
  accountId: string;
  publicName: string;
  pseudonym: boolean;
  languages: string[];
  description: string;
  /** Project licence price in Tunisian dinars. 0 means free, as the specification allows. */
  price: number;
  conditions: string;
  availability: Availability;
  sampleText: string;
  tags: string[];
}

export const PROFILES: VoiceProfile[] = [
  {
    voiceId: "v_lina",
    accountId: "lina",
    publicName: "Lina M.",
    pseudonym: false,
    languages: ["Français"],
    description: "Comédienne de doublage. Voix féminine posée et chaleureuse, à l’aise dans les dialogues intimistes et la narration.",
    price: 120,
    conditions: "Licence permanente pour un seul projet. Pas de publicité, pas de contenu politique.",
    availability: "disponible",
    sampleText: "Je veux montrer au monde entier ce que nous faisons ici.",
    tags: ["Dialogue", "Narration"],
  },
  {
    voiceId: "v_sami",
    accountId: "sami",
    publicName: "Sami K.",
    pseudonym: false,
    languages: ["Français", "Anglais"],
    description: "Comédien. Voix masculine grave, rythme de conteur. Courts-métrages et bandes-annonces.",
    price: 0,
    conditions: "Gratuit pour les courts-métrages étudiants et associatifs. Crédit au générique demandé.",
    availability: "disponible",
    sampleText: "Le car part à cinq heures et demie, ne sois pas en retard.",
    tags: ["Conte", "Bande-annonce"],
  },
  {
    voiceId: "v_maya",
    accountId: "maya",
    publicName: "Maya",
    pseudonym: true,
    languages: ["Français"],
    description: "Animatrice de podcast. Voix claire, alto, registre conversationnel.",
    price: 80,
    conditions: "Vidéos en ligne et podcasts uniquement. Licence valide à partir du 1er janvier 2027.",
    availability: "disponible",
    sampleText: "Bienvenue dans ce nouvel épisode, installez-vous confortablement.",
    tags: ["Podcast", "Vidéo en ligne"],
  },
  {
    voiceId: "v_hedi",
    accountId: "hedi",
    publicName: "Hédi R.",
    pseudonym: false,
    languages: ["Français"],
    description: "Comédien. Voix masculine ronde, registre de narration.",
    price: 150,
    conditions: "Licence révoquée par le titulaire le 10 novembre 2026.",
    availability: "indisponible",
    sampleText: "Il était une fois, dans une ville au bord de la mer.",
    tags: ["Narration"],
  },
];

export const profileOf = (voiceId: string) => PROFILES.find((p) => p.voiceId === voiceId);

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  org: string;
  initials: string;
}

/** Two demo accounts: one without a Voice Passport yet, one voice owner who is also a creator. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "nour", name: "Nour Films", email: "nour@exemple.tn", org: "Studio de création · Tunis", initials: "NF" },
  { id: "lina", name: "Lina M.", email: "lina@exemple.tn", org: "Comédienne · propriétaire vocale", initials: "LM" },
];

/** Paragraph a new voice owner reads aloud (Écran 14). Generated per account from a fixed bank. */
const PARAGRAPHS = [
  "Ce matin, le vent venait de la mer et portait l’odeur du jasmin jusqu’à la place. J’ai pris le temps d’écouter la ville se réveiller, les volets qui s’ouvrent, les premiers cafés, et je me suis dit que chaque voix raconte un peu de l’endroit d’où elle vient.",
  "Il y a des histoires qu’on ne raconte qu’une fois, à voix basse, à ceux qu’on aime. Je prête ma voix aujourd’hui pour que d’autres histoires voyagent, à condition qu’on me demande toujours mon accord avant de l’utiliser.",
  "Le train de dix-huit heures longeait la côte, et par la fenêtre on voyait les barques rentrer au port. Ma grand-mère disait que la patience est un voyage qui ne coûte rien, mais qui mène toujours quelque part.",
];
export function paragraphFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return PARAGRAPHS[h % PARAGRAPHS.length];
}
