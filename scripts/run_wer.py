"""Mesure WER/CER sur data/bench (Sawti-Bench) avec faster-whisper, énergie mesurée.
Écrit results/wer.json et results/wer.md. N’invente aucun résultat."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sawti import asr, bench, energy  # noqa: E402
from sawti.models import now_iso  # noqa: E402

RESULTS = Path(__file__).resolve().parent.parent / "results"


def main(model_size: str = "small") -> int:
    pairs = bench.find_pairs()
    if not pairs:
        print(bench.NO_DATA_MSG)
        print("Attendu : data/bench/derja_01.wav + data/bench/derja_01.txt (transcription manuelle, voix consentie).")
        return 0
    if not asr.available():
        print("faster-whisper n’est pas installé : pip install faster-whisper")
        return 1
    rows = []
    for p in pairs:
        out, rec = energy.measure(lambda p=p: asr.transcribe(p["audio"], p["langue"], model_size), f"asr:{p['id']}")
        energy.save(rec)
        s = bench.score(p["reference"].read_text(encoding="utf-8"), out["text"])
        rows.append(
            {
                "id": p["id"],
                "langue": p["etiquette"],
                "modele": out["model"]["name"],
                **s,
                "kwh": rec["kwh"],
                "duree_s": rec["duree_s"],
                "date": now_iso(),
            }
        )
        print(f"{p['id']}: WER={s['wer']:.1%} CER={s['cer']:.1%}")
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "wer.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    md = [
        "# Sawti-Bench — WER / CER mesurés",
        "",
        "Normalisation : voir `sawti/bench.py::normalize` (appliquée à la référence et à l’hypothèse).",
        "",
        "| Extrait | Langue | Modèle | WER | CER | Mots réf. | kWh | Durée (s) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    md += [
        f"| {r['id']} | {r['langue']} | {r['modele']} | {r['wer']:.1%} | {r['cer']:.1%} | {r['mots_reference']} | {r['kwh']} | {r['duree_s']} |"
        for r in rows
    ]
    (RESULTS / "wer.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:2]))
