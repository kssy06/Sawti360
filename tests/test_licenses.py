from sawti.licenses import LicenseStore


def test_create_sign_verify_persist(store, tmp_path):
    lic = store.create(voice_id="v1", holder_name="A")
    assert lic.signature.startswith("ed25519:") and store.verify(lic)
    again = LicenseStore(store.db_path, private_key=store.key).get(lic.license_id)
    assert again == lic


def test_tampered_licence_fails(store):
    lic = store.create(voice_id="v1", holder_name="A")
    lic.valid_until = "2099-01-01"
    assert not store.verify(lic)


def test_revoke_keeps_signature_valid(store):
    lic = store.revoke(store.create(voice_id="v1", holder_name="A").license_id)
    assert lic.status == "revoked" and lic.revoked_at and store.verify(lic)


def test_ids_are_unique(store):
    ids = {store.create(voice_id=f"v{i}", holder_name="A").license_id for i in range(3)}
    assert len(ids) == 3
