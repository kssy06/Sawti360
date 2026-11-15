import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from sawti import fidelity, passport, synth
from sawti.bench import normalize, score

ROOT = Path(__file__).resolve().parent.parent
KW = dict(project_id="film_01", use="doublage_film", language="fr", requested_by="test", text="Bonjour")


@pytest.fixture
def signed(store, audit, tmp_path):
    lic = store.create(
        voice_id="voice_amine",
        holder_name="Amine B.",
        projects=["film_01"],
        valid_from="2020-01-01",
        valid_until="2099-01-01",
    )
    synth.generate(voice_id="voice_inconnue", store=store, audit=audit, out_dir=tmp_path, **KW)
    synth.generate(voice_id="voice_amine", store=store, audit=audit, out_dir=tmp_path, **KW)
    voices = [
        {"role": "Personnage 1", "kind": "consentie", "holder_name": lic.holder_name, "license_id": lic.license_id}
    ]
    p = passport.assemble(
        title="Film test",
        version="v1",
        asset_sha256=None,
        licenses=store.list(),
        audit=audit,
        validator="Validateur",
        referent="Référent",
        voices=voices,
        models=[synth.PLACEHOLDER_MODEL],
        energy=None,
        wer=None,
    )
    return passport.sign(p, store.key), store


def test_passport_verifies(signed):
    p, store = signed
    res = passport.verify(p, store.public_key)
    assert res["valide"] and res["signature"] and res["chaine"]
    assert p["responsabilite"]["nombre_refus"] == 1
    assert p["langues"]["fr"] == "[à mesurer]" and p["durabilite"]["kwh"] == "[à mesurer]"


@pytest.mark.attack("Modification d’un champ du Passeport 360° après signature", "INVALIDE (signature)")
def test_edit_one_field_fails(signed):
    p = copy.deepcopy(signed[0])
    p["identite"]["titre"] = "Autre film"
    res = passport.verify(p)
    assert not res["valide"] and not res["signature"]


@pytest.mark.attack("Journal réécrit dans le passeport puis re-signé avec une autre clé", "INVALIDE (chaîne + clé)")
def test_rewritten_journal_fails(signed):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    p, store = signed
    q = copy.deepcopy(p)
    q["responsabilite"]["journal"][0]["decision"] = "OK"
    q = passport.sign(q, Ed25519PrivateKey.generate())
    res = passport.verify(q, store.public_key)
    assert not res["valide"] and not res["chaine"] and not res["cle_attendue"]


def test_export_and_cli(signed, tmp_path):
    p, _ = signed
    files = passport.export(p, tmp_path)
    assert "Passeport 360°" in files["html"].read_text(encoding="utf-8") and files["qr"].read_bytes()[:4] == b"\x89PNG"
    run = lambda f: subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "verify_passport.py"), str(f)],  # noqa: E731
        capture_output=True,
        text=True,
    )
    ok = run(files["json"])
    assert ok.returncode == 0 and ok.stdout.startswith("VALIDE")
    data = json.loads(files["json"].read_text(encoding="utf-8"))
    data["voix"][0]["kind"] = "humaine"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(data), encoding="utf-8")
    ko = run(bad)
    assert ko.returncode == 1 and ko.stdout.startswith("INVALIDE")


def test_fidelity_detects_number_change():
    alerts = fidelity.check("Nlaqawk fil café, rendez-vous à 15 h.", "On se retrouve au café à 50 h.")
    assert [a["type"] for a in alerts] == ["CHIFFRES"]
    assert fidelity.check("Nlaqawk fil café, rendez-vous à 15 h.", "On se retrouve au café à 15 h.") == []


def test_bench_normalisation_and_score():
    assert normalize("Bonjour,  le MONDE !") == "bonjour le monde"
    assert normalize("أَهْلاً") == normalize("اهلا")
    assert score("bonjour le monde", "bonjour le monde")["wer"] == 0.0
    assert score("bonjour le monde", "bonjour monde")["wer"] == pytest.approx(1 / 3, abs=1e-3)
