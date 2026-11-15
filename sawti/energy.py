"""Panneau énergie : CodeCarbon wrapper. Only measured values; None => « [à mesurer] »."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

from .models import now_iso

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results" / "energy.json"


def measure(fn: Callable[[], Any], label: str = "tache", country_iso: str = "TUN") -> tuple[Any, dict]:
    """Runs fn() under CodeCarbon (offline mode, no network). Returns (result, record)."""
    record = {"tache": label, "date": now_iso(), "kwh": None, "gco2": None, "duree_s": None,
              "methode": "CodeCarbon OfflineEmissionsTracker (estimation CPU/RAM, mix électrique du pays)",
              "pays": country_iso}
    tracker = None
    try:
        from codecarbon import OfflineEmissionsTracker

        logging.getLogger("codecarbon").setLevel(logging.CRITICAL)
        tracker = OfflineEmissionsTracker(country_iso_code=country_iso, save_to_file=False, log_level="critical")
        tracker.start()
    except Exception as exc:  # codecarbon missing or unsupported hardware: stay honest
        record["erreur"] = f"mesure indisponible : {exc}"
        tracker = None
    t0 = time.perf_counter()
    try:
        result = fn()
    finally:
        record["duree_s"] = round(time.perf_counter() - t0, 4)
        if tracker is not None:
            try:
                emissions_kg = tracker.stop()
                data = tracker.final_emissions_data
                record["kwh"] = float(data.energy_consumed)
                record["gco2"] = float(emissions_kg or 0.0) * 1000.0
            except Exception as exc:
                record["erreur"] = f"mesure indisponible : {exc}"
    return result, record


def save(record: dict, path: Path | None = None) -> None:
    path = Path(path or RESULTS)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = load(path)
    data.append(record)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load(path: Path | None = None) -> list[dict]:
    path = Path(path or RESULTS)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def summary(records: list[dict]) -> dict:
    ok = [r for r in records if r.get("kwh") is not None]
    if not ok:
        return {"kwh": "[à mesurer]", "gco2": "[à mesurer]", "duree_s": "[à mesurer]", "mesures": 0}
    return {"kwh": sum(r["kwh"] for r in ok), "gco2": sum(r["gco2"] for r in ok),
            "duree_s": round(sum(r["duree_s"] for r in ok), 3), "mesures": len(ok), "methode": ok[0]["methode"]}
