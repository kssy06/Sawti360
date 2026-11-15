"""Garde-fous V1 : blocklist de personnalités, signalement d’abus, contenus sensibles."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCKLIST_PATH = ROOT / "data" / "blocklist.json"

SENSITIVE_USES = {"contenu_intime", "contenu_politique", "publicite"}


def load_blocklist(path: Path | None = None) -> dict:
    path = Path(path or BLOCKLIST_PATH)
    if not path.exists():
        return {"voice_ids": [], "name_keywords": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"voice_ids": data.get("voice_ids", []), "name_keywords": data.get("name_keywords", [])}


def blocked_voice_ids(path: Path | None = None) -> list[str]:
    return load_blocklist(path)["voice_ids"]


def is_blocked_name(name: str, path: Path | None = None) -> bool:
    """Used when creating a licence: refuse holders matching a blocked keyword."""
    low = name.lower()
    return any(k.lower() in low for k in load_blocklist(path)["name_keywords"])


def is_sensitive_use(use: str) -> bool:
    return use in SENSITIVE_USES


def report_abuse(audit, reporter: str, description: str, voice_id: str | None = None):
    """« Signaler un abus » : logged in the audit chain for the référent éthique."""
    return audit.append(reporter, "SIGNALEMENT_ABUS", {"voice_id": voice_id, "description": description}, "A_TRAITER")
