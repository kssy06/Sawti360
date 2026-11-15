"""Journal d’audit à chaîne de hachage (SQLite). Append-only by convention;
any modification is detected by verify_chain()."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .models import AuditEntry, canonical_json, now_iso, sha256_hex

GENESIS = "0" * 64


class AuditLog:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS audit (
                    idx INTEGER PRIMARY KEY, timestamp TEXT, actor TEXT, action TEXT,
                    payload_hash TEXT, decision TEXT, prev_hash TEXT, entry_hash TEXT, payload TEXT)"""
            )

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def head_hash(self) -> str:
        with self._conn() as c:
            row = c.execute("SELECT entry_hash FROM audit ORDER BY idx DESC LIMIT 1").fetchone()
        return row[0] if row else GENESIS

    def append(self, actor: str, action: str, payload: Any, decision: str = "", timestamp: str | None = None) -> AuditEntry:
        payload_json = canonical_json(payload).decode()
        with self._conn() as c:
            row = c.execute("SELECT idx, entry_hash FROM audit ORDER BY idx DESC LIMIT 1").fetchone()
            index, prev = (row[0] + 1, row[1]) if row else (0, GENESIS)
            e = AuditEntry(index, timestamp or now_iso(), actor, action, sha256_hex(payload_json), decision, prev)
            e.entry_hash = e.compute_hash()
            c.execute(
                "INSERT INTO audit VALUES (?,?,?,?,?,?,?,?,?)",
                (e.index, e.timestamp, e.actor, e.action, e.payload_hash, e.decision, e.prev_hash, e.entry_hash, payload_json),
            )
        return e

    def entries(self) -> list[AuditEntry]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT idx,timestamp,actor,action,payload_hash,decision,prev_hash,entry_hash FROM audit ORDER BY idx"
            ).fetchall()
        return [AuditEntry(*r) for r in rows]

    def payloads(self) -> dict[int, str]:
        with self._conn() as c:
            return dict(c.execute("SELECT idx, payload FROM audit").fetchall())

    def verify_chain(self) -> tuple[bool, int | None]:
        return verify_entries(self.entries())

    def count(self, decision_prefix: str) -> int:
        return sum(1 for e in self.entries() if e.decision.startswith(decision_prefix))

    def tamper_for_demo(self, index: int, new_decision: str = "OK") -> None:
        """DEMO ONLY: silently rewrites one entry, as an attacker with DB access would."""
        with self._conn() as c:
            c.execute("UPDATE audit SET decision=? WHERE idx=?", (new_decision, index))

    def restore_for_demo(self, index: int, decision: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE audit SET decision=? WHERE idx=?", (decision, index))


def verify_entries(entries: list[AuditEntry | dict]) -> tuple[bool, int | None]:
    """Returns (True, None) or (False, index of the first broken entry)."""
    prev = GENESIS
    for i, e in enumerate(entries):
        if isinstance(e, dict):
            e = AuditEntry(**e)
        if e.index != i or e.prev_hash != prev or e.compute_hash() != e.entry_hash:
            return False, i
        prev = e.entry_hash
    return True, None
