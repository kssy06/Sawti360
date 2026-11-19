# Architecture du back-end

Vue d'ensemble en une page : [README.md § 2](README.md#2-architecture-en-une-page).
Ce document détaille les composants, l'arborescence, le flux de chaque fonction,
les limites des offres gratuites, la sécurité et les replis.

## 1. Composants

| Composant | Rôle | Choix | Pourquoi |
| --- | --- | --- | --- |
| Interface | Écrans de la spéc. V2 | `web/` (refonte d'Ahmed), React 19 + Vite + zustand | Déjà faite, testée (49 tests) |
| API | Règles métier, accès aux données, appels aux IA | **Une** fonction Vercel Node : `web/api/index.ts` → application **Hono** (`web/server/app.ts`) | Une seule fonction : pas de limite de nombre de fonctions sur Hobby, code partagé avec `src/core` |
| Base de données | Projets, autorisations, licences, jetons, journal, passeports, tâches | **Supabase Postgres** ([schema.sql](schema.sql)) | Gratuit, Postgres réel, connexion directe pour les transactions |
| Authentification | Comptes, sessions, mot de passe oublié | **Supabase Auth** (e-mail + mot de passe) | Écran 01 sans rien écrire côté serveur |
| Fichiers | Audio extrait, images, dossiers familiaux, échantillons, répliques | **Supabase Storage**, buckets privés, URL signées | Contourne la limite de 4,5 Mo des requêtes Vercel |
| Traitement vidéo | Extraire l'audio et des images ; fabriquer le MP4 doublé | **mediabunny** dans le navigateur (déjà installé, v1.66) | Aucun serveur vidéo à maintenir ; la vidéo ne transite pas par Vercel |
| IA | Transcription, analyse, traduction, relecture, dossier, voix | Groq, Gemini, Claude (optionnel), ElevenLabs | Détail et sources : [IA.md](IA.md) |
| E-mails | Liens sécurisés de consentement et de licence | **nodemailer** + SMTP Gmail (mot de passe d'application) | Gratuit, sans nom de domaine |
| Tâches longues | Analyse, relecture, dossier, génération | Table `jobs` + `waitUntil` (`@vercel/functions`) + interrogation toutes les 1,5 s | Rien de plus à héberger ; 300 s max par tâche |

Paquets à ajouter dans `web/package.json` (versions du 19 nov. 2026) :
`hono@^4.13`, `@supabase/supabase-js@^2.119`, `postgres@^4.1`, `@vercel/functions@^3.11`,
`@google/genai@^3.6`, `groq-sdk@^1.6`, `nodemailer@^10.6` (+ `@types/nodemailer`),
et en développement `tsx` (script de données de démo). Déjà présents : `@anthropic-ai/sdk`,
`@elevenlabs/elevenlabs-js`, `zod`, `mediabunny`, `@noble/*`.

## 2. Arborescence cible

```
web/
├─ api/
│  └─ index.ts              ← la seule fonction Vercel : export GET/POST/PATCH/DELETE = app.fetch
├─ server/                  ← code serveur uniquement (jamais importé par src/)
│  ├─ app.ts                ← application Hono, basePath("/api"), montage des routes
│  ├─ env.ts                ← lecture et validation (zod) des variables d'environnement
│  ├─ db.ts                 ← postgres.js : DATABASE_URL, { prepare: false, max: 1 }
│  ├─ auth.ts               ← middleware : jeton Supabase → compte ; requireProjectOwner()
│  ├─ storage.ts            ← URL signées d'envoi et de lecture (client Supabase service)
│  ├─ audit.ts              ← appendAudit() sous pg_advisory_xact_lock, même hachage que src/core/audit.ts
│  ├─ sign.ts               ← signature Ed25519 avec SAWTI_SIGNING_SEED ; publicKey()
│  ├─ jobs.ts               ← createJob(), step(), finish(), fail() + waitUntil
│  ├─ mail.ts               ← sendMail() Gmail SMTP ; gabarits français
│  ├─ notify.ts             ← notify(accountId, space, tone, title, body, link)
│  ├─ compose.ts            ← lignes SQL → objets du front (Project, LicenseRequest, Notice…)
│  ├─ ledger.ts             ← solde, débit, crédit, part titulaire (src/core/credits.ts)
│  ├─ routes/               ← health, demo, me, bootstrap, uploads, projects, characters,
│  │                           analysis, review, consents, dossiers, voices, licences, payments,
│  │                           generation, passports, owner, journal, notifications, jobs, tts
│  └─ ai/
│     ├─ groq.ts            ← découpage par Whisper ; texte lu en français ; LLM texte de repli
│     ├─ gemini.ts          ← analyse multimodale ; lecture du dossier ; transcription de repli
│     ├─ claude.ts          ← relecture LLM 2 (si ANTHROPIC_API_KEY)
│     ├─ elevenlabs.ts      ← synthèse (repris de api/tts.ts)
│     ├─ review.ts          ← chaîne de repli LLM 2 + vérificateur de fidélité
│     ├─ dossier.ts         ← contrôle de cohérence + règles déterministes
│     ├─ voicecheck.ts      ← transcription de l'échantillon + WER (wer.ts, testé)
│     ├─ prompts.ts         ← prompts système (IA.md § 4)
│     └─ schemas.ts         ← schémas zod des sorties
├─ scripts/
│  ├─ seed.ts               ← remplit Supabase avec les données d'exemple d'Ahmed
│  ├─ keys.ts               ← génère SAWTI_SIGNING_SEED et affiche la clé publique
│  └─ try-asr.ts, try-analysis.ts ← essais des IA sur un fichier local, hors interface
└─ src/
   ├─ lib/supabase.ts       ← client navigateur (URL + clé publishable)
   ├─ api/client.ts         ← fetch + jeton + erreurs ; api.get/post/patch/del
   ├─ api/types.ts          ← types des réponses (miroir d'API.md)
   ├─ api/upload.ts         ← demande un UploadTicket puis envoie le fichier par URL signée
   ├─ api/useJob.ts         ← interrogation d'une tâche toutes les 1,5 s
   ├─ media/extract.ts      ← audio Ogg/Opus 16 kHz mono + images JPEG pour l'analyse
   ├─ media/export.ts       ← mixage + MP4 + label IA + QR
   ├─ state/seed.ts         ← seed() sorti de store.ts, réutilisé par scripts/seed.ts
   ├─ state/passportBuild.ts ← buildPassport() sorti de store.ts, pur, utilisé aussi par le serveur
   ├─ state/remote/*.ts     ← versions « back-end » des actions du store, par domaine
   └─ state/store.ts        ← une ligne d'aiguillage par action : backend ? remote.x : local
```

`web/vercel.json` devient :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "functions": { "api/index.ts": { "maxDuration": 300 } },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api?__path=:path*" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

Vercel transmet normalement l'URL d'origine à la fonction ; par sécurité, la réécriture passe
aussi le chemin dans `__path`, et `server/vercel.ts` reconstruit `/api/<chemin>` avant le
routage Hono (testé dans `server/app.test.ts`). À vérifier sur l'aperçu avec `/api/health` et
une route à paramètre. En local, le plugin Vite `localApi()` de `vite.config.ts` passe toute
requête `/api/*` au même point d'entrée `api/index.ts` (au lieu du seul `/api/tts`).

## 3. Données

Le schéma est dans [schema.sql](schema.sql). Trois idées :

1. **Le projet reste un document.** `projects` garde en JSONB les champs que l'interface
   modifie ensemble (`segments`, `characters`, `speakers`, `speaker_voices`, `proposals`,
   `reviews`, `gens`, `generation`, `video`, `pipeline`). C'est le chemin le plus court :
   l'API renvoie un objet `Project` identique à celui du store, et les écrans ne changent pas.
2. **Ce qui se partage ou s'ouvre sans compte a sa table.** `consents`, `dossiers`,
   `license_requests`, `voice_profiles`, `voice_licenses`, `passports`. Les jetons des liens
   publics y sont stockés **hachés** (SHA-256).
3. **Composition à la lecture** (`server/compose.ts`) : `characters[key].living` vient de
   la dernière ligne non remplacée de `consents`, `characters[key].dossier` de celle de
   `dossiers` (sans `file_path`). Le jeton brut n'est jamais renvoyé, sauf une fois, à l'envoi.

Le journal d'audit est **une seule chaîne** pour toute la plateforme, comme aujourd'hui.
`server/audit.ts` reproduit exactement `appendEntry()` de `src/core/audit.ts` :

```ts
// web/server/audit.ts (esquisse)
import { canonicalJson, nowIso, sha256Hex } from "../src/core/canonical.js";
import { entryHash, GENESIS } from "../src/core/audit.js";
import { sql } from "./db.js";

export async function appendAudit(actor: string, action: string, payload: unknown,
                                  decision = "", meta: { projectId?: string; accountId?: string } = {}) {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(360360)`;               // une seule chaîne, pas de course
    const [head] = await tx`select idx, entry_hash from audit_entries order by idx desc limit 1`;
    const draft = {
      index: head ? head.idx + 1 : 0,
      timestamp: nowIso(),
      actor, action,
      payload_hash: sha256Hex(canonicalJson(payload)),
      decision,
      prev_hash: head ? head.entry_hash : GENESIS,
    };
    const entry = { ...draft, entry_hash: entryHash(draft) };
    await tx`insert into audit_entries (idx, ts, actor, action, payload_hash, decision, prev_hash, entry_hash, project_id, account_id)
             values (${entry.index}, ${entry.timestamp}, ${actor}, ${action}, ${entry.payload_hash},
                     ${decision}, ${entry.prev_hash}, ${entry.entry_hash}, ${meta.projectId ?? null}, ${meta.accountId ?? null})`;
    return entry;   // AuditEntry, vérifiable par verifyChain() dans le navigateur
  });
}
```

Les **noms d'actions** du journal restent ceux du store actuel (`VIDEO_IMPORTEE`,
`PERSONNAGE_CONFIRME`, `CONSENTEMENT_DEMANDE`, `DOSSIER_FAMILIAL_RECU`, `CONTROLE_COHERENCE`,
`LICENCE_DEMANDEE`, `PAIEMENT_CONFIRME`, `TEXTE_VALIDE`, `GENERATION_AUTORISEE`,
`GENERATION_REFUSEE`, `PASSEPORT_EXPORTE`…), pour que le centre de confiance n'ait rien à changer.

## 4. Flux par fonction

Les routes citées sont détaillées dans [API.md](API.md).

### 4.1 Connexion (écran 01)

- **Inscription** : `supabase.auth.signUp({ email, password, options: { data: { name, org } } })`.
  Le déclencheur `on_auth_user_created` crée le compte et crédite 100 000 jetons (plan Créateur).
  « Confirm email » est désactivé dans Supabase pour le prototype.
- **Connexion** : `signInWithPassword`, puis `GET /api/bootstrap` remplit le store.
- **Comptes de démonstration** (boutons de l'écran d'Ahmed) : `POST /api/demo/session`
  `{ account: "nour" | "lina" }` → le serveur appelle `auth.admin.generateLink({ type: "magiclink" })`
  et renvoie `hashed_token` → le navigateur fait `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })`.
  Aucun mot de passe dans le code du navigateur.
- **Mot de passe oublié** : `resetPasswordForEmail(email, { redirectTo: APP_URL + "/mot-de-passe-oublie" })`,
  puis `updateUser({ password })`. Demande le SMTP personnalisé dans Supabase (SETUP.md § 2) ;
  sans lui, Supabase n'écrit qu'aux adresses de l'équipe.

### 4.2 Import et analyse (écrans 03, 04)

1. `NewProject` lit la vidéo comme aujourd'hui (`probeVideo`, `hashFile`, confidentialité, format).
2. `POST /api/projects` crée le projet (`kind: "video"`, `pipeline.status: "running"`).
   La vidéo d'origine reste dans IndexedDB (`keepVideo`) ; en P1, elle est aussi envoyée dans
   `media/<compte>/<projet>/original.<ext>` si elle fait au plus 50 Mo, pour exporter depuis un autre appareil.
3. `src/media/extract.ts` produit dans le navigateur :
   - l'**audio** : piste décodée par `AudioBufferSink`, ramenée en mono 16 kHz
     (`OfflineAudioContext`), encodée en **Ogg/Opus** ~24 kbit/s (`OggOutputFormat` +
     `AudioBufferSource`, codec `opus`) : environ 0,2 Mo par minute. Ogg est accepté à la fois
     par Groq et par Gemini ; repli WAV (`WavOutputFormat`, `pcm-s16`) si Opus n'est pas encodable ;
   - des **images** : une toutes les max(2 s, durée / 60), 384 px, JPEG qualité 0,7
     (réutiliser `captureFrames` de `media/local.ts`).
4. Envoi de l'audio et des images par URL signée (`POST /api/uploads`, 4 envois en parallèle).
5. `POST /api/projects/:id/analysis` renvoie `{ jobId }` (202) et continue dans `waitUntil` :

| Étape (`ANALYSIS_STEPS` d'Ahmed) | Travail réel | Fournisseur |
| --- | --- | --- |
| 0 `audio` | vérifie les fichiers ; si la même empreinte audio a déjà été analysée pour ce compte, reprend le résultat | — |
| 1 `speakers` | découpage des prises de parole (bornes horodatées) ; les mots de Whisper ne servent que d'indice | Groq Whisper large-v3 |
| 2 `names` | transcription derja écrite en écoutant l'audio, intervenants, personnages proposés | Gemini (audio + images + bornes) |
| 3 `assoc` | chaque segment reçoit son intervenant ; traduction LLM 1 et note de contexte ; `fits` calculé (14 caractères/s) | Gemini (même appel) |
| 4 `checks` | relecture LLM 2 + vérificateur de fidélité ; aucune identification automatique d'une personne (« la détection ne prouve pas l'identité ») | Claude ou Groq |

6. Le navigateur interroge `GET /api/jobs/:id` ; à la fin, `GET /api/projects/:id` met le store à jour.
   Les étiquettes passent à « Réel » avec les modèles listés dans `job.providers`.

Repli : sans Groq, Gemini transcrit seul ; sans Gemini, Groq traduit le texte seul (contexte
noté « sans image ») ; si tout échoue, la tâche se termine en erreur avec « Relancer » et
« Utiliser l'exemple simulé » (étiqueté « Simulé »). Limite P0 : extraits de 5 minutes au plus
(découpage en fenêtres de 3 minutes en P2).

### 4.3 Personnages (écran 05)

`PATCH /api/projects/:id/characters/:key` (nom, description, confirmation). La confirmation
écrit `PERSONNAGE_CONFIRME` au journal. Rien d'automatique : l'IA propose, le créateur décide.

### 4.4 Autorisation d'une personne vivante (écran 06)

1. Statut de vie « Vivante » : `PATCH …/characters/:key { lifeStatus: "vivant" }`.
2. `POST …/characters/:key/consent { email, registered }` : jeton de 32 octets aléatoires,
   haché en base ; l'envoi précédent est marqué remplacé ; e-mail avec le lien
   `APP_URL/consentement/<jeton>` ; réponse `{ consentUrl }` affichée une fois avec
   « Copier le lien » et « Envoyer par WhatsApp » (`https://wa.me/?text=…`).
3. Page publique `/consentement/:token` : `GET /api/public/consents/:token` donne le titre,
   le créateur, le personnage, le paragraphe à lire (`paragraphFor`) et l'état.
4. Si la personne n'est pas inscrite, **elle crée elle-même** son Passeport de voix :
   envoi de l'enregistrement (`POST /api/public/uploads`), puis
   `POST /api/public/consents/:token/voice-passport` (contrôle de l'échantillon, IA.md § 6).
   Le créateur ne peut jamais le créer à sa place (spéc. § 4).
5. `POST /api/public/consents/:token/decision { accept }` : une seule décision par lien ;
   journal `CONSENTEMENT_ACCORDE` ou `CONSENTEMENT_REFUSE` ; notification et e-mail au créateur.
   L'ordinateur du créateur passe à « Autorisée » à la prochaine interrogation (15 s au plus).

### 4.5 Dossier familial d'une personne décédée (écran 06)

1. Statut « Décédée » ; le créateur choisit le document (PDF, JPEG, PNG, WebP, 20 Mo max),
   indique le nom de la personne et **son rôle exact dans la vidéo**.
2. Envoi par URL signée dans le bucket privé `dossiers`, puis
   `POST …/characters/:key/dossier` : référence `DF-2026-xxxxx` (`dossierReference`),
   statut « Document reçu », journal `DOSSIER_FAMILIAL_RECU`, notification.
3. Tâche `dossier_check` : statut « Analyse en cours » → Gemini lit le document et reçoit les
   fiches des personnages, les répliques de chacun et quatre images de la personne visée
   (IA.md § 4.4) → **le code applique des règles déterministes** à la proposition de l'IA et
   fixe l'un des trois résultats : « Correspondance détectée », « Incohérence détectée »,
   « Vérification nécessaire ». Journal `CONTROLE_COHERENCE`, notification.
4. Seule « Correspondance détectée » permet la validation humaine
   (`POST …/dossier/validate`, `canValidateDossier`). Sinon : document corrigé
   (`DELETE …/dossier` puis nouvel envoi) ou vérification complémentaire (`POST …/dossier/complementary`).
5. Le document n'est **jamais** public : il n'apparaît ni dans le Passeport 360° ni dans
   une réponse publique ; seuls la référence, le statut et le résultat du contrôle y figurent.
   Le contrôle vérifie la cohérence du rôle ; il ne certifie ni la signature, ni le lien
   familial, ni la qualité juridique des signataires (encadré de la spéc. § 4).

### 4.6 Bibliothèque, licence de projet et paiement (écrans 07, 08, 09)

- `GET /api/voices` : profils publiés (titulaires) avec leur disponibilité (licence révoquée →
  indisponible). Les voix IA de Sawti restent dans le catalogue du front (`src/core/catalog.ts`).
- `POST /api/license-requests` : prix lu dans le profil, `expires_at` = envoi + 72 h,
  paiement `en_attente` si prix > 0, sinon `non_requis`. E-mail au titulaire avec
  `APP_URL/licence/<jeton>` ; notification dans son espace. Pour les profils fictifs sans
  compte (Sami, Maya), le lien est rendu au créateur pour la démo.
- Réponse du titulaire, connecté (`POST /api/license-requests/:id/decision`) ou par le lien
  (`POST /api/public/licences/:token/decision`). Refusée si expirée : l'expiration est
  calculée à chaque lecture (`requestStatus`) et enregistrée la première fois qu'elle est constatée.
- **Paiement** : `POST /api/payments { kind: "licence", requestId }` confirme immédiatement
  (`method: "prototype_gratuit"`, 0 DT réellement débité), la licence devient utilisable
  (`licenseUsable`), journal `PAIEMENT_CONFIRME`, notifications au créateur et au titulaire.
  `POST /api/payments { kind: "jetons", plan }` change de plan et **crédite aussitôt** les jetons du plan.
- Attribution : `POST …/characters/:key/voice { voiceId }`, journal `VOIX_ATTRIBUEE`.

### 4.7 Traduction (écran 10)

- La traduction LLM 1 arrive avec l'analyse (`proposals` = première version, pour afficher « modifiée »).
- `PATCH …/segments/:segId { translation }` : une modification retire l'approbation.
- `PATCH …/segments/:segId { validated }` : journal `TEXTE_VALIDE` / `VALIDATION_RETIREE`
  avec l'empreinte du texte ; l'acteur est le nom du compte connecté.
- `POST /api/projects/:id/review` relance la relecture LLM 2 ;
  `POST …/segments/:segId/apply-suggestion` applique une correction (à approuver ensuite).

### 4.8 Timeline et aperçu (écran 11)

`POST …/segments/:segId/synthesize` : mêmes contrôles que la génération (moteur de règles,
filtre, licence ou consentement), synthèse ElevenLabs, audio rangé dans
`media/<compte>/<projet>/lines/<segId>.mp3`, réponse `{ gen, audioUrl }` (URL signée 10 min).

### 4.9 Génération (écran 12)

`POST /api/projects/:id/generation` → tâche `generation`. Pour chaque réplique approuvée, dans l'ordre :

1. `voiceSlot()` (`src/state/workflow.ts`) avec les données de la base : voix originale
   autorisée, licence de projet acceptée et payée, ou voix IA.
2. `runGate()` (`src/core/gate.ts`) avec les licences signées de la base : refus par défaut,
   filtre de contenu. Refus → `GENERATION_REFUSEE`, et notification au titulaire si un de
   ses thèmes interdits a été visé.
3. Solde de jetons suffisant (`token_balances`).
4. Synthèse ElevenLabs (`eleven_multilingual_v2`) avec la voix de rendu : voix IA du catalogue,
   ou voix du titulaire (`voice_profiles.eleven_voice_id`). Voix originale autorisée :
   rendu impossible sans clonage (P2), la réplique est marquée « Voix originale : rendu non
   branché », comme aujourd'hui.
5. **Ajustement du débit** (P1) : si la durée dépasse la place à l'écran de plus de 0,3 s,
   nouvelle synthèse avec `voice_settings.speed` jusqu'à 1,15 ; sinon la réplique est signalée
   « trop longue » et le LLM 2 propose une version courte (IA.md § 4.5).
6. Audio rangé, ligne d'usage, débit des jetons du créateur, **70 % crédités au titulaire**
   (`split()`), journal `GENERATION_AUTORISEE`, notification « Votre voix a été utilisée ».

Les étapes affichées par l'écran deviennent honnêtes : synthèse, placement et débit sont
réels ; « Synchronisation labiale » affiche « Prévu, hors prototype » ; mixage et export se
font au téléchargement (§ 4.10) ; le Passeport 360° est signé à la fin de la tâche (A8).

### 4.10 Résultat et export (écran 13)

- **MP4** (`src/media/export.ts`) : récupère les URL signées des répliques
  (`GET /api/projects/:id/audio`), mixe dans un `OfflineAudioContext` (piste originale
  atténuée à 18 % sous chaque réplique avec des rampes de 80 ms, voix françaises posées à leur
  horodatage), puis `Conversion` de mediabunny : `audio.process` remplace chaque échantillon
  audio par le mixage au même instant ; la vidéo est **copiée sans réencodage** (rapide).
  Codec audio : AAC si `canEncodeAudio("aac")`, sinon Opus.
- **Label IA et QR** (P1) : `video.process` dessine le label (« Doublé avec l'IA · voix sous
  licence · validé par … ») pendant les 4 premières secondes et le QR du passeport pendant
  les 5 dernières, selon `transparencyPolicy(format)` : film et podcast oui ; Reel/Short
  « règle à confirmer », rien n'est ajouté. La vidéo est alors réencodée (plus lent).
- **Passeport 360°** : signé par le serveur (`server/sign.ts`), rangé dans `passports`,
  identifiant `S360-XXXX-XXXX` (`passportId`). Le QR pointe vers `APP_URL/verifier?id=S360-…` :
  la page publique récupère le passeport (`GET /api/public/passports/:id`) et vérifie la
  signature **dans le navigateur** avec la clé publique (`VITE_SAWTI_PUBLIC_KEY`). Le lien
  autonome `#p=` existant reste valable hors ligne.
- SRT et JSON : déjà réels ; chaque export écrit `EXPORT` au journal (`POST /api/journal/export`).

### 4.11 Espace propriétaire vocal (écrans 14 à 16)

- **Créer son Passeport de voix** : le paragraphe généré (`paragraphFor`) est lu et enregistré
  (`Recorder`), envoyé dans le bucket `samples`, puis `POST /api/owner/voice` : contrôle de
  l'échantillon (durée ≥ 8 s, niveau, saturation, et en P1 transcription + WER) → profil
  public + licence signée par le serveur (usages et thèmes interdits) → journal `PASSEPORT_DE_VOIX_CREE`.
  Aucune preuve d'identité n'est demandée (spéc. § 5).
- **Voix de rendu** : P0, une voix de synthèse prédéfinie du même genre, affichée comme
  « voix de démonstration, clonage non activé » ; P2, clonage ElevenLabs IVC à partir de
  l'échantillon, supprimé chez ElevenLabs en cas de révocation.
- Profil et tarif, règles (nouvelle signature à chaque modification), révocation et
  rétablissement, demandes reçues, revenus (70 % des jetons + licences payées).

### 4.12 Centre de confiance

Journal lu depuis la base (`GET /api/journal`) et vérifié par `verifyChain()` dans le navigateur
(la falsification simulée agit sur une copie locale) ; « Modèles et versions » rempli par
`GET /api/health` ; panneau énergie : durées et tailles mesurées par génération, énergie
« à mesurer » ; Sawti-Bench : résultats mesurés de B8 avec date et effectif, sinon « à mesurer ».

### 4.13 Notifications (spéc. § 8)

Créées par les routes (`server/notify.ts`) au moment de l'événement, pour le bon compte et le
bon espace (créateur ou propriétaire). Le navigateur interroge `GET /api/notifications` toutes
les 15 s ; une nouvelle notification déclenche un rafraîchissement du projet ou des demandes concernés.

## 5. Tâches longues

```
navigateur                     API (Vercel)                         base
POST …/analysis  ───────────▶  createJob() ───────────────────────▶ jobs: queued
◀── 202 { jobId }              waitUntil(run())  ─ step(1..4) ────▶ jobs: running, step
GET /api/jobs/:id (1,5 s) ───▶ lecture ◀──────────────────────────  jobs + projects.pipeline
...                            finish(result) ────────────────────▶ jobs: done
```

`maxDuration` = 300 s. Budget visé : analyse d'un extrait de 2 min en moins de 2 min
(Groq ~5 s, Gemini 20 à 60 s, LLM 2 10 à 30 s). Chaque étape écrit aussi `projects.pipeline.step`
pour que l'écran d'analyse d'Ahmed garde sa progression. Une tâche dépassée est marquée en erreur
par la lecture suivante (`updated_at` de plus de 300 s) et peut être relancée.

## 6. Limites des offres gratuites

Chiffres relevés le 19 novembre 2026 ; ceux marqués « tiers » viennent de sites tiers et sont
à confirmer dans chaque console au moment de créer les clés.

| Service | Limite | Conséquence | Parade |
| --- | --- | --- | --- |
| Vercel Hobby | 300 s par appel (Fluid Compute), 4,5 Mo par requête, usage non commercial | Pas de vidéo dans les requêtes | Envoi direct vers Supabase par URL signée ; une seule fonction |
| Supabase Free | 500 Mo de base, 1 Go de fichiers, 50 Mo par fichier, pause après 7 jours sans activité | Vidéos d'origine ≤ 50 Mo | On n'envoie que l'audio (~0,2 Mo/min) et des images ; ouvrir le projet la veille |
| Groq Free | ~20 requêtes/min, ~2 000/jour, ~8 h d'audio/jour pour Whisper (tiers) | Large | — |
| Gemini Free | ~5 requêtes/min et ~20/jour sur Flash, davantage sur Flash-Lite (relevés d'oct. 2026, tiers) ; contenus utilisables par Google | ~10 analyses par jour | Flash-Lite en développement, cache par empreinte audio, projets de démo pré-calculés, facturation si blocage |
| ElevenLabs Free | 10 000 crédits/mois, pas de clonage, usage non commercial | 6 à 8 générations complètes d'un extrait de 2 min | `SAWTI_TTS_MOCK=1` en développement ; plan Starter si besoin |
| Gmail SMTP | ~500 destinataires/jour | Large | Lien copiable et WhatsApp en repli |
| API Anthropic | Pas d'offre gratuite, prépayé | Optionnelle | Groq en repli pour le LLM 2 |

## 7. Sécurité du prototype

- **Secrets** uniquement côté serveur. Les variables `VITE_*` sont publiques par nature
  (URL Supabase, clé publishable, clé publique de signature, `VITE_BACKEND`).
- **Accès** : toute route non publique exige un jeton Supabase valide, et chaque route de
  projet vérifie que `projects.account_id` est le compte connecté (`requireProjectOwner`).
- **Base** : RLS activé sans policy et droits retirés à `anon` et `authenticated` : le
  navigateur ne peut rien lire par PostgREST, même avec la clé publishable.
- **Liens publics** : jetons de 32 octets, stockés hachés, une seule décision par lien,
  72 h pour les licences ; limite de 20 requêtes/min par adresse IP et par route publique
  (mémoire de l'instance, au mieux).
- **Fichiers** : buckets privés ; URL signées d'envoi (2 h) et de lecture (10 min) délivrées
  après contrôle du type, de la taille et du propriétaire ; chemins préfixés par le compte.
- **Validation** : zod sur chaque corps de requête ; textes de synthèse limités à 400 caractères.
- **Signatures** : la graine Ed25519 vit dans `SAWTI_SIGNING_SEED` ; seules les licences et
  les passeports signés par le serveur sont valides. La clé de démo actuelle, dérivée d'une
  graine publique, ne sert plus qu'au mode simulé.
- **Consentement côté serveur** : moteur de règles et filtre de contenu tournent avant chaque
  synthèse, quoi que dise le navigateur (principe déjà appliqué par `api/tts.ts`).
- **Hors prototype, assumé** : pas d'antivirus sur les fichiers, limitation de débit
  sommaire, pas de politique de conservation, offre gratuite de Gemini acceptée par l'équipe.

## 8. Mode démonstration et replis

- `VITE_BACKEND=0` : l'interface d'Ahmed tourne comme aujourd'hui, entièrement simulée.
- `VITE_BACKEND=1` : `src/state/remote/*` appelle l'API. Une erreur réseau ou serveur affiche
  un message clair ; les tâches d'IA proposent « Relancer » et, en dernier recours,
  l'exemple simulé (étiqueté « Simulé »).
- `GET /api/health` indique au front quels fournisseurs sont configurés, pour afficher les
  bonnes étiquettes et les bons noms de modèles.
- Chaîne de repli de chaque tâche d'IA : [IA.md § 1](IA.md#1-fournisseurs-retenus).

## 9. Hors prototype (dit tel quel au jury)

Synchronisation labiale (MuseTalk ou LatentSync, GPU), séparation dialogue / musique
(Demucs), transcription derja auto-hébergée (modèle Whisper affiné sur le tunisien via
`sawti/asr.py`), import YouTube et plateformes, découpage des vidéos longues, sens
français → derja, paiements réels (Konnect, passerelle tunisienne, en bac à sable),
conformité C2PA, mesure de l'énergie de l'inférence chez les fournisseurs.
