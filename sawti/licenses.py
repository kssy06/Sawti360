"""Passeport de voix : create, sign, verify, revoke, list (SQLite)."""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from pathlib import Path

from . import keys
from .models import VoiceLicense, canonical_json, now_iso


class LicenseStore:
    def __init__(self, db_path: str | Path, private_key=None):
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.key = private_key or keys.load_or_create_private_key()
        self.public_key = keys.public_key_b64(self.key)
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS licenses (license_id TEXT PRIMARY KEY, voice_id TEXT, data TEXT)")

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def next_id(self) -> str:
        year = date.today().year
        with self._conn() as c:
            n = c.execute("SELECT COUNT(*) FROM licenses").fetchone()[0]
        return f"VL-{year}-{n + 1:04d}"

    def sign(self, lic: VoiceLicense) -> VoiceLicense:
        lic.signature = keys.sign(self.key, canonical_json(lic.signed_payload()))
        return lic

    def verify(self, lic: VoiceLicense) -> bool:
        return keys.verify(self.public_key, canonical_json(lic.signed_payload()), lic.signature)

    def save(self, lic: VoiceLicense) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO licenses VALUES (?,?,?)",
                (lic.license_id, lic.voice_id, json.dumps(lic.to_dict(), ensure_ascii=False)),
            )

    def create(self, **fields) -> VoiceLicense:
        fields.setdefault("license_id", self.next_id())
        lic = self.sign(VoiceLicense(**fields))
        self.save(lic)
        return lic

    def get(self, license_id: str) -> VoiceLicense | None:
        with self._conn() as c:
            row = c.execute("SELECT data FROM licenses WHERE license_id=?", (license_id,)).fetchone()
        return VoiceLicense.from_dict(json.loads(row[0])) if row else None

    def list(self) -> list[VoiceLicense]:
        with self._conn() as c:
            rows = c.execute("SELECT data FROM licenses ORDER BY license_id").fetchall()
        return [VoiceLicense.from_dict(json.loads(r[0])) for r in rows]

    def revoke(self, license_id: str) -> VoiceLicense:
        lic = self.get(license_id)
        if lic is None:
            raise KeyError(license_id)
        lic.status, lic.revoked_at = "revoked", now_iso()
        self.save(lic)
        return lic
