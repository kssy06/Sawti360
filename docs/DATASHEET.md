# Fiche données et modèles

Règle : la licence de chaque modèle et jeu de données est vérifiée **avant** usage et consignée ici.
« À vérifier » signifie que la vérification doit être refaite sur la page source au moment de l’intégration.

## Utilisé dans la V1

| Nom | Version | Rôle | Licence | Usage commercial | Source |
|---|---|---|---|---|---|
| *Aucun modèle d’IA n’est exécuté dans le parcours de démonstration V1* | — | La « génération » est un signal sinusoïdal de remplacement (`sawti-placeholder-tone` 0.1) | — | — | `sawti/synth.py` |
| cryptography | 50.0.2 | Ed25519, Fernet | Apache-2.0 / BSD-3 | oui | https://github.com/pyca/cryptography |
| qrcode | 8.2 | QR de vérification | BSD | oui | https://github.com/lincolnloop/python-qrcode |
| jiwer | 4.0.0 | WER / CER | Apache-2.0 | oui | https://github.com/jitsi/jiwer |
| codecarbon | 3.3.2 | Mesure d’énergie | MIT | oui | https://github.com/mlco2/codecarbon |
| streamlit | 1.67.0 | Console | Apache-2.0 | oui | https://github.com/streamlit/streamlit |
| faster-whisper (optionnel) + poids Whisper `small` | à figer à l’installation | Transcription pour `scripts/run_wer.py` | MIT (code et poids) — à vérifier | oui | https://github.com/SYSTRAN/faster-whisper · https://github.com/openai/whisper |

## Prévu (demi-finale / finale) — licences à confirmer à l’intégration

| Nom | Rôle | Licence annoncée | Point de vigilance |
|---|---|---|---|
| Modèle ASR tunisien (Hugging Face) | Transcription derja | [à vérifier] | plusieurs modèles sont **CC-BY-NC** : acceptable pour la démo, à lister comme limite |
| Demucs (htdemucs) | Séparation des pistes | MIT — à vérifier | données d’entraînement des poids |
| Opus-MT / Marian | Traduction | variable selon le modèle (souvent CC-BY 4.0) — à vérifier par modèle | qualité derja → français inconnue : [à mesurer] |
| Piper | Synthèse voix neutre | code MIT ; **chaque voix a sa propre licence** — à vérifier | n’utiliser qu’une voix à licence claire |
| SpeechBrain ECAPA-TDNN | Shield (empreintes vocales) | Apache-2.0 — à vérifier | entraîné sur VoxCeleb (conditions de recherche) : limite à déclarer |
| Filigrane audio open source | Marquage | [à vérifier] | retirable par compression : jamais présenté comme preuve unique |

## Jeux de données

| Nom | Contenu | Consentement | Statut |
|---|---|---|---|
| Sawti-Bench (`data/bench/`) | ~2 min de derja + transcription manuelle (cible : 20–30 min) | enregistrement d’un membre de l’équipe ou du cinéaste, **accord écrit obligatoire** dans `data/consents/` | **[à fournir par l’équipe]** |
| Données de démonstration (`scripts/seed_demo.py`) | licences fictives étiquetées « données de démonstration » | sans objet (aucune voix réelle) | ✅ |

Aucun audio de personne réelle n’est versionné dans ce dépôt.
