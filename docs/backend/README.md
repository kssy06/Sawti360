# Back-end du prototype : commencer ici

> Plan de construction du back-end de Sawti 360, rédigé le jeudi 19 novembre 2026 au soir.
> Échéance : **vendredi 20 novembre au soir**, prototype en ligne, présenté au jury.
> L'interface de référence est la refonte d'Ahmed (PR #2, `web/`), conforme à la
> *Spécification UX V2* (PDF). Ce dossier dit comment rendre réel chaque bouton qu'elle
> simule aujourd'hui, sans casser la démonstration.

| Fichier | Contenu |
| --- | --- |
| [README.md](README.md) | Ce fichier : décisions, architecture en une page, pistes, planning, règles, démo |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Composants, arborescence, flux de chaque fonction, limites des offres gratuites, sécurité |
| [API.md](API.md) | Contrat de chaque route `/api/*` et correspondance avec les actions du store |
| [IA.md](IA.md) | Fournisseurs d'IA retenus, prompts, schémas de sortie, glossaire derja, Sawti-Bench |
| [SETUP.md](SETUP.md) | Comptes, clés, variables d'environnement, Supabase, Vercel, lancement local |
| [TACHES.md](TACHES.md) | Tâches par piste, critères d'acceptation, priorités, dépendances |
| [schema.sql](schema.sql) | Base de données Supabase, prête à coller (testée sur Postgres) |

## 1. Décisions prises le 19 novembre

| Sujet | Décision |
| --- | --- |
| Échéance | Vendredi 20 novembre au soir. Tout ce qui n'est pas prêt à 19 h garde sa version simulée. |
| Utilisateurs | Le jury uniquement. Données de démonstration, comptes de démonstration. |
| Budget | **Gratuit d'abord.** On ne paie que si un quota bloque la démo (voir § 5). |
| Confidentialité | Pas de contrainte pour le prototype : l'offre gratuite de Gemini est acceptée. On n'utilise que des vidéos et des voix de l'équipe (consentement écrit), jamais l'entretien de M. Dahmouni sans son accord écrit. |
| Paiements | **Le parcours de paiement reste.** « Payer » confirme immédiatement, sans argent réel : la licence devient utilisable et les jetons sont crédités. |
| Comptes Claude Pro | Ils servent à **écrire** le back-end avec Claude Code (un compte par piste). Ils ne servent pas de moteur d'IA au site : voir § 6. |

## 2. Architecture en une page

```
Navigateur (React 19 + Vite, interface d'Ahmed)
 ├─ supabase-js ........ connexion, envoi de fichiers par URL signée
 ├─ mediabunny ......... extrait l'audio et des images de la vidéo, fabrique le MP4 doublé
 └─ fetch /api/* ....... toutes les données et toutes les IA
        │
        ▼
Vercel : UNE fonction Node (Hono), web/api/index.ts, 300 s max
 ├─ Supabase Postgres .. projets, autorisations, licences, jetons, journal, passeports
 ├─ Supabase Storage ... audio, images, dossiers familiaux, échantillons de voix, répliques
 ├─ Groq ............... Whisper : découpe les prises de parole ; contrôle du texte lu (gratuit)
 ├─ Gemini ............. voit les images, entend l'audio : écrit la derja, intervenants,
 │                       personnages, traduction LLM 1, dossier familial (gratuit)
 ├─ Claude ou Groq ..... relecture LLM 2 (Claude si une clé API existe, sinon Groq)
 ├─ ElevenLabs ......... voix françaises (déjà branché dans api/tts.ts)
 └─ Gmail SMTP ......... e-mails des liens sécurisés (consentement, licence)
```

Pourquoi ce choix : il réutilise tout ce qui existe (le moteur de règles, le journal,
les signatures et le Passeport 360° de `web/src/core` tournent tels quels côté serveur),
il ne demande aucun serveur à maintenir, et tout est gratuit. Le traitement lourd de la
vidéo (audio, images, MP4) se fait dans le navigateur avec `mediabunny`, déjà installé :
aucune vidéo ne transite par Vercel, dont les requêtes sont limitées à 4,5 Mo.

## 3. Ce qui devient réel

| Fonction (écran de la spéc.) | Aujourd'hui | Après le back-end | Priorité |
| --- | --- | --- | --- |
| Comptes, connexion, mot de passe oublié (01) | localStorage | Supabase Auth | P0 |
| Données partagées entre appareils (02) | localStorage | Postgres : un lien de consentement s'ouvre sur un téléphone | P0 |
| Analyse : transcription, intervenants, personnages (04, 05) | exemples préparés | Gemini écrit la derja en écoutant la vraie vidéo ; Whisper donne les bornes | P0 |
| Consentement d'une personne vivante (06) | simulé, même navigateur | e-mail réel + page publique + Passeport de voix créé par la personne | P0 |
| Dossier familial d'une personne décédée (06) | recouvrement de mots-clés | Gemini lit le document et compare le rôle avec la vidéo, 3 résultats | P0 |
| Bibliothèque, demande de licence 72 h (07, 08) | simulé | e-mail au titulaire, réponse sans connexion, expiration réelle | P0 |
| Paiement de licence et jetons | simulé | paiement gratuit instantané, jetons crédités, part de 70 % au titulaire | P0 |
| Traduction LLM 1, vérification LLM 2 (10) | exemples préparés | Gemini traduit avec le contexte visuel, Claude ou Groq relit | P0 |
| Timeline, aperçu audio (11) | réel si une clé ElevenLabs est posée (la production tourne en mode test) | réel, audio conservé sur Supabase | P0 |
| Génération (12) | synthèse réelle, étapes suivantes simulées | synthèse + placement + ajustement du débit réels ; synchro labiale « Prévu » | P0 / P1 |
| MP4 téléchargeable (13) | bouton désactivé | MP4 fabriqué dans le navigateur, label IA et QR selon le format | P0 / P1 |
| Passeport 360° (§ 7) | signé avec une clé publique de démo | signé par le serveur (clé secrète), URL courte `/verifier?id=S360-…` | P0 |
| Journal d'audit | localStorage | chaîne SHA-256 en base, même format, falsification toujours détectée | P0 |
| Notifications (§ 8) | locales | en base, vues par chaque compte | P1 |
| Contrôle de l'échantillon de voix (14–16) | durée et niveau | + transcription de la lecture et taux d'erreur (WER) | P1 |
| Sawti-Bench (centre de confiance) | « à mesurer » | WER mesuré sur 10 à 20 extraits annotés, avec date et effectif | P1 |
| Clonage de voix consentie | non branché | ElevenLabs IVC (plan Starter, ~5–6 $) | P2 |
| Synchronisation labiale, séparation des pistes | simulées | restent « Prévu » : demandent un GPU (MuseTalk, LatentSync, Demucs) | hors délai |

## 4. Pistes et répartition

Quatre pistes qui touchent des fichiers différents, pour travailler en parallèle sans
conflit. Détail et critères d'acceptation : [TACHES.md](TACHES.md).

| Piste | Contenu | Responsable (rôles du README) | Compte Claude Code |
| --- | --- | --- | --- |
| **A. Socle** | API Hono, base, connexion, données partagées, journal, fichiers, tâches, licences, paiements, passeports | Amine (back-end et sécurité) | Compte 1, toute la nuit |
| **B. IA** | Extraction audio et images, transcription, analyse Gemini, LLM 2, contrôle de l'échantillon, Sawti-Bench | Youssef (parole), Koussay (langue) | Compte 2 |
| **C. Voix et export** | Génération, ajustement du débit, aperçus, MP4, label IA et QR, clonage (P2) | Ghayth (audio, front) | Compte 3 |
| **D. Autorisations, e-mails, confiance, QA** | E-mails, consentement, dossier familial, centre de confiance, recette, démo | Ahmed (chef d'équipe, référent éthique) | le premier compte libre |

La piste A est le chemin critique : A1 (squelette d'API), A2 (connexion) et A3 (données)
doivent être fusionnées avant vendredi 9 h. Les pistes B et C écrivent leurs modules
serveur (`web/server/ai/*`, `web/src/media/*`) en parallèle dès jeudi soir, testés seuls.

## 5. Planning (heure de Tunis)

| Créneau | A. Socle | B. IA | C. Voix et export | D. Autorisations, QA |
| --- | --- | --- | --- | --- |
| Jeu. 21 h – 22 h | **SETUP.md** : Supabase, clés, variables Vercel (Amine + Koussay) | clés Groq et Gemini, premiers appels à la main | essai mediabunny sur une vraie vidéo | prépare la vidéo de démo, le PDF familial, le texte des e-mails |
| Jeu. 22 h – 2 h | A1 squelette, A2 connexion, A3 données | B0 test express sur nos extraits, B1 extraction, B2 découpage, B3 Gemini (testés hors interface) | C3 export MP4 (isolé) | D1 e-mails (module seul) ; enregistrer les extraits de B0 |
| Ven. 9 h – 13 h | A4 journal, A5 fichiers, A6 tâches, A7 licences et paiements | B5 analyse de bout en bout, B4 LLM 2 | C1 génération, C5 aperçus | D2 consentement, D3 dossier familial |
| Ven. 13 h – 17 h | A8 passeports, A9 notifications, A10 espace titulaire | B7 échantillon de voix, B8 Sawti-Bench | C2 débit, C4 label IA et QR | D4 centre de confiance |
| Ven. 17 h – 19 h | données de démo en production, correctifs | correctifs | correctifs | **recette complète** (§ 8) |
| Ven. 19 h | **gel** : plus de nouvelle fonction ; répétition de la démo | | | |

Règle de coupe : une fonction qui ne marche pas de bout en bout à 17 h reste sur sa
version simulée (étiquette « Simulé »). La démo ne doit jamais casser.

Quotas : tout le P0 tourne gratuitement. Si un quota bloque pendant la journée, dans cet ordre :
1. activer la facturation du projet Google AI Studio (quelques centimes par analyse) ;
2. ElevenLabs Starter (~5–6 $ / mois : plus de crédits et clonage de voix) ;
3. 5 $ de crédit API Anthropic pour la relecture LLM 2 par Claude.

## 6. Questions posées par l'équipe

**« Si on paie une API, est-ce encore un prototype ? »** Oui. Un prototype se définit par
ce qu'il démontre (le parcours complet fonctionne), pas par la gratuité des services.
Utiliser des modèles du marché est normal ; il suffit de dire lesquels, ce que font déjà
le tableau « Place de l'IA » du README et les étiquettes Réel / Simulé de l'interface.
Vérifier seulement que le règlement du hackathon n'interdit pas les API externes.

**« On laisse un PC allumé avec Claude Pro qui répond au site ? »** Non. Un abonnement
Claude Pro n'inclut pas d'accès API, et les conditions d'utilisation grand public
d'Anthropic n'autorisent l'accès automatisé qu'avec une clé API. Ce serait aussi fragile :
les limites d'usage de Pro se réinitialisent par fenêtres de quelques heures et couperaient
la démo. Les comptes Pro sont parfaits pour **construire** : trois sessions Claude Code en
parallèle, une par piste. Laisser une session travailler la nuit est possible, à condition
de relire et de tester chaque PR le matin.

**« Claude peut-il traduire la derja ? »** Oui, Claude lit bien la derja (graphie arabe et
arabizi). Mais l'API de Claude ne prend ni audio ni vidéo : elle intervient donc en
relecture (LLM 2) et pour lire le dossier familial (PDF ou photo), là où elle apporte le
plus. Gemini, qui entend l'audio et voit les images, fait la traduction LLM 1.

**« Ces IA sont-elles les meilleures pour la derja ? »** Ce sont les meilleures **gratuites et
prêtes pour vendredi**, pas des meilleures prouvées : aucune étude ne les compare sur la derja.
Whisper, tel quel, écrit mal la derja (85 % de mots faux sur le test tunisien de NADI 2026) :
il ne sert qu'à découper le temps, et c'est Gemini qui écrit les mots. Le meilleur absolu
serait un Whisper affiné sur le tunisien (14 à 22 % d'erreurs), qui demande notre propre
serveur : après le hackathon. Détail et sources : [IA.md § 1 bis](IA.md#1-bis-est-ce-le-meilleur-pour-la-derja-) ;
la preuve sur nos extraits : test express B0.

## 7. Règles de travail

1. **Ne jamais casser la démo.** `VITE_BACKEND=1` active le back-end ; à `0`, l'interface
   d'Ahmed fonctionne exactement comme aujourd'hui (simulation dans `src/mock/`). Chaque
   action branchée garde sa version simulée en repli.
2. **Aucun secret dans le dépôt.** Les clés vivent dans Vercel (Settings → Environment
   Variables) et dans `web/.env.local` (ignoré par git). `.env.example` ne contient que des noms.
3. **Une branche par piste** (`back/a-socle`, `back/b-ia`, `back/c-voix`, `back/d-autorisations`),
   PR vers `main`, commits sous vos propres noms. Chaque PR passe `npm run typecheck`
   et `npm test` dans `web/`, et se vérifie sur l'aperçu Vercel.
4. **Les contrats d'[API.md](API.md) font foi.** Pour changer une route, changez d'abord
   le document, puis le code, dans la même PR.
5. **Ne pas reformater les fichiers d'Ahmed.** Les actions branchées vont dans
   `src/state/remote/*.ts` ; `store.ts` ne reçoit qu'une ligne d'aiguillage par action.
6. **Dire ce qui est réel.** Une étiquette `Simulé` ne passe à `Réel` que si le chemin réel
   s'est exécuté, avec le nom du modèle (ex. « Transcription : gemini-3.8-flash »).
7. **Imports relatifs côté serveur avec l'extension `.js`** (`../src/core/rules.js`) :
   Node ESM sur Vercel l'exige. C'est ce qui a fait planter `api/tts.ts` le 19 novembre.

## 8. Démonstration au jury (8 minutes) et recette

Matériel : un ordinateur avec Chrome, un téléphone, un extrait de 1 à 2 minutes en derja
tourné par l'équipe (deux intervenants), un PDF d'autorisation familiale fictif signé par
l'équipe, les deux comptes de démonstration.

1. Page d'accueil → **Connexion** avec le compte de démo *Nour Films*.
2. **Nouveau projet** → importer l'extrait → l'analyse tourne pour de vrai : étapes,
   images extraites, transcription derja, intervenants proposés.
3. **Personnages** : renommer et confirmer les deux intervenants.
4. **Autorisations** : intervenant A *vivant* → e-mail envoyé → ouvrir le lien **sur le
   téléphone** → lire le paragraphe pour créer son Passeport de voix → accepter → l'écran
   de l'ordinateur passe à « Autorisée ».
5. Intervenant B *décédé* → téléverser le PDF, indiquer le rôle → contrôle IA →
   « Correspondance détectée » → validation humaine. (Montrer aussi « Incohérence
   détectée » avec un rôle volontairement faux.)
6. **Voix** : choisir *Lina M.* → demande de licence → se connecter en *Lina M.* →
   accepter → revenir en *Nour Films* → payer (gratuit) → licence utilisable.
7. **Traduction** : traduction de Gemini, corrections de la relecture LLM 2 → appliquer
   une correction → approuver chaque réplique.
8. **Génération** → **Résultat** → télécharger le MP4 doublé → ouvrir le **Passeport 360°**
   → scanner le QR avec le téléphone → « Signature vérifiée » → centre de confiance :
   journal d'audit, falsification simulée détectée.

La recette complète (tous les écrans, mobile compris) est dans [TACHES.md](TACHES.md), tâche D5.

## 9. Lancer une session Claude Code sur une piste

Depuis un autre compte, cloner le dépôt puis coller ce message (remplacer la lettre) :

```text
Tu travailles sur le dépôt Sawti 360. Lis d'abord docs/backend/README.md, ARCHITECTURE.md,
API.md, IA.md, SETUP.md et TACHES.md, puis web/REDESIGN.md et web/PRODUCT.md.
Tu construis la piste A du back-end, sur la branche back/a-socle.
Prends les tâches de la piste A dans l'ordre de TACHES.md. Ne modifie que les fichiers listés
pour ta piste. Respecte les contrats d'API.md et les règles du § 7 de README.md.
Après chaque tâche : cd web && npm run typecheck && npm test, puis un commit clair.
Si une information manque (clé, choix produit), arrête-toi et pose la question.
```
