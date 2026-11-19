# Intelligence artificielle : fournisseurs, prompts, schémas

Choix faits le 19 novembre 2026 pour un prototype **gratuit d'abord**, utilisé par le jury seul,
sans contrainte de confidentialité (décision de l'équipe). Les signatures d'appel ci-dessous
ont été vérifiées dans les types des SDK installés : `groq-sdk` 1.6.0, `@google/genai` 3.6.1,
`@anthropic-ai/sdk` 1.10.0, `@elevenlabs/elevenlabs-js` 2.79.0, `mediabunny` 1.66.1.
Les quotas gratuits viennent de sites tiers quand le site officiel n'était pas lisible :
les confirmer dans chaque console en créant les clés.

## 1. Fournisseurs retenus

| Tâche | Principal | Repli 1 | Repli 2 | Coût |
| --- | --- | --- | --- | --- |
| Transcription derja (les mots) | **Gemini**, depuis l'audio, dans l'appel d'analyse | `gemini-3.5-transcribe` s'il prend l'arabe (à départager en B0) | — | gratuit |
| Découpage temporel (bornes des prises de parole) | **Groq** `whisper-large-v3` : on garde ses horodatages, pas ses mots | Gemini seul (horodatage par Gemini, § 4.6) | — | gratuit |
| Intervenants, personnages, transcription corrigée, **traduction LLM 1** avec contexte visuel | **Gemini** Flash (audio + images + segments, un seul appel) | Groq LLM, texte seul (contexte « sans image ») | exemple simulé, étiqueté | gratuit |
| **Relecture LLM 2** | **Claude** si `ANTHROPIC_API_KEY` | Groq LLM (gros modèle ouvert) | règles seules (`checkFidelity`) | Claude payant, Groq gratuit |
| Dossier familial : lire le document, comparer le rôle | **Gemini** (PDF et images en entrée) | Claude (PDF natif) si clé | « Vérification nécessaire » | gratuit |
| Contrôle de l'échantillon de voix (texte lu) | **Groq** `whisper-large-v3`, langue `fr` + WER calculé par nous | mesures seules (durée, niveau) | — | gratuit |
| Voix françaises | **ElevenLabs** `eleven_multilingual_v2` (déjà branché) | mode test `SAWTI_TTS_MOCK=1` (audio silencieux signalé) | — | 10 000 crédits/mois gratuits |
| Clonage d'une voix consentie (P2) | ElevenLabs IVC (plan Starter, ~5–6 $) | — | — | payant |

Pourquoi ce partage :
- **Whisper, tel quel, écrit mal la derja** : 85 % de mots faux pour `whisper-large-v3` sur le
  test tunisien de NADI 2026 (21,6 % après adaptation), de 50 % à plus de 100 % dans l'étude
  LinTO, et il perd les mots français. On ne garde donc de Groq Whisper que ses **bornes
  temporelles** (gratuit, rapide, accepte une URL). C'est **Gemini**, meilleur système d'une
  comparaison de 2026 sur l'arabe dialectal (27,6 % de WER, pas spécifique au tunisien), qui
  écrit les mots en écoutant l'audio. Le choix final se fait sur nos extraits (B0, § 8.0).
- **Gemini** est le seul gratuit qui **entend l'audio et voit les images** dans le même appel :
  c'est ce qui permet de savoir qui parle à qui, de choisir tutoiement ou vouvoiement et de
  repérer un prénom écrit à l'écran (« l'IA voit la vidéo »).
- **Deux familles de modèles** pour LLM 1 et LLM 2 : une relecture par un modèle différent
  attrape des erreurs que le premier ne voit pas. Claude lit bien la derja (graphie arabe et
  arabizi) mais son API ne prend ni audio ni vidéo : il est à sa place en relecture et pour
  lire des documents.
- **Le code décide, l'IA propose** : sorties en JSON validées par zod, règles déterministes
  après chaque proposition sensible (dossier familial, § 4.4 ; échantillon de voix, § 6).

Variables (valeurs par défaut) :

| Variable | Défaut | Remarque |
| --- | --- | --- |
| `GROQ_ASR_MODEL` | `whisper-large-v3` | `whisper-large-v3-turbo` est plus rapide mais moins précis |
| `GROQ_LLM_MODEL` | `openai/gpt-oss-120b` | à confirmer dans la liste des modèles de la console Groq |
| `GEMINI_MODEL` | `gemini-3.8-flash` | identifiant cité par le SDK `@google/genai` 3.6.1 ; confirmer dans AI Studio |
| `GEMINI_MODEL_DEV` | un modèle Flash-Lite (ex. `gemini-3.5-flash-lite`, cité par le SDK) | quotas gratuits plus larges : à utiliser pendant le développement |
| `GEMINI_ASR_MODEL` | vide (= `GEMINI_MODEL`, transcription dans l'appel d'analyse) | `gemini-3.5-transcribe` si B0 le désigne : diarisation et horodatages par mot ; son mode d'appel est à lire sur sa page de documentation |
| `CLAUDE_MODEL` | `claude-opus-5-5` | 4 $ / 20 $ par million de jetons (entrée / sortie) ; `claude-haiku-5-5` coûte 0,10 $ / 0,50 $ : choix de l'équipe |
| `TTS_MODEL` | `eleven_multilingual_v2` | modèle déjà utilisé par `api/tts.ts` |

## 1 bis. Est-ce le meilleur pour la derja ?

Réponse honnête : ce sont les meilleurs choix **gratuits et prêts pour vendredi**, pas des
meilleurs absolus prouvés. Aucune étude publiée ne compare Gemini, Whisper, ElevenLabs et
Claude sur la derja ; la seule preuve sera le test B0 sur nos propres extraits.

| Tâche | Notre choix | Ce que disent les études | Mieux, avec du temps ou un budget |
| --- | --- | --- | --- |
| Transcription derja | Gemini écrit les mots, Whisper donne les bornes | Gemini 3.5 Flash en tête d'une comparaison de 2026 sur l'arabe dialectal (27,6 % de WER, pas spécifique au tunisien). Whisper large-v3 tel quel : 85 % de WER sur le tunisien. | Un Whisper **affiné sur le tunisien** : 14 à 22 % de WER à NADI 2026 après adaptation. Modèles ouverts : FarukSTT (large-v3 tunisien), `TuniSpeech-AI/whisper-tunisian-dialect` (large-v2, 21 h de tunisien), `whisper-small-tunisian-derja` (mots français compris, 30 % de WER, tourne sur CPU). Demande notre propre serveur (B9). |
| Traduction derja → français | Gemini (LLM 1), Claude ou Groq (LLM 2) | Seule étude trouvée (2025, tunisien → anglais) : Gemini et GPT en tête ; Claude non évalué. TounsiBench : la plupart des LLM peinent sur le tunisien. | Gemini Pro (payant) plutôt que Flash ; comparer Gemini et Claude sur 20 répliques notées à l'aveugle par deux locuteurs natifs (B0). |
| Qui parle (intervenants) | Gemini | Pas de mesure sur la derja ; séparer les voix dépend peu de la langue. | `gemini-3.5-transcribe` (diarisation, horodatages par mot) ou ElevenLabs Scribe v3 (diarisation, langue secondaire français), à départager en B0. |
| Voix françaises | ElevenLabs | Le français n'est pas la difficulté ; ElevenLabs est une référence. | — |
| Voix en derja (sens inverse, hors prototype) | — | Peu de modèles | `f5-tts-tn` (F5-TTS affiné sur le tunisien, licence à vérifier), voix Azure ar-TN. |

## 2. Quotas gratuits : tactique

1. **Un seul appel Gemini par analyse** (intervenants, personnages, transcription corrigée et
   traduction ensemble) et un par dossier familial.
2. **Cache** : `projects.audio_hash` ; la même empreinte audio n'est jamais réanalysée.
3. **Développement sur `GEMINI_MODEL_DEV`** et en mode test pour la voix (`SAWTI_TTS_MOCK=1`) ;
   Flash et la vraie voix pour la démo.
4. **Projets de démonstration pré-calculés** (`scripts/seed.ts`) : le jour J, une seule analyse
   est lancée en direct.
5. Si un quota bloque : facturation du projet AI Studio (quelques centimes par analyse),
   ElevenLabs Starter, crédit Anthropic de 5 $ (README § 5).

Ordre de grandeur pour la relecture d'un extrait de 30 répliques par Claude Opus 5.5 :
~5 000 jetons en entrée et ~3 000 en sortie, réflexion comprise, soit environ 0,08 $ ;
5 $ couvrent une soixantaine de relectures. Estimation, à vérifier sur la console Anthropic.

## 3. Pipeline d'analyse

Entrées envoyées par le navigateur (ARCHITECTURE.md § 4.2) : audio Ogg/Opus mono 16 kHz,
60 images JPEG au plus avec leur instant, durée, format, titre.

1. **Groq Whisper découpe** (`verbose_json`, segments) et on garde ses bornes : pour chaque
   segment, `id = "s" + (index + 1)`, `start`, `end` arrondis à 0,01 s ; on écarte ceux dont
   `no_speech_prob > 0,6` et on fusionne ceux de moins de 0,6 s avec leur voisin. Le texte de
   Whisper n'est transmis qu'à titre d'indice : il est souvent faux en derja.
2. **Gemini écrit** : il reçoit l'audio, les images (chacune précédée de « Image à 12,0 s : »)
   et les bornes ; il transcrit lui-même chaque intervalle, attribue l'intervenant, traduit et
   renvoie `AnalysisOut` (§ 4.2). Un intervalle sans parole (Whisper en invente parfois)
   revient avec `source = "[silence]"` et est retiré.
3. **Contrôles du code** sur la sortie :
   - on garde exactement les identifiants et les horodatages de Whisper : un segment absent de
     la réponse garde le texte de Whisper avec une traduction vide et la note « non traduit » ;
   - un intervenant inconnu est rattaché à `p1` avec une note ;
   - `confidence = certainty` de Gemini, bornée à [0, 1] : un indicateur estimé par le modèle,
     non calibré, présenté comme tel dans l'interface ;
   - `fits = traduction.length / 14 ≤ (end − start) + 0,2` (`FR_CHARS_PER_SECOND`) ;
   - personnages : `{ key, proposedName, proposedDescription, name: proposedName,
     description: proposedDescription, confirmed: false, useOriginal: false, lifeStatus: "a_renseigner" }`.
4. **LLM 2** relit toutes les répliques (§ 4.3) ; on fusionne avec `checkFidelity()` : si les
   règles signalent un chiffre ou une négation que le LLM 2 juge correct, la note devient
   « Le vérificateur automatique signale … : à relire ».
5. Écriture du projet : `segments`, `speakers`, `characters`, `proposals` (= traductions LLM 1),
   `reviews`, `pipeline: { status: "done", step: 5, simulated: false }`.

Changements de types à faire (B4, B5, D3) : `Review.simulated`, `FamilyCheck.simulated` et
`Pipeline.simulated` passent de `true` à `boolean`, avec un champ `provider?: string`
(nom du modèle) ; l'interface affiche « Réel » quand `simulated` est faux.

## 4. Prompts et schémas de sortie

Les prompts sont en français ; ils vivent dans `web/server/ai/prompts.ts`, les schémas dans
`web/server/ai/schemas.ts`. Préférer `.nullable()` à `.optional()` : mieux accepté par les
sorties structurées des trois fournisseurs.

### 4.1 Amorce de transcription (Whisper, paramètre `prompt`)

Whisper s'en sert comme d'un contexte de style et de vocabulaire (224 jetons au plus).
Ne **jamais** y mettre le texte attendu (cela fausserait le contrôle de l'échantillon, § 6).

```text
حوار بالدارجة التونسية فيه كلمات بالفرنسية. برشا، باهي، توّا، شنوّة، علاش، وقتاش، قدّاش، كيفاش، ياسر، بالحق، يعيشك، فمّا، ما فمّاش، موش، ماهوش، نحب، خويا، أختي، الدار، الخدمة، الفلوس، دينار، الكار.
```

### 4.2 Analyse vidéo (Gemini, LLM 1)

```text
Tu es l'adaptateur d'un studio de doublage tunisien. Tu reçois :
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
Utilise le glossaire fourni. Réponds uniquement par un JSON conforme au schéma.
```

```ts
export const AnalysisOut = z.object({
  speakers: z.array(z.object({
    key: z.string(),                       // p1, p2…
    proposedName: z.string(),
    nameEvidence: z.string(),              // « prononcé à 00:12 », « écrit à l'écran à 00:03 », « aucun »
    proposedDescription: z.string(),
    gender: z.enum(["femme", "homme", "inconnu"]),
  })),
  segments: z.array(z.object({
    id: z.string(),
    speaker: z.string(),
    source: z.string(),                    // « [silence] » si l'intervalle ne contient pas de parole
    certainty: z.number(),                 // 0 à 1, estimée par le modèle
    translation: z.string(),
    context: z.string(),
  })),
});
```

Message utilisateur : l'audio, puis les images, puis
`JSON.stringify({ titre, format, duree, glossaire, segments: [{ id, start, end, texte }] })`.

### 4.3 Relecture (LLM 2)

```text
Tu es le second relecteur (LLM 2) d'une traduction de la derja tunisienne vers le français
pour un doublage. Pour chaque réplique, compare la source derja et la traduction.
Vérifie : le sens (rien d'ajouté, rien de perdu) ; chaque négation (ma…ch, mouch, ما…ش,
موش) ; tous les nombres et montants ; les noms propres ; le registre (tutoiement,
vouvoiement, familier, soutenu) ; les expressions ; la longueur (environ 14 caractères par
seconde de durée). Verdict « ok » s'il n'y a rien à corriger. Sinon « correction », avec une
note d'une phrase qui nomme l'erreur et une suggestion : la traduction corrigée complète.
Pas de suggestion pour une simple préférence de style. Si le vérificateur automatique
signale une alerte, confirme-la ou explique pourquoi elle est fausse.
Réponds uniquement par un JSON conforme au schéma.
```

```ts
export const ReviewOut = z.object({
  reviews: z.array(z.object({
    id: z.string(),
    verdict: z.enum(["ok", "correction"]),
    note: z.string(),
    suggestion: z.string().nullable(),
  })),
});
```

Entrée : `{ repliques: [{ id, source, translation, context, duree, alertes }] }` où
`alertes` vient de `checkFidelity()`.

### 4.4 Dossier familial (contrôle de cohérence)

```text
Tu contrôles la cohérence d'un dossier d'autorisation familiale pour utiliser la voix d'une
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
Réponds uniquement par un JSON conforme au schéma.
```

```ts
export const DossierOut = z.object({
  documentReadable: z.boolean(),
  extractedPerson: z.string(),            // "" si absent
  extractedRole: z.string(),              // "" si absent
  nameMatchesDeclared: z.boolean().nullable(),
  matchedCharacterKey: z.string().nullable(),
  proposedOutcome: z.enum(["correspondance", "incoherence", "verification"]),
  videoFinding: z.string(),
  explanation: z.string(),
});
```

**Règles déterministes appliquées ensuite par le code** (`server/ai/dossier.ts`), dans l'ordre :

| Condition | Résultat |
| --- | --- |
| `documentReadable` faux ou `extractedRole` vide | `verification` |
| `nameMatchesDeclared === false` | `incoherence` (« le document nomme une autre personne ») |
| `matchedCharacterKey` renseigné et différent du personnage visé | `incoherence` |
| `matchedCharacterKey` = personnage visé **et** `proposedOutcome = "correspondance"` | `correspondance` |
| tous les autres cas | `verification` |

Le résultat devient un `FamilyCheck` (`outcome`, `extractedPerson`, `extractedRole`,
`videoFinding`, `explanation`, `at`, `simulated: false`, `provider`). Une correspondance
exige l'accord de l'IA **et** des règles ; la validation reste humaine.

### 4.5 Raccourcir une réplique trop longue

```text
Raccourcis cette traduction française pour qu'elle tienne en {max} caractères au plus, sans
perdre le sens, les nombres, les noms ni les négations. Réponds par un JSON { "translation": "…" }.
```

Utilisé par la génération (ajustement du débit) : la version courte est proposée comme
suggestion du LLM 2, jamais appliquée sans approbation.

### 4.6 Transcription de repli (Gemini seul, si Groq échoue)

On ajoute au prompt § 4.2 : « Aucune transcription n'est fournie : découpe toi-même l'audio en
segments de 1 à 8 secondes, à chaque pause ou changement de voix, avec start et end en
secondes (précision 0,1 s). » et au schéma, pour chaque segment, `start: z.number()`,
`end: z.number()`. Les identifiants `s1, s2…` sont alors attribués par le code. Les
horodatages sont moins fiables : la confiance affichée est fixée à 0,5 et la source « Gemini ».

## 5. Glossaire derja → français

Injecté dans les prompts § 4.2 et § 4.3. **À relire par un locuteur natif de l'équipe avant la démo.**

| Derja | Translittération | Français |
| --- | --- | --- |
| برشا | barcha | beaucoup, très |
| ياسر | yesser | trop, beaucoup |
| باهي | behi | bien, d'accord |
| توّا | tawa | maintenant, tout de suite |
| شنوّة / شنيّة | chnoua / chniya | quoi, qu'est-ce que |
| شبيك | chbik | qu'est-ce que tu as ? |
| علاش | 3lech | pourquoi |
| وقتاش | waqtech | quand |
| وين | win | où |
| قدّاش | 9addech | combien |
| كيفاش | kifech | comment |
| شكون | chkoun | qui |
| ما … ش | ma … ch | ne … pas (négation encadrante : à ne jamais perdre) |
| موش / مش | mouch | pas, ne … pas (devant un nom ou un adjectif) |
| ماهوش / ماهيش | mahouch / mahich | il n'est pas / elle n'est pas |
| فمّا | famma | il y a |
| ما فمّاش | ma fammech | il n'y a pas |
| نحب | n7eb | je veux, j'aime (selon le contexte) |
| يعيشك | y3aychek | merci |
| يعطيك الصحّة | ya3tik essa7a | merci, bravo |
| صحّة | sa77a | bravo ; à ta santé |
| بالحق | bel 7a9 | vraiment ; au fait |
| يعني | ya3ni | c'est-à-dire, genre (souvent un tic de langage à ne pas traduire) |
| برّا | barra | vas-y ; dehors ; va-t'en (selon le ton) |
| إيجا | ija | viens |
| يزّي | yezzi | ça suffit |
| كهو | kahaw | c'est tout, voilà |
| مريڨل | mriguel | réglé, parfait, ça marche |
| ڨاع | ga3 | tout, tous |
| حتى شي | 7atta chay | rien |
| برك | bark | seulement |
| زادة | zeda | aussi |
| ديما | dima | toujours |
| بكري | bekri | autrefois ; tôt |
| مازال | mazel | encore ; pas encore |
| إن شاء الله | inchallah | si Dieu le veut ; selon le contexte « j'espère », « on verra » |
| لاباس | labes | ça va |
| عسلامة | aslema | salut, bonjour |
| بالسلامة | bslema | au revoir |
| خويا / أختي | khouya / okhti | mon frère / ma sœur (aussi familier : « mon gars ») |
| جدّي / جدّتي | jeddi / jeddti | mon grand-père / ma grand-mère |
| الدار | eddar | la maison |
| الخدمة | el khedma | le travail |
| فلوس | flous | l'argent |
| دينار | dinar | dinar (garder le nom de la monnaie et le montant exact) |
| الكار | el car | le car, le bus |
| الكرّيطة | el karrita | la charrette |
| السوق | essou9 | le souk, le marché |

## 6. Contrôle de l'échantillon de voix (Passeport de voix, écrans 14 à 16)

1. Mesures déjà réelles dans `Recorder` : durée ≥ 8 s (3 s sur la page de consentement),
   niveau maximal > 5 %, pas de saturation (< 99 %).
2. Transcription de l'enregistrement par Groq Whisper, `language: "fr"`, **sans** amorce.
3. Normalisation des deux textes : minuscules, accents retirés, ponctuation retirée, espaces
   réduits ; WER = distance de Levenshtein entre les mots / nombre de mots du paragraphe.
4. Résultat :

| WER | Résultat affiché | Effet |
| --- | --- | --- |
| ≤ 0,25 | Correspondance avec le texte lu | Passeport créé |
| 0,25 à 0,5 | À vérifier | Passeport créé, signalé au titulaire |
| > 0,5, ou mesures non conformes | Non conforme | Demande de réenregistrement |

5. On range `transcript`, `wer` et le résultat dans `voice_profiles.sample`. Le contrôle dit si
   le texte attendu a été lu ; il ne prouve pas l'identité de la personne (spéc. § 5).

## 7. Voix françaises (ElevenLabs)

- Synthèse : la logique d'`api/tts.ts` (moteur de règles, filtre, appel ElevenLabs) devient
  `server/ai/elevenlabs.ts` ; elle reçoit les licences de la base au lieu du registre en dur.
- Modèle `eleven_multilingual_v2` ; voix du catalogue (`src/core/catalog.ts`) pour les voix IA
  de Sawti ; `voice_profiles.eleven_voice_id` pour une voix de titulaire.
- **Durée** : appeler la variante « avec horodatages » de la synthèse ; la fin du dernier
  caractère donne la durée exacte sans décoder le MP3.
- **Débit** : `voice_settings.speed` (champ présent dans le SDK) ; on reste entre 1,0 et 1,15
  pour garder une voix naturelle (la plage permise est plus large : vérifier la documentation).
- Coût : environ un crédit par caractère ; 10 000 crédits par mois en gratuit.
- **Clonage (P2)** : `voices.ivc.create({ name, files, removeBackgroundNoise, description, labels })`
  (SDK 2.79.0) à partir de l'échantillon que le titulaire a enregistré lui-même. Voix originale
  d'une personne autorisée : segments de cette voix découpés dans le navigateur (30 s au moins
  conseillées). Suppression de la voix chez ElevenLabs à la révocation.
- **Option à évaluer** : ElevenLabs Scribe v3 (`speechToText.convert`, `modelId: "scribe_v3"`)
  sait séparer les voix (`diarize`, `numSpeakers`), accepte des langues secondaires (derja +
  français) et une liste de termes (`keyterms`) ; à comparer à Whisper dans Sawti-Bench si
  l'équipe prend le plan Starter.

## 8. Mesurer sur nos extraits

### 8.0 Test express B0 (P0, 1 h, avant de figer B3)

Cinq à dix extraits de 10 à 30 s, tournés par l'équipe jeudi soir (deux voix, mots français
compris), avec une transcription de référence écrite à la main en graphie arabe.

- **Transcription** : Gemini Flash (prompt § 4.6), `gemini-3.5-transcribe` si l'arabe figure
  dans sa liste de langues, Groq Whisper ; en option, `whisper-small-tunisian-derja-ct2` en local
  avec faster-whisper (CPU). WER et CER par `sawti/bench.py`, et coup d'œil aux bornes temporelles.
- **Traduction** : 20 répliques traduites par Gemini et par Claude, présentées sans le nom du
  modèle à deux membres natifs, notées de 1 à 5 sur le sens, le naturel et le registre.
- On retient la meilleure configuration (variables d'IA.md § 1) et on range les chiffres, avec
  la date et l'effectif, dans `results/sawti-bench.json`.

### 8.1 Sawti-Bench minimal (P1)

Objectif : remplacer « à mesurer » par une mesure honnête, même défavorable.

1. 10 à 20 extraits de 5 à 15 s, voix de l'équipe en derja (consentement écrit), variés :
   Tunis, Sfax, Sud, avec et sans mots français.
2. Transcription de référence écrite à la main en graphie arabe (`data/bench/<id>.wav` + `<id>.txt`,
   format déjà prévu par `sawti/bench.py`).
3. Hypothèses de chaque fournisseur (Groq Whisper, Gemini, Scribe v3 si disponible) rangées
   dans `results/bench/<fournisseur>/<id>.txt`.
4. WER et CER calculés par `sawti/bench.py` (normalisation documentée dans le fichier).
5. Résultat dans `results/sawti-bench.json` : `{ date, n, extraits, fournisseurs: { nom: { wer, cer, mots } } }`,
   lu par l'onglet Sawti-Bench du centre de confiance, avec la date et l'effectif.

## 9. Code de référence

```ts
// Groq : découpage temporel (server/ai/groq.ts) ; on garde start/end, le texte n'est qu'un indice
import Groq from "groq-sdk";
const groq = new Groq({ apiKey: env.GROQ_API_KEY });
const tr = await groq.audio.transcriptions.create({
  url: signedAudioUrl,                     // URL signée Supabase : Groq télécharge lui-même
  model: env.GROQ_ASR_MODEL,               // "whisper-large-v3"
  language: "ar",
  response_format: "verbose_json",
  timestamp_granularities: ["segment"],
  prompt: ASR_PROMPT,
  temperature: 0,
});
// Le type du SDK ne déclare que `text` : les segments de verbose_json se lisent ainsi.
const segments = (tr as unknown as {
  segments: { start: number; end: number; text: string; avg_logprob: number; no_speech_prob: number }[];
}).segments;
```

```ts
// Gemini : analyse multimodale (server/ai/gemini.ts)
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(AnalysisOut) as Record<string, unknown>;
const res = await ai.models.generateContent({
  model: env.GEMINI_MODEL,
  contents: [{
    role: "user",
    parts: [
      { inlineData: { mimeType: "audio/ogg", data: audioBase64 } },
      ...frames.flatMap((f) => [
        { text: `Image à ${f.t.toFixed(1)} s :` },
        { inlineData: { mimeType: "image/jpeg", data: f.base64 } },
      ]),
      { text: JSON.stringify({ titre, format, duree, glossaire: GLOSSAIRE, segments }) },
    ],
  }],
  config: {
    systemInstruction: PROMPT_ANALYSE,
    responseMimeType: "application/json",
    responseJsonSchema: jsonSchema,
  },
});
const out = AnalysisOut.parse(JSON.parse(res.text ?? "{}"));
```

```ts
// Claude : relecture LLM 2 (server/ai/claude.ts)
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const res = await claude.beta.messages.parse({
  model: env.CLAUDE_MODEL,                               // "claude-opus-5-5" par défaut
  max_tokens: 16000,
  // Repli serveur en cas de refus : à retirer si CLAUDE_MODEL est un Haiku (pas de repli serveur).
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: { effort: "medium", format: betaZodOutputFormat(ReviewOut) },
  system: PROMPT_LLM2,
  messages: [{ role: "user", content: JSON.stringify({ repliques }) }],
});
if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("LLM2_CLAUDE"); // → repli Groq
return res.parsed_output.reviews;
```

Pour le dossier familial par Claude (repli), le document passe en premier dans le contenu :
`{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`
(ou `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }` pour une photo).

```ts
// Groq : LLM texte de repli, sortie JSON validée par zod
const chat = await groq.chat.completions.create({
  model: env.GROQ_LLM_MODEL,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: PROMPT_LLM2 + "\nSchéma attendu : " + JSON.stringify(z.toJSONSchema(ReviewOut)) },
    { role: "user", content: JSON.stringify({ repliques }) },
  ],
});
const reviews = ReviewOut.parse(JSON.parse(chat.choices[0].message.content ?? "{}")).reviews;
```

## 10. Sources (consultées le 19 novembre 2026)

- Corpus et banc d'essai tunisiens : [ICAART 2026](https://www.scitepress.org/Papers/2026/144577/144577.pdf) (24,7 % pour large-v2 sur leur corpus) ; tâche partagée [NADI 2026](https://arxiv.org/html/2609.27086) (meilleurs systèmes adaptés : 14 à 17 % de WER)
- Whisper tel quel sur le tunisien : [Itgan, NADI 2026](https://arxiv.org/pdf/2610.09934) (large-v3 : 85 % sans adaptation, 21,6 % avec), [LinTO](https://arxiv.org/pdf/2504.02604) (50 % à plus de 100 %), [Casablanca](https://arxiv.org/pdf/2410.04527) (mots français perdus), [Deepgram](https://deepgram.com/learn/whisper-v3-results) (v3 hallucine plus que v2, hors arabe)
- Gemini sur l'arabe dialectal : [ArabicNLP 2026](https://aclanthology.org/2026.arabicnlp-main.8.pdf) (Gemini 3.5 Flash : 27,6 % de WER) ; [Gemini 3.5 Transcribe](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) (diarisation, horodatages par mot) ; [jeu de données Bulbul](https://arxiv.org/pdf/2608.21950) (11 pays dont la Tunisie)
- Modèle tunisien large-v3 FarukSTT, cité dans [MeetScribe](https://github.com/AmineChr54/MeetScribe/pull/75) ; voix tunisienne [f5-tts-tn](https://huggingface.co/montachouig/f5-tts-tn)
- Modèles Whisper affinés sur la derja : [TheBiggyBang/whisper-small-tunisian-derja](https://huggingface.co/TheBiggyBang/whisper-small-tunisian-derja), [version CTranslate2](https://huggingface.co/TheBiggyBang/whisper-small-tunisian-derja-ct2), [dépôt](https://github.com/TheBiggyBang1/whisper-tn-ct2), [TuniSpeech-AI/whisper-tunisian-dialect](https://huggingface.co/TuniSpeech-AI/whisper-tunisian-dialect)
- Les LLM et le tunisien : [TounsiBench (EMNLP 2025)](https://aclanthology.org/2025.emnlp-main.1756/), [How Well Do LLMs Understand Tunisian Arabic?](https://arxiv.org/pdf/2511.16683)
- Quotas gratuits de Gemini (relevés tiers, oct. 2026) : [imisofts](https://imisofts.com/blog/gemini-api-free-tier-limits/), [usagebox](https://usagebox.com/articles/gemini-3-8-flash-pricing-free-tier-2026) ; usage des données : [Google, journalisation](https://ai.google.dev/gemini-api/docs/logs-policy)
- Groq : [limites](https://console.groq.com/docs/rate-limits), [relevé tiers](https://www.developersdigest.tech/rate-limits/groq), [vos données](https://console.groq.com/docs/your-data)
- ElevenLabs, offre gratuite (tiers) : [costbench](https://www.costbench.com/software/ai-voice-tools/elevenlabs/free-plan/), [dupple](https://dupple.com/learn/is-elevenlabs-free)
- Claude Pro et API facturées séparément : [aide Anthropic](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-ai-plan-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)
- Synchronisation labiale open source : [licences (2026)](https://www.creativeainews.com/articles/open-source-lip-sync-licenses-commercial-use-2026/), [LatentSync](https://github.com/bytedance/LatentSync) ; voix clonées open source : [Chatterbox](https://www.resemble.ai/chatterbox/)
- Voix tunisiennes d'Azure (ar-TN, sens français → derja) : [langues prises en charge](https://learn.microsoft.com/en-my/AZURE/ai-services/speech-service/language-support), [tarifs](https://azure.microsoft.com/pricing/details/speech/)
- Limites Vercel : [fonctions](https://vercel.com/docs/functions/limitations), [plan Hobby](https://vercel.com/docs/plans/hobby) ; Supabase gratuit (tiers) : [automationatlas](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
