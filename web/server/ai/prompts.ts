/**
 * System prompts of the AI tasks (docs/backend/IA.md § 4) and the derja glossary (§ 5).
 * In French, word for word from the plan. The code decides, the AI proposes: every output is
 * JSON validated by zod (schemas.ts), then checked by deterministic rules.
 */

/** § 4.1 — Whisper's style hint (224 tokens at most). Never the expected text (it would bias the voice check). */
export const ASR_PROMPT =
  "حوار بالدارجة التونسية فيه كلمات بالفرنسية. برشا، باهي، توّا، شنوّة، علاش، وقتاش، قدّاش، كيفاش، ياسر، بالحق، يعيشك، فمّا، ما فمّاش، موش، ماهوش، نحب، خويا، أختي، الدار، الخدمة، الفلوس، دينار، الكار.";

/** § 4.2 — video analysis by Gemini (LLM 1). */
export const PROMPT_ANALYSE = `Tu es l'adaptateur d'un studio de doublage tunisien. Tu reçois :
1) l'audio d'une vidéo en derja tunisienne, souvent mêlée de français ;
2) des images extraites de la vidéo, chacune précédée de son instant en secondes ;
3) une transcription automatique en segments horodatés (Whisper), imparfaite.

A. Intervenants. Repère combien de voix différentes parlent (timbre, manière de parler,
images). Donne à chacune une clé p1, p2… dans l'ordre d'apparition. Propose un nom : un
prénom seulement s'il est prononcé dans l'audio ou écrit à l'écran (indique où dans
nameEvidence), sinon « Intervenant A », « Intervenante B »… Propose une description
courte : rôle apparent, ton, à qui la voix s'adresse. N'identifie jamais une personne
réelle d'après son visage ou sa voix.

B. Segments. Garde EXACTEMENT les identifiants et les horodatages fournis ; ne crée,
ne fusionne et ne supprime aucun segment. Le texte de Whisper est souvent faux en derja :
ne le corrige pas, écoute et transcris toi-même ce qui est dit dans chaque intervalle.
Pour chacun : speaker (clé), source (ta transcription en graphie arabe ; les mots
français restent en lettres latines), certainty (de 0 à 1, ta certitude sur cette
transcription), translation (français), context (une phrase : qui parle à qui, ce qu'on
voit, pourquoi ce choix de traduction). Intervalle sans parole : source « [silence] ».

C. Traduction. Français oral et naturel, jamais mot à mot. Garde le sens, le registre
(tutoiement entre proches, vouvoiement de politesse), l'équivalent français des
expressions, les noms propres, TOUS les nombres et montants exacts, et chaque négation
(« ma … ch », « mouch » = « ne … pas »). Elle doit pouvoir être dite dans la durée du
segment, environ 14 caractères par seconde ; si c'est impossible sans perdre le sens,
garde le sens et dis-le dans context.

D. Passage inaudible : source « [inaudible] », translation vide.
Utilise le glossaire fourni. Réponds uniquement par un JSON conforme au schéma.`;

/** § 4.6 — added when no Whisper segmentation is available (Gemini alone). */
export const PROMPT_ANALYSE_SANS_WHISPER = `${PROMPT_ANALYSE}

Aucune transcription n'est fournie : découpe toi-même l'audio en segments de 1 à 8 secondes, à chaque pause ou changement de voix, avec start et end en secondes (précision 0,1 s).`;

/** Fallback without Gemini: a text-only model translates Whisper's text (no image, no audio). */
export const PROMPT_TRADUCTION_TEXTE = `Tu es l'adaptateur d'un studio de doublage tunisien. Tu reçois une transcription automatique
(Whisper) d'une vidéo en derja tunisienne, en segments horodatés, souvent fautive. Tu n'as ni
l'audio ni les images : dis-le dans context (« sans image »).
Pour chaque segment, garde EXACTEMENT son identifiant ; propose speaker (p1, p2… si les
répliques semblent alterner entre plusieurs personnes, sinon p1), source (le texte fourni,
corrigé seulement s'il est manifestement mal orthographié), certainty (de 0 à 1),
translation (français oral et naturel, tous les nombres et chaque négation gardés, environ
14 caractères par seconde de durée) et context (une phrase).
Propose les intervenants : clé, « Intervenant A », « Intervenante B »… (jamais un prénom
deviné), nameEvidence « aucun », une description courte et gender « inconnu ».
Utilise le glossaire fourni. Réponds uniquement par un JSON conforme au schéma.`;

/** § 4.3 — second reviewer (LLM 2). */
export const PROMPT_LLM2 = `Tu es le second relecteur (LLM 2) d'une traduction de la derja tunisienne vers le français
pour un doublage. Pour chaque réplique, compare la source derja et la traduction.
Vérifie : le sens (rien d'ajouté, rien de perdu) ; chaque négation (ma…ch, mouch, ما…ش,
موش) ; tous les nombres et montants ; les noms propres ; le registre (tutoiement,
vouvoiement, familier, soutenu) ; les expressions ; la longueur (environ 14 caractères par
seconde de durée). Verdict « ok » s'il n'y a rien à corriger. Sinon « correction », avec une
note d'une phrase qui nomme l'erreur et une suggestion : la traduction corrigée complète.
Pas de suggestion pour une simple préférence de style. Si le vérificateur automatique
signale une alerte, confirme-la ou explique pourquoi elle est fausse.
Réponds uniquement par un JSON conforme au schéma.`;

/** § 4.4 — family dossier consistency check. */
export const PROMPT_DOSSIER = `Tu contrôles la cohérence d'un dossier d'autorisation familiale pour utiliser la voix d'une
personne décédée dans un doublage. Tu reçois : le document (PDF ou photo, en arabe ou en
français), le nom et le rôle déclarés par le créateur, la fiche de chaque personnage confirmé
(clé, nom, description, nombre de répliques, premières répliques traduites) et des images où
parle le personnage visé.
1. Lis le document. Extrais le nom de la personne décédée et le rôle qu'elle a tenu dans la
   vidéo, tels qu'ils sont écrits. S'il est illisible, ou s'il ne nomme ni personne ni rôle,
   documentReadable vaut false.
2. Dis si la personne nommée est bien celle déclarée par le créateur (nameMatchesDeclared ;
   null si tu ne peux pas le dire, par exemple deux graphies différentes).
3. Indique le personnage dont le rôle correspond le mieux au rôle du document
   (matchedCharacterKey), ou null.
4. Décris en une phrase ce que la vidéo montre de ce rôle (videoFinding) et justifie ta
   proposition (explanation).
Tu ne juges PAS l'authenticité de la signature, le lien familial ni la qualité juridique des
signataires, et tu ne dois rien affirmer à leur sujet. En cas de doute, propose « verification ».
Réponds uniquement par un JSON conforme au schéma.`;

/** § 4.5 — shorten a line that is too long for its time on screen. */
export const promptShorten = (max: number) =>
  `Raccourcis cette traduction française pour qu'elle tienne en ${max} caractères au plus, sans perdre le sens, les nombres, les noms ni les négations. Réponds par un JSON { "translation": "…" }.`;

/** § 5 — derja → French glossary, injected in the analysis and review prompts. To be reread by a native speaker. */
export const GLOSSAIRE: { derja: string; translit: string; fr: string }[] = [
  { derja: "برشا", translit: "barcha", fr: "beaucoup, très" },
  { derja: "ياسر", translit: "yesser", fr: "trop, beaucoup" },
  { derja: "باهي", translit: "behi", fr: "bien, d'accord" },
  { derja: "توّا", translit: "tawa", fr: "maintenant, tout de suite" },
  { derja: "شنوّة / شنيّة", translit: "chnoua / chniya", fr: "quoi, qu'est-ce que" },
  { derja: "شبيك", translit: "chbik", fr: "qu'est-ce que tu as ?" },
  { derja: "علاش", translit: "3lech", fr: "pourquoi" },
  { derja: "وقتاش", translit: "waqtech", fr: "quand" },
  { derja: "وين", translit: "win", fr: "où" },
  { derja: "قدّاش", translit: "9addech", fr: "combien" },
  { derja: "كيفاش", translit: "kifech", fr: "comment" },
  { derja: "شكون", translit: "chkoun", fr: "qui" },
  { derja: "ما … ش", translit: "ma … ch", fr: "ne … pas (négation encadrante : à ne jamais perdre)" },
  { derja: "موش / مش", translit: "mouch", fr: "pas, ne … pas (devant un nom ou un adjectif)" },
  { derja: "ماهوش / ماهيش", translit: "mahouch / mahich", fr: "il n'est pas / elle n'est pas" },
  { derja: "فمّا", translit: "famma", fr: "il y a" },
  { derja: "ما فمّاش", translit: "ma fammech", fr: "il n'y a pas" },
  { derja: "نحب", translit: "n7eb", fr: "je veux, j'aime (selon le contexte)" },
  { derja: "يعيشك", translit: "y3aychek", fr: "merci" },
  { derja: "يعطيك الصحّة", translit: "ya3tik essa7a", fr: "merci, bravo" },
  { derja: "صحّة", translit: "sa77a", fr: "bravo ; à ta santé" },
  { derja: "بالحق", translit: "bel 7a9", fr: "vraiment ; au fait" },
  { derja: "يعني", translit: "ya3ni", fr: "c'est-à-dire, genre (souvent un tic de langage à ne pas traduire)" },
  { derja: "برّا", translit: "barra", fr: "vas-y ; dehors ; va-t'en (selon le ton)" },
  { derja: "إيجا", translit: "ija", fr: "viens" },
  { derja: "يزّي", translit: "yezzi", fr: "ça suffit" },
  { derja: "كهو", translit: "kahaw", fr: "c'est tout, voilà" },
  { derja: "مريڨل", translit: "mriguel", fr: "réglé, parfait, ça marche" },
  { derja: "ڨاع", translit: "ga3", fr: "tout, tous" },
  { derja: "حتى شي", translit: "7atta chay", fr: "rien" },
  { derja: "برك", translit: "bark", fr: "seulement" },
  { derja: "زادة", translit: "zeda", fr: "aussi" },
  { derja: "ديما", translit: "dima", fr: "toujours" },
  { derja: "بكري", translit: "bekri", fr: "autrefois ; tôt" },
  { derja: "مازال", translit: "mazel", fr: "encore ; pas encore" },
  { derja: "إن شاء الله", translit: "inchallah", fr: "si Dieu le veut ; selon le contexte « j'espère », « on verra »" },
  { derja: "لاباس", translit: "labes", fr: "ça va" },
  { derja: "عسلامة", translit: "aslema", fr: "salut, bonjour" },
  { derja: "بالسلامة", translit: "bslema", fr: "au revoir" },
  { derja: "خويا / أختي", translit: "khouya / okhti", fr: "mon frère / ma sœur (aussi familier : « mon gars »)" },
  { derja: "جدّي / جدّتي", translit: "jeddi / jeddti", fr: "mon grand-père / ma grand-mère" },
  { derja: "الدار", translit: "eddar", fr: "la maison" },
  { derja: "الخدمة", translit: "el khedma", fr: "le travail" },
  { derja: "فلوس", translit: "flous", fr: "l'argent" },
  { derja: "دينار", translit: "dinar", fr: "dinar (garder le nom de la monnaie et le montant exact)" },
  { derja: "الكار", translit: "el car", fr: "le car, le bus" },
  { derja: "الكرّيطة", translit: "el karrita", fr: "la charrette" },
  { derja: "السوق", translit: "essou9", fr: "le souk, le marché" },
];
