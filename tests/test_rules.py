import pytest

from sawti.models import GenerationRequest
from sawti.rules import authorize

BASE = dict(voice_id="voice_amine", holder_name="Amine B.", allowed_uses=["doublage_film", "bande_annonce"],
            projects=["film_01"], languages=["fr"], valid_from="2026-11-01", valid_until="2027-05-15")


def req(**kw):
    d = dict(request_id="R1", voice_id="voice_amine", project_id="film_01", use="doublage_film", language="fr",
             requested_by="test", text_hash="x")
    d.update(kw)
    return GenerationRequest(**d)


def check(store, now, request=None, **kw):
    return authorize(request or req(), store.list(), now, verify_signature=store.verify, **kw)


@pytest.mark.attack("Voix consentie, licence valide", "Autorisé (OK)")
def test_valid(store, now):
    lic = store.create(**BASE)
    d = check(store, now)
    assert d.allowed and d.reason_code == "OK" and d.license_id == lic.license_id


@pytest.mark.attack("Voix sans Passeport de voix", "Refusé (VOIX_NON_ENREGISTREE)")
def test_unregistered(store, now):
    store.create(**BASE)
    d = check(store, now, req(voice_id="voice_inconnue"))
    assert not d.allowed and d.reason_code == "VOIX_NON_ENREGISTREE"


@pytest.mark.attack("Réutilisation d’une licence révoquée", "Refusé (LICENCE_REVOQUEE)")
def test_revoked(store, now):
    store.revoke(store.create(**BASE).license_id)
    assert check(store, now).reason_code == "LICENCE_REVOQUEE"


@pytest.mark.attack("Réutilisation d’une licence expirée", "Refusé (LICENCE_EXPIREE)")
def test_expired(store, now):
    store.create(**{**BASE, "valid_from": "2025-01-01", "valid_until": "2025-12-31"})
    assert check(store, now).reason_code == "LICENCE_EXPIREE"


@pytest.mark.attack("Licence utilisée avant sa date de début", "Refusé (LICENCE_PAS_ENCORE_VALIDE)")
def test_not_yet_valid(store, now):
    store.create(**{**BASE, "valid_from": "2027-01-01", "valid_until": "2027-12-31"})
    assert check(store, now).reason_code == "LICENCE_PAS_ENCORE_VALIDE"


@pytest.mark.attack("Usage hors licence (jeu vidéo)", "Refusé (USAGE_NON_AUTORISE)")
def test_wrong_use(store, now):
    store.create(**BASE)
    assert check(store, now, req(use="jeu_video")).reason_code == "USAGE_NON_AUTORISE"


@pytest.mark.attack("Usage explicitement interdit (publicité)", "Refusé (USAGE_INTERDIT)")
def test_forbidden_use(store, now):
    store.create(**BASE)
    assert check(store, now, req(use="publicite")).reason_code == "USAGE_INTERDIT"


@pytest.mark.attack("Voix réutilisée sur un autre projet", "Refusé (PROJET_NON_AUTORISE)")
def test_wrong_project(store, now):
    store.create(**BASE)
    assert check(store, now, req(project_id="autre_film")).reason_code == "PROJET_NON_AUTORISE"


def test_wildcard_project(store, now):
    store.create(**{**BASE, "projects": ["*"]})
    assert check(store, now, req(project_id="autre_film")).allowed


@pytest.mark.attack("Langue hors licence", "Refusé (LANGUE_NON_AUTORISEE)")
def test_wrong_language(store, now):
    store.create(**BASE)
    assert check(store, now, req(language="en")).reason_code == "LANGUE_NON_AUTORISEE"


@pytest.mark.attack("Licence modifiée en base (usages élargis)", "Refusé (SIGNATURE_INVALIDE)")
def test_bad_signature(store, now):
    lic = store.create(**BASE)
    lic.allowed_uses.append("publicite")
    lic.forbidden_uses.remove("publicite")
    store.save(lic)  # tampered without re-signing
    assert check(store, now, req(use="publicite")).reason_code == "SIGNATURE_INVALIDE"


@pytest.mark.attack("Voix d’une personnalité publique", "Refusé (PERSONNALITE_BLOQUEE)")
def test_blocked_personality(store, now):
    store.create(**{**BASE, "voice_id": "voice_chef_etat"})
    d = check(store, now, req(voice_id="voice_chef_etat"), blocked_voice_ids=["voice_chef_etat"])
    assert d.reason_code == "PERSONNALITE_BLOQUEE"


@pytest.mark.attack("Texte non validé par un humain", "Refusé (VALIDATION_HUMAINE_MANQUANTE)")
def test_missing_human_validation(store, now):
    store.create(**BASE)
    assert check(store, now, req(human_validated=False)).reason_code == "VALIDATION_HUMAINE_MANQUANTE"


@pytest.mark.attack("Bascule de révocation : même demande avant / après", "Autorisé puis refusé")
def test_revocation_flip(store, now):
    lic = store.create(**BASE)
    assert check(store, now).allowed
    store.revoke(lic.license_id)
    d = check(store, now)
    assert not d.allowed and d.reason_code == "LICENCE_REVOQUEE"


def test_pure_function(store, now):
    store.create(**BASE)
    assert check(store, now) == check(store, now)
