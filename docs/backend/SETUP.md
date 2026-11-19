# Mise en place : comptes, clés, variables, déploiement

Tâche A0 de [TACHES.md](TACHES.md), à faire jeudi soir à deux (Amine + Koussay), environ 1 h.
Les clés ne s'écrivent **jamais** dans le dépôt ni dans une discussion : seulement dans
Vercel et dans `web/.env.local` (ignoré par git). Les ranger dans le gestionnaire de mots
de passe de l'équipe.

## 1. Comptes à créer, dans l'ordre

| # | Service | Où | Ce qu'on récupère | Gratuit ? |
| --- | --- | --- | --- | --- |
| 1 | Gmail d'équipe | un compte Gmail dédié au projet | adresse + **mot de passe d'application** (§ 4) | oui |
| 2 | Supabase | supabase.com → New project | URL, clé publishable, clé secrète, chaîne de connexion (§ 2) | oui |
| 3 | Groq | console.groq.com → API Keys | `GROQ_API_KEY` | oui |
| 4 | Google AI Studio | aistudio.google.com → Get API key | `GEMINI_API_KEY` | oui (facturation possible) |
| 5 | ElevenLabs | elevenlabs.io → Developers → API Keys | `ELEVENLABS_API_KEY` (droits : synthèse ; voix si clonage) | 10 000 crédits/mois |
| 6 | Anthropic (optionnel) | platform.claude.com → Billing, puis API Keys | `ANTHROPIC_API_KEY` ; fixer une limite de dépense | non (prépayé, 5 $ min.) |

Dans les consoles Groq et AI Studio, ouvrir la page des limites du projet et noter les
quotas réels de `whisper-large-v3` et des modèles Gemini : ils remplacent les chiffres
tiers d'[IA.md](IA.md).

## 2. Supabase

1. **New project** : nom `sawti360`, région **Paris (eu-west-3)** ou Francfort (eu-central-1),
   mot de passe de base fort, rangé dans le gestionnaire de l'équipe.
2. **SQL Editor** → coller [schema.sql](schema.sql) → **Run**. Vérifier dans **Table Editor**
   les 14 tables et dans **Storage** les buckets privés `media`, `dossiers` et `samples`.
3. **Authentication → Sign In / Providers → Email** : activé ; **Confirm email : désactivé**
   (prototype, pas de confirmation à l'inscription).
4. **Authentication → URL Configuration** :
   Site URL `https://sawti360.vercel.app` ; Redirect URLs `http://localhost:5173/**`,
   `https://sawti360.vercel.app/**`, et l'adresse des aperçus Vercel (`https://*-<équipe>.vercel.app/**`).
5. **Authentication → Emails → SMTP Settings** : SMTP personnalisé avec le Gmail d'équipe
   (`smtp.gmail.com`, port 465, adresse, mot de passe d'application, expéditeur « Sawti 360 »).
   Sans cela, « mot de passe oublié » n'écrit qu'aux membres de l'organisation Supabase.
6. **Project Settings → API Keys** : copier la clé **publishable** (ex-« anon ») et la clé
   **secrète** (ex-« service_role »). La clé secrète ne va que côté serveur.
7. **Connect → Connection string → Transaction pooler** (port 6543) : c'est `DATABASE_URL`
   (y remplacer `[YOUR-PASSWORD]`). Le serveur s'y connecte avec `{ prepare: false, max: 1 }`.

Le changement de 2026 sur les droits de l'API de données (PostgREST) ne nous concerne pas :
le navigateur n'interroge jamais les tables, seul le serveur le fait, par connexion directe.

## 3. Clé de signature des passeports

Graine Ed25519 secrète (serveur) et clé publique (navigateur). Le script `web/scripts/keys.ts`
(tâche A8) les produit :

```bash
cd web && npx tsx scripts/keys.ts
```

Il affiche `SAWTI_SIGNING_SEED=<64 caractères hex>` et `VITE_SAWTI_PUBLIC_KEY=<64 caractères hex>`.
Changer la graine invalide les passeports déjà signés : la fixer une fois pour toutes avant la démo.

## 4. Gmail : mot de passe d'application

Compte Google d'équipe → **Sécurité** → activer la **validation en deux étapes** →
**Mots de passe des applications** → créer « Sawti 360 » → 16 caractères = `SMTP_PASS`.
Limite d'environ 500 destinataires par jour. Pour la démo, les comptes de démonstration
peuvent utiliser des alias du même Gmail (`equipe+nour@gmail.com`, `equipe+lina@gmail.com`) :
le jury voit alors les e-mails arriver.

## 5. Variables d'environnement

Les variables `VITE_*` sont lues par le navigateur : elles sont publiques par nature et ne
contiennent jamais de secret. Toutes les autres sont réservées au serveur.

| Variable | Côté | P0 | Valeur |
| --- | --- | --- | --- |
| `VITE_BACKEND` | navigateur | oui | `1` (à `0`, l'interface reste entièrement simulée) |
| `VITE_SUPABASE_URL` | navigateur | oui | `https://<projet>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navigateur | oui | clé publishable (§ 2.6) |
| `VITE_SAWTI_PUBLIC_KEY` | navigateur | oui | clé publique (§ 3) |
| `APP_URL` | serveur | oui | `https://sawti360.vercel.app` (`http://localhost:5173` en local) |
| `SUPABASE_URL` | serveur | oui | même URL que ci-dessus |
| `SUPABASE_SECRET_KEY` | serveur | oui | clé secrète (§ 2.6) |
| `DATABASE_URL` | serveur | oui | chaîne « Transaction pooler » (§ 2.7) |
| `SAWTI_SIGNING_SEED` | serveur | oui | graine (§ 3) |
| `GROQ_API_KEY` | serveur | oui | console Groq |
| `GEMINI_API_KEY` | serveur | oui | AI Studio |
| `ELEVENLABS_API_KEY` | serveur | oui | ElevenLabs |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | serveur | oui | `smtp.gmail.com`, `465`, adresse, mot de passe d'application, `Sawti 360 <adresse>` |
| `DEMO_EMAILS` | serveur | oui | `nour=<e-mail>,lina=<e-mail>` : seuls comptes ouvrables par `/api/demo/session` |
| `DEMO_PASSWORD` | script | oui | mot de passe des comptes de démo, utilisé par `npm run seed` |
| `ANTHROPIC_API_KEY` | serveur | non | active la relecture LLM 2 par Claude |
| `CLAUDE_MODEL` | serveur | non | `claude-opus-5-5` par défaut (IA.md § 1) |
| `GROQ_ASR_MODEL`, `GROQ_LLM_MODEL` | serveur | non | défauts d'IA.md § 1 |
| `GEMINI_MODEL`, `GEMINI_MODEL_DEV` | serveur | non | défauts d'IA.md § 1 |
| `TTS_MODEL` | serveur | non | `eleven_multilingual_v2` |
| `SAWTI_TTS_MOCK` | serveur | non | `1` = audio de test silencieux et signalé (développement) |

Le `web/.env.example` du dépôt est mis à jour en A1 avec ces noms, sans valeurs.

## 6. Vercel

Le projet `sawti360` existe (équipe `kssy06s-projects`, adresse https://sawti360.vercel.app,
dossier racine `web`). Il est relié au **fork** `kssy06/Sawti360` : chaque mise à jour du
dépôt d'origine demande « **Sync fork** » sur GitHub pour être déployée.

Recommandé avant vendredi matin : Youssef, propriétaire de `youssefbesbes/Sawti360`, installe
l'application GitHub de Vercel sur ce dépôt, puis **Settings → Git → Connected Git Repository**
pointe vers le dépôt d'origine. Chaque push sur `main` est alors déployé et chaque PR reçoit
une adresse d'aperçu.

Dans **Settings** :
- **Environment Variables** : toutes les variables du § 5, pour Production et Preview.
  **Supprimer `SAWTI_TTS_MOCK=1`** de Production quand `ELEVENLABS_API_KEY` est en place
  (posée le 19 novembre pour que le site marche sans clé).
- **Functions → Function Region** : la même région que Supabase (`cdg1` Paris ou `fra1` Francfort).
- **Deployment Protection** : laisser l'adresse de production publique (le jury l'ouvre sans compte).

## 7. Lancer en local

```bash
cd web
cp .env.example .env.local      # puis remplir les valeurs
npm install
npm run dev                     # http://localhost:5173 ; l'API tourne dans Vite (plugin localApi)
```

Remarques :
- `vite.config.ts` doit charger toutes les variables pour le code serveur local :
  `Object.assign(process.env, loadEnv(mode, process.cwd(), ""))` (tâche A1).
- Données de démonstration (une fois, puis après chaque remise à zéro) :
  `npm run seed` (= `tsx --env-file=.env.local scripts/seed.ts`).
- Sans back-end : `VITE_BACKEND=0 npm run dev:demo`, comme aujourd'hui.
- Tests sur une vraie base Postgres (le schéma est appliqué tel quel dans une base temporaire par
  fichier de test, avec des substituts d'`auth.users` et `storage.buckets`) :
  `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test`.
  Sans cette variable, ces tests sont sautés et les autres tournent.

## 8. Vérifier que tout est branché

```bash
curl -s https://sawti360.vercel.app/api/health
```

Attendu : `"backend": true`, une `publicKey`, et pour chaque fournisseur un nom de modèle
(et non `null`) : `asr`, `llm1`, `llm2`, `dossier`, `tts`, `mail: true`.
