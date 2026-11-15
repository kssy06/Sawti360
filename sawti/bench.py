"""Sawti-Bench : références + WER/CER par langue, après une normalisation documentée."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BENCH_DIR = ROOT / "data" / "bench"
NO_DATA_MSG = "Aucune donnée Sawti-Bench trouvée — à fournir par l’équipe"

_ARABIC_DIACRITICS = re.compile(r"[ً-ْٰـ]")


def normalize(text: str) -> str:
    """Documented normalisation applied to BOTH reference and hypothesis:
    NFKC, lowercase, remove Arabic diacritics/tatweel, unify alef/ya/ta-marbuta
    variants, strip punctuation, collapse whitespace."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = _ARABIC_DIACRITICS.sub("", t)
    t = re.sub("[أإآ]", "ا", t).replace("ى", "ي").replace("ة", "ه")
    t = "".join(" " if unicodedata.category(c)[0] in "PS" else c for c in t)
    return re.sub(r"\s+", " ", t).strip()


def find_pairs(bench_dir: Path | None = None) -> list[dict]:
    """A pair = <nom>.wav + <nom>.txt. Language from the file prefix: derja_* -> ar, fr_* -> fr."""
    bench_dir = Path(bench_dir or BENCH_DIR)
    pairs = []
    for wav in sorted(bench_dir.glob("*.wav")):
        txt = wav.with_suffix(".txt")
        if txt.exists():
            lang = "fr" if wav.stem.startswith("fr") else "ar"
            pairs.append(
                {
                    "id": wav.stem,
                    "audio": wav,
                    "reference": txt,
                    "langue": lang,
                    "etiquette": "fr" if lang == "fr" else "ar-TN (derja)",
                }
            )
    return pairs


def score(reference: str, hypothesis: str) -> dict:
    import jiwer

    ref, hyp = normalize(reference), normalize(hypothesis)
    return {
        "wer": round(jiwer.wer(ref, hyp), 4),
        "cer": round(jiwer.cer(ref, hyp), 4),
        "mots_reference": len(ref.split()),
    }
