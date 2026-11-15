"""Ed25519 platform key (demo). Generated at runtime into keys/ (git-ignored).

Limit (documented): in V1 licences are signed by the platform key, not by a key
held by the voice holder.
"""

from __future__ import annotations

import base64
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ROOT = Path(__file__).resolve().parent.parent
KEY_DIR = ROOT / "keys"


def load_or_create_private_key(key_dir: Path | None = None) -> Ed25519PrivateKey:
    key_dir = Path(key_dir or KEY_DIR)
    path = key_dir / "platform_ed25519.pem"
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key_dir.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    path.chmod(0o600)
    return key


def public_key_b64(key: Ed25519PrivateKey | Ed25519PublicKey) -> str:
    pub = key.public_key() if isinstance(key, Ed25519PrivateKey) else key
    raw = pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def sign(key: Ed25519PrivateKey, data: bytes) -> str:
    return "ed25519:" + base64.b64encode(key.sign(data)).decode()


def verify(pub_b64: str, data: bytes, signature: str) -> bool:
    try:
        if not signature.startswith("ed25519:"):
            return False
        pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pub_b64))
        pub.verify(base64.b64decode(signature[len("ed25519:") :]), data)
        return True
    except (InvalidSignature, ValueError):
        return False
