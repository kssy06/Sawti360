"""Vérificateur de fidélité (aperçu V1, règles déterministes).

Compares source and translation on: numbers, negations, capitalised names.
Planned for the semi-final: back-translation similarity + evaluation on 100
injected errors (results/fidelity.json — [à mesurer])."""
from __future__ import annotations

import re

_NUM = re.compile(r"\d+(?:[.,]\d+)?")
_NEG_FR = re.compile(r"\b(ne|n’|n'|pas|jamais|aucun|aucune|rien|sans)\b", re.I)
_NEG_SRC = re.compile(r"\b(ma|mouch|mich|ne|pas|jamais)\b|ما|مش|موش|لا", re.I)
_NAME = re.compile(r"(?<![.!?]\s)(?<!^)\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b")


def check(source: str, translation: str) -> list[dict]:
    """Returns a list of alerts [{type, message}] — empty list = nothing detected
    (which is NOT a proof of fidelity)."""
    alerts = []
    ns, nt = sorted(_NUM.findall(source)), sorted(_NUM.findall(translation))
    if ns != nt:
        alerts.append({"type": "CHIFFRES", "message": f"Chiffres différents : source {ns or '∅'} → traduction {nt or '∅'}"})
    if bool(_NEG_SRC.search(source)) != bool(_NEG_FR.search(translation)):
        alerts.append({"type": "NEGATIONS", "message": "Négation présente d’un seul côté : sens possiblement inversé."})
    names_s, names_t = set(_NAME.findall(source)), set(_NAME.findall(translation))
    missing = names_s - names_t
    if missing:
        alerts.append({"type": "NOMS", "message": f"Nom(s) propre(s) absent(s) de la traduction : {', '.join(sorted(missing))}"})
    return alerts
