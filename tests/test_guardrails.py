import wave

import pytest

from sawti import guardrails, synth, vault

KW = dict(project_id="film_01", use="doublage_film", language="fr", requested_by="test", text="Bonjour")


@pytest.mark.attack("Génération demandée pour une voix refusée", "Aucun fichier audio produit, refus journalisé")
def test_refusal_generates_nothing(store, audit, tmp_path):
    d, path = synth.generate(voice_id="voice_inconnue", store=store, audit=audit, out_dir=tmp_path / "out", **KW)
    assert not d.allowed and path is None and not (tmp_path / "out").exists()
    e = audit.entries()[-1]
    assert e.action == "GENERATION_REFUSEE" and e.decision == "VOIX_NON_ENREGISTREE"


def test_accept_then_revoke_end_to_end(store, audit, tmp_path):
    lic = store.create(
        voice_id="voice_amine", holder_name="A", projects=["film_01"], valid_from="2020-01-01", valid_until="2099-01-01"
    )
    d, path = synth.generate(voice_id="voice_amine", store=store, audit=audit, out_dir=tmp_path, **KW)
    assert d.allowed and path.exists()
    with wave.open(str(path)) as w:
        assert w.getnframes() > 0
    store.revoke(lic.license_id)
    d2, path2 = synth.generate(voice_id="voice_amine", store=store, audit=audit, out_dir=tmp_path, **KW)
    assert d2.reason_code == "LICENCE_REVOQUEE" and path2 is None
    assert [e.decision for e in audit.entries()] == ["OK", "LICENCE_REVOQUEE"] and audit.verify_chain()[0]


@pytest.mark.attack("Voix de la liste de blocage (personnalité publique)", "Refusé (PERSONNALITE_BLOQUEE)")
def test_blocklist_from_config(store, audit, tmp_path):
    assert guardrails.blocked_voice_ids()
    d, path = synth.generate(
        voice_id=guardrails.blocked_voice_ids()[0], store=store, audit=audit, out_dir=tmp_path, **KW
    )
    assert d.reason_code == "PERSONNALITE_BLOQUEE" and path is None


def test_neutral_voice_needs_human_validation(store, audit, tmp_path):
    d, _ = synth.generate(
        voice_id=synth.NEUTRAL_VOICE_ID, store=store, audit=audit, out_dir=tmp_path, human_validated=False, **KW
    )
    assert d.reason_code == "VALIDATION_HUMAINE_MANQUANTE"
    assert synth.generate(voice_id=synth.NEUTRAL_VOICE_ID, store=store, audit=audit, out_dir=tmp_path, **KW)[0].allowed


def test_report_abuse_logged(audit):
    guardrails.report_abuse(audit, "spectateur", "voix imitée sans accord", "voice_x")
    assert audit.entries()[-1].action == "SIGNALEMENT_ABUS" and audit.verify_chain()[0]


def test_vault_encrypts_and_checks_roles(tmp_path):
    v = vault.Vault(tmp_path / "coffre", tmp_path / "k.key")
    p = v.put("empreinte_voix", b"secret-embedding", "cineaste")
    assert b"secret-embedding" not in p.read_bytes()
    assert v.get("empreinte_voix", "adaptateur") == b"secret-embedding"
    with pytest.raises(PermissionError):
        v.put("x", b"1", "adaptateur")
    assert v.delete("empreinte_voix", "referent") and not p.exists()
