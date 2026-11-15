"""Label visible + manifeste de provenance (inspiré de C2PA, SANS prétendre à la
conformité C2PA) + générique des voix."""

from __future__ import annotations

from .models import now_iso, sha256_hex

KIND_FR = {
    "humaine": "Voix humaine d’origine",
    "consentie": "Voix générée par IA · consentie",
    "neutre": "Voix générée par IA · neutre",
}


def visible_label(kind: str, validator: str) -> str:
    """e.g. « Voix générée par IA · consentie · validée par Nom »."""
    return f"{KIND_FR[kind]} · validée par {validator}"


def voice_credits(voices: list[dict]) -> list[str]:
    """voices: [{role, kind, holder_name?, license_id?}] -> générique des voix (French lines)."""
    lines = []
    for v in voices:
        who = v.get("holder_name") or ("voix générique sans titulaire" if v["kind"] == "neutre" else "[à compléter]")
        lic = f" — licence {v['license_id']}" if v.get("license_id") else ""
        lines.append(f"{v.get('role', 'Voix')} : {KIND_FR[v['kind']]} ({who}){lic}")
    return lines


def provenance_manifest(
    *,
    title: str,
    asset_sha256: str,
    voices: list[dict],
    validator: str,
    models: list[dict],
    ai_passages: list[dict] | None = None,
) -> dict:
    manifest = {
        "format": "sawti-manifeste/0.1",
        "avertissement": "Manifeste de provenance inspiré de C2PA ; aucune conformité C2PA n’est revendiquée.",
        "titre": title,
        "asset_sha256": asset_sha256,
        "genere_le": now_iso(),
        "assertions": [
            {"type": "ia.voix_generee", "voix": voices},
            {"type": "controle_humain.validation", "validateur": validator},
            {"type": "ia.modeles", "modeles": models},
            {"type": "ia.passages_generes", "passages": ai_passages or []},
        ],
    }
    manifest["manifeste_sha256"] = sha256_hex(repr(sorted(manifest.items())))
    return manifest
