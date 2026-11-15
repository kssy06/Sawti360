# Guide du projet

## Lancer la démonstration

Depuis la racine du dépôt :

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/seed_demo.py
streamlit run app/streamlit_app.py
```

Les licences de démonstration sont fictives. La génération audio produit un signal neutre de remplacement, pas une voix synthétique.

## Vérification hors ligne

```powershell
python scripts/verify_passport.py exports/passeport_360.json
```

Le script `scripts/run_wer.py` est optionnel et nécessite `faster-whisper` ainsi que des paires consenties de fichiers `.wav` et `.txt` sous `data/bench/`. Les mesures ne sont pas calculées tant que ces données ne sont pas fournies.

## Organisation

- `app/` : interface Streamlit.
- `sawti/` : règles d’autorisation, licences, audit, passeport et mesures.
- `scripts/` : initialisation de la démo, vérification et mesures optionnelles.
- `tests/` : tests du moteur de confiance et des composants principaux.
- `data/` : exemples publics et données locales. `data/private/`, `data/consents/` et `data/bench/` sont ignorés par Git.
- `docs/` : architecture, éthique, données et guide du projet.
- `design/` : sources HTML et Python des maquettes ; `docs/maquettes/` conserve leurs exports PNG.

Les clés cryptographiques et les données de voix ne doivent pas être ajoutées au dépôt. Les limites de la démonstration sont documentées dans `DATASHEET.md` et `ETHIQUE.md`.

## Documents de référence

- `ARCHITECTURE.md` : composants, données et flux d’autorisation.
- `ETHIQUE.md` : consentement, limites et règles de responsabilité.
- `DATASHEET.md` : modèles, dépendances et jeux de données avec leurs licences.
- `PROJECT_GUIDE.md` : commandes de démarrage et carte des dossiers.
- `maquettes/` : rendus PNG des sources dans `../design/maquettes/`.
