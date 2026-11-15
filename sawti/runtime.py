"""Shared paths and store factory for the app and scripts."""
from __future__ import annotations

from pathlib import Path

from .audit import AuditLog
from .licenses import LicenseStore

ROOT = Path(__file__).resolve().parent.parent
DB_DIR = ROOT / "data" / "private"
EXPORT_DIR = ROOT / "exports"
DEMO_PROJECT = "film_karim_court_metrage_01"
USES = ["doublage_film", "bande_annonce", "publicite", "contenu_politique", "contenu_intime"]
LANGS = ["fr", "ar", "en"]


def stores() -> tuple[LicenseStore, AuditLog]:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return LicenseStore(DB_DIR / "sawti.db"), AuditLog(DB_DIR / "audit.db")
