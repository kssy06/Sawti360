# Contrat de l'API

Source de vérité des routes `/api/*`. Pour changer une route : modifier ce document d'abord,
puis le code, dans la même PR.

## 1. Conventions

- Base : `/api`, JSON en UTF-8, dates ISO 8601 (UTC).
- **Authentification** : en-tête `Authorization: Bearer <access_token Supabase>` sur toute
  route qui n'est pas sous `/api/public/*`, `/api/health` ou `/api/demo/*`.
- **Objets renvoyés** : exactement les types du front, pour que le store les range tels quels :
  `Project`, `Segment`, `Character`, `LicenseRequest`, `Notice`, `AuditEntry`, `UsageRow`,
  `OwnedVoice`, `VoiceProfile`, `VoiceLicense`, `Passport360`, `GenState`
  (`web/src/state/store.ts`, `web/src/state/workflow.ts`, `web/src/core/types.ts`,
  `web/src/core/passport.ts`, `web/src/mock/registry.ts`). Le champ `Project.use` est stocké
  sous le nom `use_case`.
- **Erreurs** : `{ "error": "CODE", "message": "Phrase en français pour l'interface." }`.

| HTTP | `error` | Quand |
| --- | --- | --- |
| 400 | `REQUETE_INVALIDE` | corps refusé par zod |
| 401 | `NON_CONNECTE` | jeton absent ou invalide |
| 403 | `INTERDIT` | le projet n'appartient pas au compte |
| 403 | `{ decision }` | refus du moteur de règles (même forme qu'`api/tts.ts`) |
| 404 | `INTROUVABLE` | ressource ou jeton inconnu |
| 409 | `DEJA_DECIDE`, `EN_COURS` | lien déjà utilisé, tâche déjà lancée |
| 410 | `EXPIRE` | demande de licence de plus de 72 h |
| 402 | `JETONS_INSUFFISANTS` | solde trop bas pour la synthèse |
| 413 | `FICHIER_TROP_GROS`, `TEXTE_TROP_LONG` | limites de taille |
| 429 | `TROP_DE_REQUETES` | limite d'une route publique |
| 502 | `FOURNISSEUR_IA` | tous les fournisseurs d'une chaîne ont échoué |
| 503 | `NON_CONFIGURE` | clé absente (ex. synthèse sans `ELEVENLABS_API_KEY`) |
| 500 | `ERREUR_SERVEUR` | erreur inattendue (détail dans les journaux Vercel, jamais dans la réponse) |

## 2. Types nouveaux

```ts
// web/src/api/types.ts
export interface Health {
  ok: true;
  backend: true;
  publicKey: string;                    // clé publique Ed25519 (hex) des passeports et licences
  providers: {
    asr: string | null;                 // ex. "gemini-3.8-flash, bornes whisper-large-v3 (Groq)"
    llm1: string | null;                // ex. "gemini-3.8-flash"
    llm2: string | null;                // ex. "claude-opus-5-5" ou "openai/gpt-oss-120b (Groq)"
    dossier: string | null;
    tts: string | null;                 // ex. "eleven_multilingual_v2" ; null si non configuré
    ttsMock: boolean;
    mail: boolean;
  };
  services: {                           // socle : sans eux, le front reste en mode simulé
    database: boolean;                  // DATABASE_URL
    auth: boolean;                      // SUPABASE_URL + SUPABASE_SECRET_KEY
    storage: boolean;                   // idem
    signing: boolean;                   // SAWTI_SIGNING_SEED (sinon clé publique de démonstration)
  };
}

export interface Job {
  id: string;
  kind: "analysis" | "review" | "dossier_check" | "voice_check" | "generation";
  status: "queued" | "running" | "done" | "error";
  step: number;                         // index dans ANALYSIS_STEPS ou GEN_STAGES
  detail?: string;                      // phrase affichable (« Transcription de 14 segments… »)
  result?: unknown;                     // selon le type de tâche
  error?: string;
  providers?: Record<string, string>;   // modèles réellement utilisés → étiquettes « Réel »
  projectId?: string;
}

export interface UploadTicket {
  bucket: "media" | "dossiers" | "samples";
  path: string;
  token: string;                        // pour supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)
  signedUrl: string;
}

export interface Bootstrap {
  account: { id: string; name: string; email: string; org: string; initials: string; plan: PlanId; isDemo: boolean;
             demoKey: string | null };  // "nour", "lina" si l'adresse figure dans DEMO_EMAILS
  balance: number;                      // jetons ; le store pose spent = PLANS[plan].monthly − balance
  projects: Record<string, Project>;    // projets du compte, composés (living et dossier inclus)
  order: string[];                      // du plus récent au plus ancien
  requests: LicenseRequest[];           // demandes envoyées par le compte ET reçues sur sa voix
  notifications: Notice[];              // 50 dernières, deux espaces
  usage: UsageRow[];                    // usages du compte + usages de sa voix
  licenses: VoiceLicense[];             // licences signées (moteur de règles côté navigateur)
  ownedVoices: Record<string, OwnedVoice>; // { [accountId]: sa voix } s'il en a une
  profiles: VoiceProfile[];             // profils publiés de la bibliothèque
  passports: Record<string, Passport360>; // dernier passeport par projet
  journalHead: { count: number; head: string };
}
```

## 3. Routes

Pour chaque route : corps attendu, réponse, effets (journal, notification, e-mail) et
l'action du store qu'elle remplace.

### Santé, démonstration, compte

**`GET /api/health`** (public) → `Health`. Lu au chargement ; remplace `GET /api/tts`
pour savoir ce qui est configuré.

**`POST /api/demo/session`** (public) `{ account: "nour" | "lina" }` → `{ token_hash, email }`.
Uniquement pour les adresses de démonstration de `DEMO_EMAILS`. Le navigateur termine avec
`supabase.auth.verifyOtp({ token_hash, type: "magiclink" })`. Remplace `login(accountId)`.

**`GET /api/me`** → `Bootstrap["account"] & { balance }`. Une ligne `accounts` manquante (utilisateur
créé avant le schéma) est recréée avec ses 100 000 jetons.

**`PATCH /api/me`** `{ name?, org? }` → idem.

**`GET /api/bootstrap`** → `Bootstrap`. Appelé après connexion, au retour sur l'onglet et
quand une notification nouvelle arrive.

### Fichiers

**`POST /api/uploads`** `{ bucket, kind, projectId?, characterKey?, contentType, size, name }` → `UploadTicket`.
`kind` ∈ `audio | frame | original | dossier | sample`. Le serveur contrôle le type MIME,
la taille (audio 25 Mo, image 1 Mo, original 50 Mo, dossier 20 Mo, échantillon 20 Mo) et
la propriété du projet, puis fabrique le chemin :

| kind | chemin |
| --- | --- |
| audio | `media/<compte>/<projet>/audio.ogg` |
| frame | `media/<compte>/<projet>/frames/<t en ms>.jpg` |
| original | `media/<compte>/<projet>/original.<ext>` |
| dossier | `dossiers/<compte>/<projet>/<clé>/<sha256>.<ext>` |
| sample | `samples/<compte>/sample-<horodatage>.<ext>` |

**`POST /api/public/uploads`** `{ token, contentType, size }` → `UploadTicket` dans
`samples/public/<id du consentement>/…`. Seul usage : l'enregistrement d'une personne
invitée qui crée son Passeport de voix depuis le lien de consentement.

### Projets

**`POST /api/projects`** `{ title, format, privacy, video: VideoMeta }` → `Project`.
`video.poster` (vignette en data URL) limité à 150 Ko. Journal `VIDEO_IMPORTEE`.
Remplace `createVideoProject`.

**`GET /api/projects/:id`** → `Project` (composé).

**`PATCH /api/projects/:id`** `{ title?, subtitle?, use?, format? }` → `Project`.
Remplace `patchProject` (champs listés seulement) et `setUse`.

**`DELETE /api/projects/:id`** → `204`. Interdit sur les projets `example: true`.
Remplace `deleteProject`.

**`PATCH /api/projects/:id/segments/:segId`** `{ translation?, validated?, source?, speaker? }` → `Project`.
Une traduction modifiée remet `validated` à faux. `validated` écrit `TEXTE_VALIDE` ou
`VALIDATION_RETIREE` (avec `text_hash`). Remplace `editTranslation` et `setValidated`.

**`POST /api/projects/:id/segments/:segId/apply-suggestion`** → `Project`.
Applique `reviews[segId].suggestion`, retire l'approbation. Remplace `applySuggestion`.

**`POST /api/projects/:id/analysis`** →
```ts
{ audio: { path: string; sha256: string; duration: number; mime: "audio/ogg" | "audio/wav" };
  frames: { t: number; path: string }[];          // 60 au plus
  originalPath?: string }
```
→ `202 { jobId }`. Tâche `analysis`, étapes = `ANALYSIS_STEPS`. Résultat : le projet rempli
(`segments`, `speakers`, `characters`, `proposals`, `reviews`, `pipeline.status: "done"`).
409 `EN_COURS` si une analyse tourne déjà. Remplace `runAnalysis` (`media/pipeline.ts`).

**`POST /api/projects/:id/review`** `{ segmentIds?: string[] }` → `202 { jobId }`.
Tâche `review` (LLM 2 + vérificateur de fidélité). Remplace `reviewAll`.

### Personnages et autorisations

**`PATCH /api/projects/:id/characters/:key`** `{ name?, description?, confirmed?, useOriginal?, lifeStatus? }` → `Project`.
`confirmed: true` écrit `PERSONNAGE_CONFIRME` ; `lifeStatus` écrit `STATUT_DE_VIE_RENSEIGNE`.
Remplace `updateCharacter`, `confirmCharacter`, `setUseOriginal`, `setLifeStatus`.

**`POST /api/projects/:id/characters/:key/consent`** `{ email, registered }` → `{ project: Project, consentUrl }`.
Nouveau jeton (l'ancien est remplacé), e-mail, journal `CONSENTEMENT_DEMANDE` (e-mail haché).
`consentUrl` n'est renvoyé qu'ici. Remplace `sendConsent`.

**`POST /api/projects/:id/characters/:key/dossier`**
`{ path, deceasedName, declaredRole, fileName, fileSize, fileType, fileHash }` → `202 { jobId, project }`.
Statut « Document reçu », journal `DOSSIER_FAMILIAL_RECU`, notification, puis tâche
`dossier_check` (statut « Analyse en cours » puis l'un des trois résultats ; journal
`CONTROLE_COHERENCE`). Résultat : `FamilyCheck`. Remplace `uploadDossier`.

**`POST …/characters/:key/dossier/validate`** → `Project`. Seulement si le statut est
`correspondance` (`canValidateDossier`), sinon 409. Journal `DOSSIER_FAMILIAL_VALIDE`.
Remplace `validateDossier`.

**`POST …/characters/:key/dossier/complementary`** → `Project`. Journal
`VERIFICATION_COMPLEMENTAIRE_DEMANDEE`. Remplace `requestComplementary`.

**`DELETE …/characters/:key/dossier`** → `Project` (dossier remplacé, statut « Document manquant »).
Remplace `resetDossier`.

**`POST …/characters/:key/voice`** `{ voiceId }` → `Project`. `useOriginal` repasse à faux,
journal `VOIX_ATTRIBUEE`. Remplace `assignVoice` et `setSpeakerVoice`.

### Pages publiques : consentement

**`GET /api/public/consents/:token`** →
```ts
{ projectTitle: string; creatorName: string; characterName: string; characterDescription: string;
  status: LivingStatus; registered: boolean; paragraph: string; voiceCreated: boolean }
```

**`POST /api/public/consents/:token/voice-passport`**
`{ samplePath, duration, peak, rms, publicName, pseudonym, languages }` → `202 { jobId }`.
Tâche `voice_check` (IA.md § 6) ; si l'échantillon est conforme, crée le profil et la licence
signée, `registered` passe à vrai, journal `PASSEPORT_DE_VOIX_CREE`.

**`POST /api/public/consents/:token/decision`** `{ accept: boolean }` → `{ status }`.
409 `DEJA_DECIDE` si déjà répondu. Journal `CONSENTEMENT_ACCORDE` ou `CONSENTEMENT_REFUSE`,
notification et e-mail au créateur. Remplace `respondConsent`.

### Voix, licences, paiements

**`GET /api/voices`** → `VoiceProfile[]` avec `availability` recalculée (licence révoquée → `indisponible`).

**`POST /api/voices/:voiceId/preview`** `{ text }` → `audio/mpeg` (ou 403 `{ decision }`).
Écoute d'un échantillon : moteur de règles et filtre, débit de jetons. Remplace `tryVoice`.

**`POST /api/license-requests`** `{ projectId, characterKey, voiceId, message }` →
`{ request: LicenseRequest, licenceUrl?: string }`. `licenceUrl` n'est renvoyé que pour un
profil fictif sans compte (démo). E-mail et notification au titulaire, journal
`LICENCE_DEMANDEE`. Remplace `requestLicense`.

**`POST /api/license-requests/:id/decision`** `{ accept }` (titulaire connecté) → `LicenseRequest`.
410 si expirée, 409 si déjà décidée. Journal `LICENCE_ACCEPTEE` ou `LICENCE_REFUSEE`,
notification et e-mail au créateur. Remplace `respondLicense` (espace propriétaire).

**`POST /api/license-requests/:id/expire`** (démo, créateur) → `LicenseRequest` expirée.
Remplace le bouton de démonstration `expireRequest`.

**`GET /api/public/licences/:token`** → `{ request: LicenseRequest, ownerName, projectFormat }`.

**`POST /api/public/licences/:token/decision`** `{ accept }` → `LicenseRequest`. Comme la décision connectée.

**`POST /api/payments`** →
```ts
| { kind: "licence"; requestId: string; simulateFailure?: boolean }
| { kind: "jetons"; plan: "gratuit" | "createur" | "studio" }
```
→ `{ payment, balance, request?: LicenseRequest }`. **Aucun argent réel.** Licence : la demande
doit être acceptée ; le paiement est confirmé à l'instant (`method: "prototype_gratuit"`,
0 DT débité), sauf `simulateFailure` qui garde le bouton « échec » de la démo. Jetons : le plan
change et ses jetons mensuels sont crédités aussitôt (`achat_prototype`). Journal
`PAIEMENT_CONFIRME` ou `PAIEMENT_ECHOUE`. Remplace `payLicense` et `setPlan`.

### Génération, aperçus, export

**`POST /api/projects/:id/segments/:segId/synthesize`** → `{ gen: GenState, audioUrl?: string }`.
Aperçu d'une réplique depuis la timeline (règles, filtre, jetons, ElevenLabs). Remplace `generate(sid)`.

**`POST /api/projects/:id/generation`** → `202 { jobId }`. Tâche `generation`, étapes = `GEN_STAGES`,
`synthDone` / `synthTotal` tenus à jour dans `projects.generation`. À la fin : passeport signé,
notification « Rendu prêt ». Remplace `startGeneration`.

**`GET /api/projects/:id/audio`** → `{ [segId]: { url: string; start: number; end: number } }`
(URL signées 10 min). Utilisé par l'export MP4 et la lecture de la timeline.

**`POST /api/tts`** : contrat actuel d'`api/tts.ts`, conservé pendant la transition.

### Passeports

**`POST /api/projects/:id/passport`** → `Passport360` signé par le serveur et rangé
(`passports`). Journal `PASSEPORT_EXPORTE`. Remplace `exportPassport`.

**`GET /api/public/passports/:id`** → `{ passport: Passport360, journal: AuditEntry[] }`.
`journal` = la chaîne jusqu'à l'entrée de tête citée dans le passeport, pour que
`verifyPassport(p, journal)` vérifie aussi la chaîne dans le navigateur.

### Espace propriétaire vocal

**`POST /api/owner/voice`** `{ profile: Omit<VoiceProfile, "voiceId" | "accountId">, samplePath, duration, peak, rms }`
→ `202 { jobId }`. Tâche `voice_check`, puis profil publié et licence signée. Remplace `createOwnVoice`.

**`PATCH /api/owner/voice/profile`** `Partial<VoiceProfile>` → `OwnedVoice`. Journal
`PROFIL_PUBLIC_MIS_A_JOUR`. Remplace `updateProfile`.

**`PATCH /api/owner/voice/rules`** `{ allowed_uses, forbidden_themes }` → `VoiceLicense` signée à nouveau.
Journal `PASSEPORT_MIS_A_JOUR`. Remplace `updateOwnLicense`.

**`POST /api/owner/licenses/:licenseId/revoke`** et **`…/reinstate`** → `VoiceLicense`.
Journal `LICENCE_REVOQUEE` / `LICENCE_RETABLIE` ; la révocation notifie les créateurs qui
utilisent la voix. Remplacent `revoke` et `reinstate`.

### Journal, notifications, tâches

**`GET /api/journal?projectId=`** → `AuditEntry[]` (chaîne complète, ou entrées d'un projet).

**`POST /api/journal/export`** `{ kind, detail }` → `AuditEntry`. Remplace `logExport`.

**`GET /api/notifications?since=<iso>`** → `Notice[]` (les deux espaces du compte).

**`POST /api/notifications/read`** `{ space }` → `204`. Remplace `markRead`.

**`GET /api/jobs/:id`** → `Job`. Interrogé toutes les 1,5 s par `useJob`.

## 4. Correspondance avec le store

| Action du store (`store.ts`) | Route | Piste |
| --- | --- | --- |
| `login`, `signup`, `logout` | Supabase Auth (+ `POST /api/demo/session`) puis `GET /api/bootstrap` | A |
| `setPersona`, `openProject` | locales | — |
| `setPlan` | `POST /api/payments { kind: "jetons" }` | A |
| `createVideoProject` | `POST /api/projects` | A |
| `patchProject`, `setUse` | `PATCH /api/projects/:id` | A |
| `deleteProject` | `DELETE /api/projects/:id` | A |
| `runAnalysis` (`media/pipeline.ts`) | extraction + `POST /api/uploads` + `POST …/analysis` + `GET /api/jobs/:id` | B |
| `editTranslation`, `setValidated` | `PATCH …/segments/:segId` | A |
| `applySuggestion` | `POST …/segments/:segId/apply-suggestion` | B |
| `reviewAll` | `POST …/review` | B |
| `updateCharacter`, `confirmCharacter`, `setUseOriginal`, `setLifeStatus` | `PATCH …/characters/:key` | A |
| `sendConsent` | `POST …/characters/:key/consent` | D |
| `respondConsent` | `POST /api/public/consents/:token/decision` | D |
| `uploadDossier` | `POST /api/uploads` + `POST …/characters/:key/dossier` | D |
| `validateDossier`, `requestComplementary`, `resetDossier` | `…/dossier/validate`, `…/dossier/complementary`, `DELETE …/dossier` | D |
| `requestLicense` | `POST /api/license-requests` | A |
| `respondLicense` | `POST /api/license-requests/:id/decision` ou `/api/public/licences/:token/decision` | A |
| `payLicense` | `POST /api/payments { kind: "licence" }` | A |
| `expireRequest` | `POST /api/license-requests/:id/expire` | A |
| `assignVoice`, `setSpeakerVoice` | `POST …/characters/:key/voice` | A |
| `generate(sid)` | `POST …/segments/:segId/synthesize` | C |
| `tryVoice` | `POST /api/voices/:voiceId/preview` | C |
| `startGeneration` | `POST …/generation` | C |
| `exportPassport` | `POST …/passport` | A |
| `logExport` | `POST /api/journal/export` | A |
| `createOwnVoice` | `POST /api/owner/voice` | A (+ B pour le contrôle) |
| `updateProfile`, `updateOwnLicense` | `PATCH /api/owner/voice/profile`, `…/rules` | A |
| `revoke`, `reinstate` | `POST /api/owner/licenses/:id/revoke`, `…/reinstate` | A |
| `markRead` | `POST /api/notifications/read` | A |
| `reset` (menu du compte) | masqué en mode back-end (données partagées) | A |
