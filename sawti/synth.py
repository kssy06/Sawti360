"""Synthèse vocale — ALWAYS calls rules.authorize() first.

V1 honesty note: the "generation" is a placeholder (a short neutral tone WAV),
not a cloned voice. What is real in V1 is the gate: nothing is written to disk
when the decision is a refusal.
"""
from __future__ import annotations

import math
import struct
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

from . import guardrails
from .models import Decision, GenerationRequest, sha256_hex
from .rules import authorize

NEUTRAL_VOICE_ID = "voix_neutre"
PLACEHOLDER_MODEL = {"name": "sawti-placeholder-tone", "version": "0.1", "note": "signal sinusoïdal, aucun modèle IA"}


def _write_tone(path: Path, seconds: float = 1.0, freq: float = 440.0, rate: int = 16000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = b"".join(
            struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(int(seconds * rate))
        )
        w.writeframes(frames)


def generate(
    *, voice_id: str, project_id: str, use: str, language: str, requested_by: str, text: str,
    store, audit, out_dir: str | Path, human_validated: bool = True, now: datetime | None = None,
) -> tuple[Decision, Path | None]:
    """Returns (decision, wav_path or None). Every decision is appended to the audit log."""
    now = now or datetime.now(timezone.utc)
    req = GenerationRequest(
        request_id="REQ-" + uuid.uuid4().hex[:10], voice_id=voice_id, project_id=project_id, use=use,
        language=language, requested_by=requested_by, text_hash=sha256_hex(text),
        timestamp=now.isoformat(timespec="seconds"), human_validated=human_validated,
    )
    if voice_id == NEUTRAL_VOICE_ID:
        # Neutral generic voice: no holder, no licence needed, but human validation still applies.
        from .models import REASONS_FR
        code = "OK" if human_validated else "VALIDATION_HUMAINE_MANQUANTE"
        decision = Decision(code == "OK", code, REASONS_FR[code], None, req.timestamp)
    else:
        decision = authorize(
            req, store.list(), now,
            blocked_voice_ids=guardrails.blocked_voice_ids(), verify_signature=store.verify,
        )
    audit.append(
        requested_by,
        "GENERATION_AUTORISEE" if decision.allowed else "GENERATION_REFUSEE",
        {"request": req.to_dict(), "decision": decision.to_dict()},
        decision.reason_code,
    )
    if not decision.allowed:
        return decision, None  # refuse WITHOUT generating anything
    out = Path(out_dir) / f"{req.request_id}.wav"
    _write_tone(out)
    return decision, out
