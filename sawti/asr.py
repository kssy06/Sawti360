"""Transcription locale (faster-whisper, poids Whisper sous licence MIT) avec
confiance par segment. Optional dependency: imported lazily."""
from __future__ import annotations

import math
from pathlib import Path


def available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def transcribe(audio_path: str | Path, language: str = "ar", model_size: str = "small") -> dict:
    """Returns {"text", "segments": [{start, end, text, confiance}], "model"}.
    confiance = exp(avg_logprob), in [0,1]; an indicator, not a calibrated probability."""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(audio_path), language=language)
    segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
             "confiance": round(math.exp(s.avg_logprob), 3)} for s in segments]
    return {"text": " ".join(s["text"] for s in segs), "segments": segs,
            "model": {"name": f"faster-whisper-{model_size}", "licence": "MIT"}}
