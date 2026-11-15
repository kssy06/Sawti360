# Équipe rouge — scénarios d’attaque

Les résultats automatisés sont régénérés à chaque `pytest` dans [`results/attack_tests.md`](../results/attack_tests.md). Les échecs seront publiés ici.

| # | Scénario | Statut | Preuve |
|---|---|---|---|
| 1 | Voix non enregistrée | ✅ automatisé (V1) | `test_rules.py::test_unregistered` |
| 2 | Réutilisation d’une licence expirée ou révoquée | ✅ automatisé (V1) | `test_revoked`, `test_expired`, `test_revocation_flip` |
| 3 | Licence modifiée en base | ✅ automatisé (V1) | `test_bad_signature` |
| 4 | Journal d’audit réécrit | ✅ automatisé (V1) | `test_audit.py::test_tamper_detected` |
| 5 | Passeport 360° modifié ou re-signé avec une autre clé | ✅ automatisé (V1) | `test_passport.py` |
| 6 | Rejeu d’une ancienne autorisation | ⏳ finale | [à tester] |
| 7 | Retrait du filigrane par compression / rééchantillonnage | ⏳ finale | [à mesurer] |
| 8 | Empoisonnement du glossaire | ⏳ finale | [à tester] |
| 9 | Falsification des métadonnées / du texte après validation | ⏳ finale | [à tester] |

## Faiblesses déjà connues (V1)

- Un attaquant ayant accès à la base **et** à la clé privée peut recréer une chaîne cohérente : la clé doit être séparée (finale).
- Supprimer les dernières entrées du journal n’est détecté que si l’empreinte de tête a été publiée ailleurs (elle l’est dans chaque Passeport 360°).
- L’identifiant de voix est déclaratif : sans Shield, rien ne prouve que l’audio fourni correspond à la voix déclarée.
