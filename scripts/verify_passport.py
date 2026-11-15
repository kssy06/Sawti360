"""CLI : vérifie la signature Ed25519 et la chaîne d’audit d’un Passeport 360° exporté.
Usage : python scripts/verify_passport.py exports/passeport_360.json [cle_publique_attendue_base64]"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sawti import passport  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    data = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    res = passport.verify(data, argv[2] if len(argv) > 2 else None)
    print("VALIDE" if res["valide"] else "INVALIDE")
    print(f"  signature : {'ok' if res['signature'] else 'ÉCHEC'}")
    print(f"  chaîne d’audit : {'ok' if res['chaine'] else 'ÉCHEC'}")
    for d in res["detail"]:
        print(f"  - {d}")
    print(f"  empreinte du passeport : {passport.passport_hash(data)}")
    return 0 if res["valide"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
