# Sawti 360 · prototype web

Interface du prototype : studio de doublage derja → français, bibliothèque de voix avec Passeport de voix, rémunération des titulaires en jetons, Passeport 360° signé et page de vérification publique.

## Ce qui est réel, ce qui est simulé

| Réel | Simulé |
|---|---|
| Moteur de règles (port de `sawti/rules.py`), refus par défaut | Profils des titulaires (fictifs) |
| Filtre de contenu : lignes rouges pour toutes les voix + thèmes interdits par chaque titulaire | Paiements et retraits (jetons sans argent réel) |
| Signatures Ed25519 des licences et du Passeport 360° | Clé de plateforme (clé de démonstration publique) |
| Journal d’audit à chaîne de hachage SHA-256, falsification détectée | Transcription et traduction (fixées pour l’extrait) |
| Vérificateur de fidélité (chiffres, négations) | |
| Synthèse vocale ElevenLabs, via la fonction serveur `api/tts.ts` | |

La clé ElevenLabs ne quitte jamais le serveur. `api/tts.ts` refait toute la vérification (licence, usage, langue, validation humaine, filtre de contenu) avant d’appeler le moteur : appeler l’API directement ne contourne rien. Le navigateur peut seulement ajouter des restrictions (une révocation, des thèmes interdits), jamais en retirer.

Les voix sont des voix de synthèse prédéfinies d’ElevenLabs, qui n’imitent aucune personne réelle.

## Lancer en local

```bash
cd web
npm install
npm run dev
```

Sans clé, l’interface fonctionne et la synthèse répond « non configurée ». Pour tester le parcours complet sans clé : `SAWTI_TTS_MOCK=1 npm run dev` (audio de test silencieux, signalé comme tel). Avec une clé : copier `.env.example` en `.env` et la remplir.

## Tests

```bash
npm test
```

135 tests (et 79 de plus avec une base Postgres locale) : le moteur de règles reprend les scénarios d’attaque de `tests/` (Python), plus le filtre de contenu, la fidélité, le journal, le Passeport 360° et la fonction serveur appelée directement.

## Déployer sur Vercel

1. Importer le dépôt dans Vercel, avec `web` comme dossier racine (framework : Vite).
2. Settings → Environment Variables : `ELEVENLABS_API_KEY`.
3. Déployer. La page `/verifier` est publique : c’est elle qu’ouvre le QR du Passeport 360°.
