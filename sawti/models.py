"""Data models: VoiceLicense, GenerationRequest, Decision, AuditEntry."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

REASONS_FR = {
    "OK": "Génération autorisée : licence valide et consentement vérifié.",
    "VOIX_NON_ENREGISTREE": "Voix non enregistrée : aucun Passeport de voix, consentement absent.",
    "LICENCE_REVOQUEE": "Licence révoquée par le titulaire : génération refusée.",
    "LICENCE_EXPIREE": "Licence expirée : génération refusée.",
    "LICENCE_PAS_ENCORE_VALIDE": "Licence pas encore valide à cette date.",
    "USAGE_NON_AUTORISE": "Cet usage ne figure pas dans les usages autorisés par le titulaire.",
    "USAGE_INTERDIT": "Cet usage est explicitement interdit par le titulaire.",
    "PROJET_NON_AUTORISE": "Ce projet n’est pas couvert par la licence.",
    "LANGUE_NON_AUTORISEE": "Cette langue n’est pas couverte par la licence.",
    "SIGNATURE_INVALIDE": "Signature du Passeport de voix invalide : licence altérée.",
    "PERSONNALITE_BLOQUEE": "Voix d’une personnalité publique : génération bloquée.",
    "VALIDATION_HUMAINE_MANQUANTE": "Le texte n’a pas été validé par un humain.",
}


def canonical_json(obj: Any) -> bytes:
    """Deterministic JSON used for every hash and signature."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class VoiceLicense:
    license_id: str
    voice_id: str
    holder_name: str
    holder_role: str = "comédien"
    allowed_uses: list[str] = field(default_factory=lambda: ["doublage_film"])
    forbidden_uses: list[str] = field(default_factory=lambda: ["publicite", "contenu_politique", "contenu_intime"])
    projects: list[str] = field(default_factory=lambda: ["*"])
    languages: list[str] = field(default_factory=lambda: ["fr"])
    valid_from: str = "2026-11-15"
    valid_until: str = "2027-05-15"
    remuneration: dict = field(
        default_factory=lambda: {"mode": "par_usage", "amount": None, "currency": "TND", "note": "[à définir]"}
    )
    no_training: bool = True
    status: str = "active"  # active | revoked | expired
    revoked_at: str | None = None
    consent_evidence_sha256: str = ""
    demo: bool = False  # True => « données de démonstration »
    signature: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def signed_payload(self) -> dict:
        """Fields covered by the signature. status/revoked_at are mutable and excluded."""
        d = self.to_dict()
        for k in ("signature", "status", "revoked_at"):
            d.pop(k)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> VoiceLicense:
        return cls(**d)


@dataclass
class GenerationRequest:
    request_id: str
    voice_id: str
    project_id: str
    use: str
    language: str
    requested_by: str
    text_hash: str
    timestamp: str = field(default_factory=now_iso)
    human_validated: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Decision:
    allowed: bool
    reason_code: str
    reason_fr: str
    license_id: str | None
    checked_at: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AuditEntry:
    index: int
    timestamp: str
    actor: str
    action: str
    payload_hash: str
    decision: str
    prev_hash: str
    entry_hash: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def compute_hash(self) -> str:
        d = self.to_dict()
        d.pop("entry_hash")
        return sha256_hex(canonical_json(d))
