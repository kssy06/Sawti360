"""Moteur de règles : authorize(request, licenses, now) -> Decision.

Pure function: no I/O, no clock, no database. Deterministic and fully tested.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Callable, Iterable

from .models import REASONS_FR, Decision, GenerationRequest, VoiceLicense


def _decision(code: str, now: datetime, lic: VoiceLicense | None = None) -> Decision:
    return Decision(
        allowed=(code == "OK"),
        reason_code=code,
        reason_fr=REASONS_FR[code],
        license_id=lic.license_id if lic else None,
        checked_at=now.isoformat(timespec="seconds"),
    )


def authorize(
    request: GenerationRequest,
    licenses: Iterable[VoiceLicense],
    now: datetime,
    *,
    blocked_voice_ids: Iterable[str] = (),
    verify_signature: Callable[[VoiceLicense], bool] | None = None,
) -> Decision:
    """Decide whether a voice generation may happen. Refuses by default."""
    blocked = {v.lower() for v in blocked_voice_ids}
    if request.voice_id.lower() in blocked:
        return _decision("PERSONNALITE_BLOQUEE", now)

    candidates = [l for l in licenses if l.voice_id == request.voice_id]
    if not candidates:
        return _decision("VOIX_NON_ENREGISTREE", now)

    today: date = now.date()
    # Evaluate every licence of this voice; return OK if one passes, else the
    # refusal of the most recent licence.
    last: Decision | None = None
    for lic in sorted(candidates, key=lambda l: l.license_id):
        last = _check_one(request, lic, now, today, verify_signature)
        if last.allowed:
            return last
    return last  # type: ignore[return-value]


def _check_one(request, lic, now, today, verify_signature) -> Decision:
    if verify_signature is not None and not verify_signature(lic):
        return _decision("SIGNATURE_INVALIDE", now, lic)
    if lic.status == "revoked" or lic.revoked_at:
        return _decision("LICENCE_REVOQUEE", now, lic)
    if today < date.fromisoformat(lic.valid_from):
        return _decision("LICENCE_PAS_ENCORE_VALIDE", now, lic)
    if lic.status == "expired" or today > date.fromisoformat(lic.valid_until):
        return _decision("LICENCE_EXPIREE", now, lic)
    if request.use in lic.forbidden_uses:
        return _decision("USAGE_INTERDIT", now, lic)
    if request.use not in lic.allowed_uses:
        return _decision("USAGE_NON_AUTORISE", now, lic)
    if "*" not in lic.projects and request.project_id not in lic.projects:
        return _decision("PROJET_NON_AUTORISE", now, lic)
    if request.language not in lic.languages:
        return _decision("LANGUE_NON_AUTORISEE", now, lic)
    if not request.human_validated:
        return _decision("VALIDATION_HUMAINE_MANQUANTE", now, lic)
    return _decision("OK", now, lic)
