# SAWTI 360 — Refonte UI/UX (expérimentale)

Branche de travail locale, non poussée. Ce document résume l'audit, les écarts entre la
Spécification UX V2 (PDF) et le dépôt, et le plan d'implémentation.

## 1. Audit du dépôt

| Élément | Constat |
|---|---|
| Front | React 19 + Vite 8 + TypeScript strict, react-router 7, zustand 5 (persist localStorage), lucide-react, IBM Plex Sans / Arabic / Mono, qrcode, @noble/ed25519 + hashes, fflate |
| Serveur | Une seule fonction `api/tts.ts` (Vercel, Node) : rejoue le moteur de règles puis appelle ElevenLabs. Servie en local par un plugin Vite |
| Back Python | `sawti/` (règles, audit, passeport, bench, énergie) + `app/streamlit_app.py` : non touché |
| Logique métier front | `src/core/*` : moteur de règles (refus par défaut), filtre de contenu, vérificateur de fidélité, journal à chaîne SHA-256, signatures Ed25519, Passeport 360° signé et encodé dans l'URL (`/verifier#p=`) |
| Tests | 35 tests vitest, verts avant la refonte |
| Auth | Aucune. Deux personas fictives (créatrice / titulaire) |
| Dépendances inutilisées | `mediabunny`, `zod` (laissées en place) |

Fonctionnalités existantes à préserver : moteur de règles et passerelle `runGate` (client + serveur),
synthèse ElevenLabs (ou mode test), journal d'audit et simulation de falsification, signature et
vérification publique du Passeport 360°, import local de vidéo avec extraction réelle d'images,
export SRT, jetons et part de 70 % au titulaire, révocation de licence.

## 2. Écarts PDF ↔ dépôt et résolution proposée

| Sujet | PDF V2 | Dépôt | Résolution |
|---|---|---|---|
| Voix originale | Statut vivant/décédé obligatoire, consentement ou dossier familial | N'existe pas (seules les voix de remplacement) | Ajout d'un module d'autorisation par intervenant (`state/workflow.ts`), règles de la V2 appliquées telles quelles |
| Licence de voix | Permanente pour un projet précis, demande par e-mail, expiration 72 h, tarif fixé par le titulaire (0 possible) | Passeport de voix signé : usages, thèmes interdits, validité datée, rémunération 70 % des jetons | Les deux coexistent : le Passeport de voix fixe les conditions permanentes du titulaire ; la **licence de projet** (PDF) s'ajoute par-dessus. La synthèse exige les deux : demande acceptée (+ paiement si tarif > 0) **et** décision OK du moteur de règles |
| Paiement | Tarif de licence, paiement si nécessaire | Jetons par caractère, paiements simulés | Licences en DT (simulées), jetons conservés comme crédits de synthèse. Deux onglets dans Paiements. **Grille tarifaire Sawti : à confirmer (PDF §10)**, aucune borne inventée |
| Passeport vidéo | Identifiant, source, langues, intervenants et autorisations, référence familiale, voix, licences, IA, date | Schéma `sawti-passeport-360/0.1` (identité, voix, langues, transparence, responsabilité, sécurité, durabilité, signature) | Extension **additive** et optionnelle du schéma (champs `identifiant`, `source`, `intervenants`, `doublage_ia`), couverte par la même signature. Le document familial n'est jamais inclus, seulement sa référence et son statut |
| Parcours | 13 écrans créateur + 3 propriétaire | Studio unique, voix, passeport, journal, jetons, titulaire | Parcours guidé en 9 étapes par projet + espaces créateur / propriétaire |
| Label IA / QR | Début / fin selon format, Reels « à confirmer » | Label et QR au passeport | Règle par format dans `workflow.ts`, « à confirmer » affiché tel quel |

Points laissés ouverts comme dans le PDF §10 (l'interface les affiche « à confirmer ») : signataires
familiaux, formats du document familial, procédure de vérification complémentaire, invitation d'une
personne vivante non inscrite, grille tarifaire, durée du label IA, label sur Reels/Shorts.

## 3. Réel, simulé, exemple

Chaque écran porte une étiquette de provenance (`Réel`, `Simulé`, `Exemple`, `Prévu`).
Toute simulation est isolée dans `src/mock/` et ne prétend jamais qu'une opération serveur a réussi.

## 4. Plan

1. Design system (`styles.css`, tokens, composants `ui/`)
2. Shell, navigation à deux espaces, authentification de démonstration
3. Tableau de bord, projets, import (fichier + lien), analyse
4. Personnages, autorisations (vivant / décédé), pages publiques de consentement
5. Bibliothèque, demandes de licence (72 h, paiement), attribution des voix, espace propriétaire
6. Traduction (LLM 1 / LLM 2 / humain), timeline, génération, résultat
7. Passeport 360° (interne + page publique), centre de confiance (journal, Sawti-Bench, énergie, modèles)
8. Responsive, états, mouvement réduit, tests navigateur et passe de finition

## 5. Résultat de la refonte

### Lancer en local

```bash
cd web
npm install
npm run dev:demo     # moteur de voix en mode test (audio silencieux signalé) : parcours complet sans clé
# ou : npm run dev   # sans clé, la synthèse répond « non configurée » ; avec .env → ElevenLabs réel
npm test             # 49 tests (35 existants + 14 sur les règles V2)
```

Ouvrir http://localhost:5173 puis choisir un compte de démonstration (Nour Films : créatrice ;
Lina M. : propriétaire vocale, aussi créatrice). Menu du compte → « Réinitialiser les données ».

### Écrans

| Espace | Route | Spec |
|---|---|---|
| Connexion, inscription, mot de passe oublié | `/connexion`, `/inscription`, `/mot-de-passe-oublie` | 01 |
| Tableau de bord | `/tableau-de-bord` | 02 |
| Projets (tous, en cours, terminés) | `/projets?vue=` | 02 |
| Import fichier ou lien | `/nouveau` | 03 |
| Projet : analyse → personnages → autorisations → voix → traduction → timeline → génération → résultat | `/projet/:id/:etape` | 04–13 |
| Bibliothèque de voix | `/bibliotheque` | 07 |
| Demandes de voix (72 h) | `/demandes` | 08 |
| Passeports vidéo, Passeport 360° | `/passeports`, `/passeports/:id` | §7 |
| Paiements (licences, crédits) | `/paiements` | §2 |
| Centre de confiance (portes, modules, journal, Sawti-Bench, énergie, modèles) | `/confiance` | README |
| Propriétaire : vue d’ensemble, création du Passeport de voix, demandes, profil et tarif, règles, revenus | `/proprietaire/*` | 14–16 |
| Public sans compte : vérification, consentement, réponse à une licence | `/verifier#p=`, `/consentement/:jeton`, `/licence/:jeton` | §4, §5, §7 |

Les anciennes routes (`/studio/:id`, `/voix`, `/journal`, `/jetons`, `/ma-voix`, `/revenus`, `/passeport`) redirigent.

### Fichiers

- Conservés tels quels : `src/core/*` (sauf ajout de champs optionnels au type `Passport360`), `api/tts.ts`, tests existants.
- Nouveaux : `state/workflow.ts` (+ tests), `mock/registry.ts`, `mock/simulate.ts`, `ui/brand.tsx`, `ui/Recorder.tsx`,
  pages `Auth`, `Dashboard`, `ProjectRow`, `NewProject`, `Library`, `Requests` (+ Paiements), `licensing`,
  `PublicResponses`, `Trust`, `project/*` (8 étapes + `Workspace`, `shared`).
- Réécrits : `styles.css`, `ui/kit.tsx`, `ui/Shell.tsx`, `state/store.ts`, `main.tsx`, `pages/Projects.tsx`,
  `pages/Passport.tsx`, `pages/Owner.tsx`, `media/pipeline.ts`. Ajouts dans `media/local.ts` (empreinte, lien, durée WebM).
- Supprimés (remplacés) : `pages/Studio.tsx`, `Video.tsx`, `Voices.tsx`, `Journal.tsx`.
- Aucune nouvelle dépendance. Script ajouté : `dev:demo`.

### Réel, simulé, à brancher

| Réel dans ce prototype | Simulé (isolé dans `src/mock/`) | Demande un backend |
|---|---|---|
| Lecture locale de la vidéo, miniature, durée, empreinte SHA-256 avec progression | Transcription, détection des intervenants, traduction LLM 1, vérification LLM 2 (exemples préparés) | Comptes, sessions, envoi d’e-mails |
| Extraction d’images de la vidéo pendant l’analyse | Contrôle IA du dossier familial (recouvrement de mots-clés, 3 résultats) | Import des liens de plateformes (YouTube…) |
| Moteur de règles + filtre de contenu (navigateur puis serveur) | Étapes après la synthèse : timing, rythme, synchro labiale, mixage, export | Rendu MP4 doublé, clonage de la voix originale autorisée |
| Synthèse ElevenLabs (si clé) ou audio de test signalé | Paiements des licences, retraits | Paiements réels, grille tarifaire |
| Journal d’audit chaîné, détection de falsification | Comparaison voix / texte lu à la création du Passeport de voix | Persistance partagée des demandes (aujourd’hui `localStorage`) |
| Signature Ed25519 et vérification publique du Passeport 360° | Profils, tarifs et projets d’exemple | Mesures Sawti-Bench et énergie |
| Enregistrement micro + mesures (durée, crête, RMS), export SRT et JSON | | |

### Tests effectués

- `tsc -b` sans erreur, `vite build` réussi, 49 tests vitest verts.
- Navigateur (1440×900 et 375×812) : connexion, tableau de bord, liste des projets, import d’une vraie vidéo WebM
  générée dans le navigateur (miniature, durée, empreinte, analyse avec images extraites), personnages,
  parcours décédé complet (document corrigé → analyse → « Correspondance détectée » → validation humaine),
  page publique de consentement (création du Passeport de voix avec un enregistrement importé → accord),
  traduction (corrections LLM 2, approbations), timeline (aperçu audio par le moteur de règles, lecture, sous-titres),
  génération complète, résultat, Passeport 360° interne et public (signature vérifiée), bibliothèque
  (échantillon accepté, échantillon refusé pour licence révoquée), espace propriétaire (acceptation d’une demande, règles).
- Aucun débordement horizontal sur mobile sur 19 pages contrôlées.

### Limites connues

- Les demandes, consentements et projets vivent dans le `localStorage` : un lien de consentement ou de licence ne
  s’ouvre que dans le navigateur qui l’a créé (les onglets se synchronisent entre eux).
- Le MP4 doublé n’est pas produit : le bouton est désactivé et l’explique.
- L’URL publique du passeport contient tout le dossier (environ 2 Ko) : le QR code est dense. En production, une URL
  courte servie par le serveur réglerait ce point.
- Le parcours des Reels/Shorts, les signataires familiaux, la vérification complémentaire et la tarification restent
  affichés « à confirmer », comme dans la spécification.
