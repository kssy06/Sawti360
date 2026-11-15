import pytest

from sawti.audit import GENESIS


def fill(audit, n=4):
    for i in range(n):
        audit.append("test", "ACTION", {"i": i}, "OK" if i % 2 else "LICENCE_REVOQUEE")


def test_empty_chain(audit):
    assert audit.head_hash() == GENESIS and audit.verify_chain() == (True, None)


def test_chain_verifies(audit):
    fill(audit)
    entries = audit.entries()
    assert entries[0].prev_hash == GENESIS
    assert all(entries[i].prev_hash == entries[i - 1].entry_hash for i in range(1, 4))
    assert audit.verify_chain() == (True, None) and audit.head_hash() == entries[-1].entry_hash


@pytest.mark.attack("Modification d’une entrée du journal d’audit", "Vérification en échec à l’index modifié")
def test_tamper_detected(audit):
    fill(audit)
    audit.tamper_for_demo(2, "OK")
    assert audit.verify_chain() == (False, 2)
