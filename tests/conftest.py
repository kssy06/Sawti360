"""Fixtures + automatic generation of results/attack_tests.md from the test run."""
from datetime import datetime, timezone
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from sawti.audit import AuditLog
from sawti.licenses import LicenseStore

ROOT = Path(__file__).resolve().parent.parent
NOW = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
_rows: list[tuple[str, str, str, str]] = []


@pytest.fixture
def store(tmp_path):
    return LicenseStore(tmp_path / "lic.db", private_key=Ed25519PrivateKey.generate())


@pytest.fixture
def audit(tmp_path):
    return AuditLog(tmp_path / "audit.db")


@pytest.fixture
def now():
    return NOW


def pytest_runtest_makereport(item, call):
    marker = item.get_closest_marker("attack")
    if marker and call.when == "call":
        observed = "✅ conforme à l’attendu" if call.excinfo is None else "❌ NON conforme"
        _rows.append((marker.args[0], marker.args[1], observed, item.nodeid))


def pytest_sessionfinish(session):
    if not _rows:
        return
    lines = ["# Tests d’attaque — résultats générés automatiquement", "",
             f"Généré par `pytest` le {datetime.now(timezone.utc).isoformat(timespec='seconds')}. Ne pas éditer à la main.", "",
             "| Scénario | Attendu | Observé | Test |", "|---|---|---|---|"]
    lines += [f"| {s} | {e} | {o} | `{n}` |" for s, e, o, n in _rows]
    out = ROOT / "results" / "attack_tests.md"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
