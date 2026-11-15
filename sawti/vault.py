"""Coffre local (minimal V1) : chiffrement au repos (Fernet/AES) + contrôle de rôle.
Used for unreleased film files and voice embeddings (biometric data): local,
encrypted, deletable on revocation."""

from __future__ import annotations

from pathlib import Path

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent.parent
ROLES = {"cineaste": {"lire", "ecrire", "supprimer"}, "adaptateur": {"lire"}, "referent": {"lire", "supprimer"}}


class Vault:
    def __init__(self, directory: str | Path | None = None, key_path: str | Path | None = None):
        self.dir = Path(directory or ROOT / "data" / "private" / "coffre")
        self.dir.mkdir(parents=True, exist_ok=True)
        key_path = Path(key_path or ROOT / "keys" / "coffre.key")
        if not key_path.exists():
            key_path.parent.mkdir(parents=True, exist_ok=True)
            key_path.write_bytes(Fernet.generate_key())
            key_path.chmod(0o600)
        self._f = Fernet(key_path.read_bytes())

    def _path(self, name: str) -> Path:
        """Return an encrypted-file path contained by the vault directory."""
        if not isinstance(name, str) or not name.strip() or name in {".", ".."}:
            raise ValueError("Le nom du fichier du coffre est invalide.")
        if Path(name).name != name or "/" in name or "\\" in name or "\x00" in name:
            raise ValueError("Le nom du fichier ne peut pas contenir de chemin.")
        return self.dir / f"{name}.enc"

    @staticmethod
    def _check(role: str, right: str) -> None:
        if right not in ROLES.get(role, set()):
            raise PermissionError(f"Rôle « {role} » non autorisé pour l’action « {right} ».")

    def put(self, name: str, data: bytes, role: str) -> Path:
        self._check(role, "ecrire")
        path = self._path(name)
        path.write_bytes(self._f.encrypt(data))
        return path

    def get(self, name: str, role: str) -> bytes:
        self._check(role, "lire")
        return self._f.decrypt(self._path(name).read_bytes())

    def delete(self, name: str, role: str) -> bool:
        """Used on revocation to delete a voice embedding."""
        self._check(role, "supprimer")
        path = self._path(name)
        if path.exists():
            path.unlink()
            return True
        return False
