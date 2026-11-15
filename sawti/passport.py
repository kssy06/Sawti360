"""Passeport 360° : assemble, sign (Ed25519), verify, export JSON + HTML, QR."""
from __future__ import annotations

import base64
import copy
import html
import io
import json
from pathlib import Path

from . import SLOGAN, keys, label
from .audit import verify_entries
from .models import canonical_json, now_iso, sha256_hex

A_MESURER = "[à mesurer]"


def assemble(*, title: str, version: str, asset_sha256: str | None, licenses: list, audit, validator: str,
             referent: str, voices: list[dict], models: list[dict], energy: dict | None, wer: dict | None,
             demo: bool = True) -> dict:
    entries = [e.to_dict() for e in audit.entries()]
    labels = [label.visible_label(v["kind"], validator) for v in voices]
    used_ids = {v.get("license_id") for v in voices}
    return {
        "schema": "sawti-passeport-360/0.1",
        "donnees_de_demonstration": demo,
        "identite": {"titre": title, "version": version, "date": now_iso(),
                     "sha256_fichier_exporte": asset_sha256 or "[à compléter : aucun fichier exporté en V1]"},
        "voix": [
            {**v, "licence": next(({"license_id": l.license_id, "usages": l.allowed_uses, "statut": l.status,
                                    "valide_jusqu_au": l.valid_until, "entrainement_interdit": l.no_training}
                                   for l in licenses if l.license_id == v.get("license_id")), None)}
            for v in voices
        ],
        "licences_utilisees": sorted(i for i in used_ids if i),
        "langues": wer or {"ar-TN (derja)": A_MESURER, "fr": A_MESURER},
        "transparence": {
            "labels": labels,
            "generique_des_voix": label.voice_credits(voices),
            "manifeste": label.provenance_manifest(title=title, asset_sha256=asset_sha256 or "", voices=voices,
                                                   validator=validator, models=models),
        },
        "responsabilite": {
            "referent_ethique": referent, "validateur": validator,
            "journal_empreinte_de_tete": audit.head_hash(),
            "nombre_entrees": len(entries),
            "nombre_refus": sum(1 for e in entries if e["action"] == "GENERATION_REFUSEE"),
            "journal": entries,
        },
        "securite": {"modeles": models, "traitement_local": "traitement local confirmé (aucun appel réseau dans la V1)"},
        "durabilite": energy or {"kwh": A_MESURER, "gco2": A_MESURER, "duree_s": A_MESURER},
        "mentions": "Alignement avec les textes cités, pas de certification ; relecture juridique prévue.",
        "slogan": SLOGAN,
    }


def sign(passport: dict, private_key) -> dict:
    p = copy.deepcopy(passport)
    p.pop("signature", None)
    p["signature"] = {
        "algorithme": "Ed25519",
        "cle_publique": keys.public_key_b64(private_key),
        "valeur": keys.sign(private_key, canonical_json(p)),
    }
    return p


def passport_hash(passport: dict) -> str:
    return sha256_hex(canonical_json(passport))


def verify(passport: dict, expected_public_key: str | None = None) -> dict:
    """Checks the signature AND the embedded audit chain.
    Returns {"valide", "signature", "chaine", "cle_attendue", "detail"}."""
    p = copy.deepcopy(passport)
    sig = p.pop("signature", None) or {}
    sig_ok = bool(sig) and keys.verify(sig.get("cle_publique", ""), canonical_json(p), sig.get("valeur", ""))
    key_ok = expected_public_key is None or sig.get("cle_publique") == expected_public_key
    resp = p.get("responsabilite", {})
    entries = resp.get("journal", [])
    chain_ok, bad = verify_entries(entries)
    head_ok = (entries[-1]["entry_hash"] if entries else "0" * 64) == resp.get("journal_empreinte_de_tete")
    chain_ok = chain_ok and head_ok
    detail = []
    if not sig_ok:
        detail.append("signature Ed25519 invalide (contenu modifié ou signature absente)")
    if not key_ok:
        detail.append("clé publique différente de la clé attendue")
    if not chain_ok:
        detail.append(f"chaîne d’audit rompue à l’entrée {bad}" if bad is not None else "empreinte de tête incohérente")
    return {"valide": sig_ok and key_ok and chain_ok, "signature": sig_ok, "chaine": chain_ok,
            "cle_attendue": key_ok, "detail": detail or ["signature et chaîne d’audit vérifiées"]}


def qr_png(passport: dict) -> bytes:
    """QR encoding the passport hash (offline-verifiable against the JSON file)."""
    import qrcode

    img = qrcode.make(f"sawti360:passeport:sha256:{passport_hash(passport)}")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def to_html(passport: dict) -> str:
    e = lambda x: html.escape(str(x))  # noqa: E731
    v = verify(passport)
    qr = base64.b64encode(qr_png(passport)).decode()
    idt, resp, dur = passport["identite"], passport["responsabilite"], passport["durabilite"]

    def rows(d: dict) -> str:
        return "".join(f"<tr><th>{e(str(k).replace('_', ' ').capitalize())}</th><td>{e(val)}</td></tr>" for k, val in d.items())

    voix = "".join(f"<li>{e(l)}</li>" for l in passport["transparence"]["generique_des_voix"])
    labels = "".join(f"<li>{e(l)}</li>" for l in passport["transparence"]["labels"])
    modeles = "".join(f"<li>{e(m.get('name'))} {e(m.get('version', ''))} — {e(m.get('note', m.get('sha256', '')))}</li>"
                      for m in passport["securite"]["modeles"])
    demo = '<p class="demo">Données de démonstration</p>' if passport.get("donnees_de_demonstration") else ""
    ok_svg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>'
    ko_svg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>'
    badge = (f'<div class="verdict ok">{ok_svg}Vérifié</div>' if v["valide"] else f'<div class="verdict ko">{ko_svg}Invalide</div>')
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Passeport 360° — {e(idt['titre'])}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{{--bg:#070b24;--panel:#0d1438;--ink:#e8ecff;--muted:#a9b6e6;--line:#27336b;--ok:#4ade9f;--ko:#ff6b81;--accent:#3fd5f0}}
*{{box-sizing:border-box}}::selection{{background:var(--accent);color:var(--bg)}}a:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
body{{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);margin:0;padding:32px 16px 48px;line-height:1.5}}
main{{max-width:70ch;margin:auto}}h1{{font-size:2rem;margin:0 0 4px;text-wrap:balance}}.sub{{color:var(--muted);margin:0 0 20px}}
h2{{font-size:1.1rem;margin:36px 0 10px;padding-top:18px;border-top:1px solid var(--line)}}
table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}}th{{text-align:left;color:var(--muted);font-weight:400;width:40%;vertical-align:top}}th,td{{padding:5px 12px 5px 0;overflow-wrap:anywhere}}
ul{{padding-left:1.1rem;margin:0}}li{{margin:4px 0}}
.verdict{{display:flex;align-items:center;gap:10px;font-size:1.4rem;font-weight:700;margin:18px 0 4px}}.ok{{color:var(--ok)}}.ko{{color:var(--ko)}}
.demo{{color:var(--muted);font-size:.9rem;margin:0}}.qr{{background:#fff;padding:10px;border-radius:8px;width:180px;display:block;margin:6px 0 14px}}
footer{{color:var(--muted);margin-top:40px;padding-top:16px;border-top:1px solid var(--line);font-size:.9rem}}code{{font-size:.85rem;overflow-wrap:anywhere}}</style></head>
<body><main><h1>Passeport 360°</h1><p class="sub">Dossier vérifiable · Sawti 360, le doublage de confiance</p>{demo}
{badge}<p>{e(' ; '.join(v['detail']).capitalize())}.</p>
<h2>Identité du film</h2><table>{rows(idt)}</table>
<h2>Voix, licences et consentement</h2><ul>{voix}</ul>
<h2>Qualité par langue et accent</h2><table>{rows(passport['langues'])}</table>
<h2>Transparence</h2><ul>{labels}</ul><p>{e(passport['transparence']['manifeste']['avertissement'])}</p>
<h2>Responsabilité</h2><table>{rows({k: val for k, val in resp.items() if k != 'journal'})}</table>
<h2>Sécurité</h2><ul>{modeles}</ul><p>{e(passport['securite']['traitement_local'].capitalize())}.</p>
<h2>Durabilité</h2><table>{rows(dur)}</table>
<h2>Signature et vérification</h2><img class="qr" alt="QR de vérification" src="data:image/png;base64,{qr}">
<p>Empreinte du passeport : <code>{passport_hash(passport)}</code></p>
<p>Clé publique : <code>{e(passport.get('signature', {}).get('cle_publique', ''))}</code></p>
<p>Pour vérifier hors ligne : <code>python scripts/verify_passport.py passeport.json</code></p>
<footer>{e(passport['mentions'])}<br>{e(passport['slogan'])}</footer></main></body></html>"""


def export(passport: dict, out_dir: str | Path, stem: str = "passeport_360") -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{stem}.json").write_text(json.dumps(passport, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / f"{stem}.html").write_text(to_html(passport), encoding="utf-8")
    (out / f"{stem}_qr.png").write_bytes(qr_png(passport))
    return {k: out / f"{stem}{s}" for k, s in (("json", ".json"), ("html", ".html"), ("qr", "_qr.png"))}
