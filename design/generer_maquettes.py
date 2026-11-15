"""Génère les maquettes HTML puis les PNG du README.
Dépendances (hors requirements.txt) : reportlab, playwright, pillow, Chrome.
Usage : python design/generer_maquettes.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_HTML = os.path.join(HERE, "maquettes")
OUT_IMG = os.path.join(HERE, "..", "docs", "maquettes")
os.makedirs(OUT_HTML, exist_ok=True)
os.makedirs(OUT_IMG, exist_ok=True)
S = {}


def head(t, s):
    return f'<h1>{t}</h1><div class="sub">{s}</div>'


# ---------- 01 Parcours ----------
st = ["done"] * 3 + ["cur"] + ["todo"] * 6
rows = ""
descr = [
    "Le film reste sur la machine du cinéaste",
    "Dialogue séparé de la musique et de l'ambiance",
    "Derja, français et mélange, score par segment",
    "Le cinéaste ou un transcripteur corrige",
    "Glossaire culturel, vérificateur de fidélité",
    "L'adaptateur choisit, réécrit ou rejette",
    "Le moteur de règles vérifie le Passeport de voix",
    "Plus petit modèle suffisant, kWh mesurés",
    "Label visible, métadonnées, générique",
    "Piste doublée, sous-titres, Passeport signé",
]
for i, ((n, g), d, s) in enumerate(zip(ETAPES, descr, st), 1):
    chip = {
        "done": '<span class="chip ok">' + ico("done", 13) + "Vérifiée</span>",
        "cur": '<span class="chip acc">En cours</span>',
        "todo": '<span class="chip gray">À venir</span>',
    }[s]
    rows += f'<tr><td class="cap">{i}</td><td><b>{n}</b><div class="cap">{d}</div></td><td>{g}</td><td>{chip}</td></tr>'
states = [True, True, False, True, False, True, True, True, False]
legend = "".join(
    f'<div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0;color:{"var(--text)" if ok else "var(--sec)"}">'
    f'<span style="color:{"var(--ok)" if ok else "#8E8E93"}">{ico("done" if ok else "todo", 14)}</span>{p}</div>'
    for p, ok in zip(PRINCIPES, states)
)
S["01-parcours"] = (
    window(
        "Sawti 360",
        "Parcours du film · Extrait_derja_2min",
        4,
        head("Parcours du film", "Chaque étape franchit une porte de confiance. Rien ne sort sans validation humaine.")
        + f"""<div class="row" style="margin-top:18px;align-items:flex-start">
<div class="card" style="flex:1;padding:8px 8px"><table><tr><th></th><th>Étape</th><th>Porte de confiance</th><th>État</th></tr>{rows}</table></div>
<div class="col" style="width:300px">
<div class="card" style="text-align:center"><h3 style="text-align:left">Couche de confiance · 9 modules</h3>{ring(states, 190, 13)}
<div style="text-align:left;margin-top:10px">{legend}</div></div>
<div class="card" style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--ok)">{ico("lock", 18)}</span>
<div><b style="font-size:13.5px">Traitement local</b><div class="note">Modèles exécutés sur cette machine. Aucun film inédit n'est envoyé à une IA publique.</div></div></div>
</div></div>""",
    ),
    4,
)


# ---------- 02 Transcription ----------
def seg(t, lang, text, sc, flag=False, valid=False):
    cls = "w" if flag else ""
    chip = {"Derja": "acc", "Mélange": "warn", "Français": "gray"}[lang]
    state = (
        f'<span class="chip ok">{ico("done", 13)}Validée</span>'
        if valid
        else f'<span class="chip warn">{ico("warn", 13)}À vérifier</span>'
        if flag
        else '<span class="btn" style="padding:4px 12px">Valider</span>'
    )
    return (
        f'<tr><td class="mono" style="width:56px">{t}</td><td style="width:90px"><span class="chip {chip}">{lang}</span></td>'
        f'<td class="ar">{text}</td><td style="width:150px"><span class="meter {cls}"><b style="width:{sc}%"></b></span> <b style="font-size:13px">{sc} %</b></td>'
        f'<td style="width:120px;text-align:right">{state}</td></tr>'
    )


S["02-transcription"] = (
    window(
        "Sawti 360",
        "Transcription · Extrait_derja_2min",
        4,
        head(
            "Transcription et validation",
            "L'IA propose, le cinéaste corrige. Les segments à faible score sont signalés, pas masqués.",
        )
        + f"""<div class="row" style="margin-top:18px;align-items:flex-start">
<div class="col" style="flex:1">
<div class="card" style="padding:12px;background:#10192B;color:#fff;display:flex;align-items:center;gap:16px">
<div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5l9 5.5-9 5.5z" fill="#fff"/></svg></div>
<svg width="640" height="38" viewBox="0 0 640 38">{"".join(f'<rect x="{i * 8}" y="{19 - h / 2}" width="4" height="{h}" rx="2" fill="{"#7FB2FF" if i < 26 else "#6E7A91"}"/>' for i, h in enumerate([8, 14, 22, 30, 18, 10, 26, 34, 20, 12, 28, 36, 24, 14, 8, 18, 30, 22, 12, 26, 32, 16, 10, 24, 34, 20] + [6, 10, 16, 12, 8, 14, 20, 10, 6, 12, 18, 14, 8, 10, 16, 12, 6, 8, 12, 10, 6, 8, 10, 6, 4, 6, 8, 6, 4, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]))}</svg>
<span class="mono" style="margin-left:auto;color:#C7D3E8">00:14 / 02:00</span></div>
<div class="card" style="padding:8px"><table><tr><th>Temps</th><th>Langue</th><th style="text-align:right">Transcription</th><th>Confiance</th><th></th></tr>
{seg("00:03", "Derja", "شنوّة تعمل هنا في الليل؟", 96, valid=True)}
{seg("00:07", "Derja", "جيبلي ثلاثمية دينار برك", 91, valid=True)}
{seg("00:12", "Mélange", "je t'ai dit، يا خويا، ما فماش حل", 74, flag=True)}
{seg("00:18", "Derja", "يعيّشك، نحب نمشي للبحر", 93)}</table></div></div>
<div class="col" style="width:290px">
<div class="card"><h3>Score par langue</h3>
<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Derja</span><b>94 %</b></div>
<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Français</span><b class="cap" style="font-weight:500">aucun segment</b></div>
<div style="display:flex;justify-content:space-between;padding:4px 0"><span>Mélange</span><b style="color:var(--warn)">74 %</b></div>
<div class="note" style="margin-top:6px">Les écarts entre langues sont publiés dans le Passeport.</div></div>
<div class="card"><h3>Contrôle humain</h3><div class="meter" style="width:100%;height:8px"><b style="width:50%;background:var(--accent)"></b></div>
<div class="note" style="margin:8px 0 12px">2 répliques validées sur 4</div><span class="btn dis">Valider la transcription</span>
<div class="note" style="margin-top:10px">Le bouton s'active quand toutes les répliques sont validées.</div></div></div></div>""",
    ),
    4,
)

# ---------- 03 Traduction ----------
S["03-traduction"] = (
    window(
        "Sawti 360",
        "Traduction et adaptation · Extrait_derja_2min",
        6,
        head(
            "Traduction contextuelle",
            "Le vérificateur de fidélité contrôle chiffres, noms et négations. L'adaptateur décide de chaque réplique.",
        )
        + f"""<div class="row" style="margin-top:18px;align-items:flex-start"><div class="col" style="flex:1">
<div class="card"><div style="display:flex;justify-content:space-between"><span class="cap">RÉPLIQUE 1 · 00:03</span><span class="chip ok">{ico("done", 13)}Acceptée</span></div>
<div class="row" style="margin-top:8px"><div class="ar" style="flex:1">شنوّة تعمل هنا في الليل؟</div><div style="flex:1;font-size:15px">Qu'est-ce que tu fais ici, en pleine nuit ?</div></div></div>
<div class="card" style="box-shadow:0 0 0 2px var(--warn),0 1px 2px rgba(0,0,0,.04)"><div style="display:flex;justify-content:space-between"><span class="cap">RÉPLIQUE 2 · 00:07</span><span class="chip warn">{ico("warn", 13)}Alerte du vérificateur</span></div>
<div class="row" style="margin-top:8px"><div class="ar" style="flex:1">جيبلي <mark style="background:#FFE7B0;border-radius:4px">ثلاثمية دينار</mark> برك</div>
<div style="flex:1;font-size:15px">Apporte-moi <mark style="background:#FFE7B0;border-radius:4px">trente dinars</mark>, c'est tout.</div></div>
<div style="background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:8px 12px;margin-top:10px;font-size:13px;font-weight:500">Chiffre : 300 dinars dans la source, 30 dans la proposition. Erreur probable.</div>
<div style="display:flex;gap:8px;margin-top:12px;align-items:center"><span class="btn">Accepter</span><span class="btn pri">Réécrire</span><span class="btn del">Rejeter</span>
<span class="cap" style="margin-left:auto">Décision journalisée dans le journal d'audit</span></div></div>
<div class="card"><div style="display:flex;justify-content:space-between"><span class="cap">RÉPLIQUE 4 · 00:18</span><span class="chip acc">Choix humain requis</span></div>
<div class="row" style="margin-top:8px"><div class="ar" style="flex:1"><mark style="background:#DCEBFF;border-radius:4px">يعيّشك</mark>، نحب نمشي للبحر</div><div style="flex:1;font-size:15px">… je voudrais aller à la mer.</div></div>
<div class="note" style="margin-top:8px">Formule de politesse intraduisible : l'adaptateur choisit.</div></div></div>
<div class="col" style="width:290px"><div class="card"><h3>Glossaire culturel</h3>
<div style="padding:6px 0;border-bottom:1px solid #EEEEF2"><span class="ar" style="font-size:16px;direction:ltr;text-align:left">يعيّشك</span><div class="note">Remerciement, littéralement « que Dieu te fasse vivre »</div></div>
<div style="padding:6px 0"><span class="ar" style="font-size:16px;direction:ltr;text-align:left">برك</span><div class="note">« seulement », « c'est tout »</div></div></div>
<div class="card"><h3>Vérificateur de fidélité</h3><div class="note">Règles, entités et rétro-traduction. Précision et rappel à mesurer sur 100 erreurs injectées.</div>
<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><span class="chip gray">Chiffres</span><span class="chip gray">Noms</span><span class="chip gray">Négations</span></div></div></div></div>""",
    ),
    6,
)

# ---------- 04 Passeport de voix ----------
S["04-passeport-de-voix"] = (
    window(
        "Sawti 360",
        "Choix de la voix · Moteur de règles",
        7,
        head(
            "Passeport de voix",
            "Chaque voix a une licence signée. Le moteur de règles refuse toute génération hors licence.",
        )
        + f"""<div class="row" style="margin-top:18px;align-items:flex-start"><div class="col" style="width:330px">
<div class="card" style="padding:8px 8px"><div class="lbl" style="padding:6px 10px 2px">VOIX DISPONIBLES</div>
<div style="padding:9px 10px;border-radius:8px;background:var(--accent-bg);display:flex;justify-content:space-between;align-items:center"><div><b>Voix d'un membre de l'équipe</b><div class="cap">Licence VL-0001</div></div><span class="chip ok">Consentie</span></div>
<div style="padding:9px 10px;display:flex;justify-content:space-between;align-items:center"><div><b>Voix neutre Sawti</b><div class="cap">Voix de synthèse, aucune personne imitée</div></div><span class="chip gray">Neutre</span></div></div>
<div class="card" style="background:var(--bad-bg);box-shadow:0 0 0 1px rgba(184,36,27,.35)"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--bad)">{ico("x", 20)}<div><b style="font-size:14px">Synthèse refusée</b>
<div style="color:#5B1713;font-size:13px;margin-top:2px">Demande : voix d'une personnalité. Aucune licence valide dans le registre.</div><div class="mono" style="margin-top:6px;color:#5B1713">Refus journalisé · entrée #3</div></div></div></div>
<div class="card" style="background:var(--ok-bg);box-shadow:0 0 0 1px rgba(23,112,58,.35)"><div style="display:flex;gap:10px;align-items:flex-start;color:var(--ok)">{ico("done", 20)}<div><b style="font-size:14px">Synthèse acceptée</b>
<div style="color:#0F4A26;font-size:13px;margin-top:2px">Licence VL-0001 valide pour ce film, cet usage et cette langue.</div><div class="mono" style="margin-top:6px;color:#0F4A26">Autorisation journalisée · entrée #4</div></div></div></div></div>
<div class="card" style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Licence VL-0001</h3><span class="chip ok">{ico("done", 13)}Valide</span></div>
<table style="margin-top:8px"><tr><td class="cap" style="width:190px">Titulaire</td><td>Membre de l'équipe (voix consentie)</td></tr>
<tr><td class="cap">Usages autorisés</td><td>Doublage de ce film, derja vers français</td></tr>
<tr><td class="cap">Projets et langues</td><td>Extrait_derja_2min · français</td></tr>
<tr><td class="cap">Durée</td><td>12 mois, jusqu'au 15 novembre 2027</td></tr>
<tr><td class="cap">Rémunération</td><td>Par usage, reversée au titulaire</td></tr>
<tr><td class="cap">Empreinte vocale</td><td>Locale, consentie, supprimable</td></tr>
<tr><td class="cap">Droit de retrait</td><td>À tout moment</td></tr></table>
<div style="display:flex;gap:10px;align-items:center;margin-top:14px"><span class="btn del">Révoquer la licence</span><span class="btn">Supprimer l'empreinte</span></div>
<div class="note" style="margin-top:12px;padding-top:10px;border-top:1px solid #EEEEF2">Révoquer bloque les générations futures. L'audio déjà diffusé ne peut pas être retiré, et le Passeport le dit.</div></div></div>""",
    ),
    7,
)


# ---------- 05 Export ----------
def bar(label, w, val, col):
    return (
        f'<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>{label}</span><b>{val}</b></div>'
        f'<div style="height:10px;border-radius:9px;background:#E8E8ED;margin-top:4px"><div style="width:{w}%;height:100%;border-radius:9px;background:{col}"></div></div></div>'
    )


S["05-export-transparence"] = (
    window(
        "Sawti 360",
        "Export · Extrait_derja_2min",
        10,
        head(
            "Export : label, générique et énergie", "Ce que le public voit, et ce que l'IA a consommé pour le produire."
        )
        + f"""<div class="row" style="margin-top:18px;align-items:flex-start"><div class="col" style="flex:1">
<div style="height:250px;border-radius:12px;background:linear-gradient(160deg,#27405F,#0E1B2E 60%,#3A2A3E);position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.1)">
<div style="position:absolute;left:14px;top:14px;background:rgba(255,255,255,.94);color:#1D1D1F;font-weight:600;font-size:13px;padding:6px 12px;border-radius:99px;display:flex;gap:7px;align-items:center"><span style="color:var(--accent)">{ico("cur", 14)}</span>Doublé avec IA · supervisé par un humain</div>
<div style="position:absolute;left:0;right:0;bottom:22px;text-align:center;color:#fff;font-size:18px;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,.6)">Apporte-moi trois cents dinars, c'est tout.</div></div>
<div class="row"><div class="card" style="flex:1"><h3>Générique des voix</h3>
<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Dialogue d'origine</span><span class="chip gray">Humaine</span></div>
<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Doublage français</span><span class="chip ok">Consentie · VL-0001</span></div>
<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Voix de repli</span><span class="chip gray">Neutre</span></div></div>
<div class="card" style="flex:1"><h3>Provenance</h3><div class="note">Manifeste lisible par machine (type C2PA), passages générés par l'IA mentionnés, bouton de signalement dans chaque export.</div>
<div style="margin-top:10px"><span class="btn pri">Exporter avec le Passeport 360°</span></div></div></div></div>
<div class="card" style="width:330px"><h3>Panneau énergie</h3><div class="note" style="margin-bottom:6px">Comparaison de deux modèles de voix, pour une réplique validée.</div>
{bar("Petit modèle · mode éco", 25, "0,012 kWh · 5 g CO₂", "var(--ok)")}{bar("Grand modèle", 100, "0,048 kWh · 22 g CO₂", "#8E8E93")}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid #EEEEF2"><div><b>Mode éco</b><div class="cap">Le plus petit modèle suffisant</div></div>
<div style="width:46px;height:28px;border-radius:99px;background:var(--ok);position:relative"><div style="position:absolute;right:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff"></div></div></div>
<div class="note" style="margin-top:12px">Mesure prévue avec CodeCarbon. Valeurs de cette maquette illustratives.</div></div></div>""",
    ),
    10,
)


# ---------- 06 Passeport 360 ----------
def sec(t, items):
    return (
        f'<div><div class="lbl">{t}</div>'
        + "".join(f'<div style="font-size:13px;padding:2px 0">{i}</div>' for i in items)
        + "</div>"
    )


S["06-passeport-360"] = (
    window(
        "Sawti 360",
        "Passeport 360° · Extrait_derja_2min",
        "passeport",
        f"""<div style="display:flex;justify-content:space-between;align-items:flex-end"><div>{head("Passeport 360°", "Dossier lisible par un humain, vérifiable par une machine.")}</div><span class="chip ok">{ico("done", 13)}Signature valide</span></div>
<div class="card" style="margin-top:16px;display:flex;padding:0;overflow:hidden">
<div style="width:300px;background:var(--ink);color:#fff;padding:24px 22px;position:relative;text-align:center">
<div style="font-size:12px;font-weight:600;letter-spacing:.08em;color:#9DB3D6">PASSEPORT 360° DU FILM</div>
<div style="margin:16px 0 12px;display:flex;justify-content:center;">{ring([True] * 9, 170, 12, center=False, on="#6FD08C")}</div>
<div style="font-size:18px;font-weight:700;margin-top:-6px">Extrait_derja_2min</div><div style="font-size:13px;color:#C7D3E8">Version 1 · 15 novembre 2026</div>
<div style="background:#fff;border-radius:10px;padding:8px;display:inline-block;margin-top:16px">{qr_svg("https://github.com/youssefbesbes/Sawti360", 128)}</div>
<div style="font-size:12px;color:#C7D3E8;margin-top:6px">Scanner pour vérifier</div>
<div style="position:absolute;right:-9px;top:0;bottom:0;width:18px;background:radial-gradient(circle at 9px 12px,var(--surface) 0 6px,transparent 6.5px) 0 0/18px 24px repeat-y"></div></div>
<div style="flex:1;padding:22px 26px;display:grid;grid-template-columns:1fr 1fr;gap:16px 28px">
{sec("IDENTITÉ", ["Titre : Extrait_derja_2min", f"Hash du film : <span class='mono'>{FILM_HASH[:16]}…</span>"])}
{sec("VOIX", ["Dialogue : humaine", "Doublage : consentie, VL-0001, valide", "Repli : neutre"])}
{sec("LANGUES", ["Derja : score par accent testé", "Français et mélange : écarts publiés", "Sawti-Bench : <i>à mesurer</i>"])}
{sec("TRANSPARENCE", ["Label « doublé avec IA »", "Manifeste de provenance (type C2PA)", "Passages générés par l'IA mentionnés"])}
{sec("RESPONSABILITÉ", ["Référent éthique : nommé", "Validateur : cinéaste", "Refus de génération : 1", f"Tête du journal : <span class='mono'>{HEAD[:16]}…</span>"])}
{sec("SÉCURITÉ", ["Traitement local confirmé", "Empreintes des modèles consignées"])}
{sec("DURABILITÉ", ["kWh et g CO₂ pour le film", "Deux modèles comparés"])}
{sec("SIGNATURE", ["Signature numérique", "QR de vérification (ici : dépôt du projet)"])}
</div></div>""",
    ),
    "passeport",
)

# ---------- 07 Journal ----------
rows = ""
for i, t, a, who, kind, prev, h in CHAIN:
    c = {"refus": "bad", "autorisation": "ok", "export": "acc"}.get(kind, "gray")
    rows += (
        f'<tr><td class="mono">#{i}</td><td class="mono" style="width:150px">{t}</td><td>{a}<div class="cap">{who}</div></td>'
        f'<td><span class="chip {c}">{kind}</span></td><td class="mono">{prev[:10]}…</td><td class="mono"><b>{h[:10]}…</b></td></tr>'
    )
S["07-journal-audit"] = (
    window(
        "Sawti 360",
        "Journal d'audit · chaîne de hachage",
        "journal",
        head(
            "Journal d'audit",
            "Chaque entrée contient l'empreinte de la précédente : toute modification devient détectable.",
        )
        + f"""<div class="card" style="margin-top:18px;display:flex;align-items:center;gap:12px;background:var(--ok-bg);box-shadow:0 0 0 1px rgba(23,112,58,.3)"><span style="color:var(--ok)">{ico("done", 22)}</span>
<div><b>Chaîne vérifiée</b><div class="note" style="color:#0F4A26">{len(CHAIN)} entrées, aucune modification détectée. Empreinte de tête : <span class="mono">{HEAD[:24]}…</span></div></div><span class="btn" style="margin-left:auto">Vérifier à nouveau</span></div>
<div class="card" style="margin-top:16px;padding:8px"><table><tr><th>N°</th><th>Date</th><th>Décision</th><th>Type</th><th>Empreinte précédente</th><th>Empreinte</th></tr>{rows}</table></div>
<div class="note" style="margin-top:12px">Le journal alimente le Passeport 360° et sert de voie de recours en cas de litige. Les empreintes affichées sont de vrais SHA-256 de ces six entrées.</div>""",
    ),
    "journal",
)


# ---------- 08 Bench ----------
def br(ligne, acc, stat, ch, wer):
    return (
        f'<tr><td><b>{ligne}</b></td><td>{acc}</td><td><span class="chip {ch}">{stat}</span></td>'
        f'<td><div style="width:160px;height:10px;border-radius:9px;border:1.5px dashed #8E8E93"></div></td><td class="cap">{wer}</td></tr>'
    )


S["08-sawti-bench"] = (
    window(
        "Sawti 360",
        "Sawti-Bench · évaluation par langue",
        "bench",
        head("Sawti-Bench", "Un jeu de test annoté par l'équipe. Les écarts de performance sont publiés, même mauvais.")
        + f"""<div class="card" style="margin-top:18px;padding:8px"><table><tr><th>Langue</th><th>Accent</th><th>Échéance</th><th>Taux d'erreur (WER)</th><th></th></tr>
{br("Derja", "Régions testées si possible", "Version 1", "acc", "à mesurer")}{br("Français", "—", "Version 1", "acc", "à mesurer")}
{br("Mélange derja-français", "—", "Version 1", "acc", "à mesurer")}{br("Arabe", "—", "Finale", "warn", "à vérifier")}
{br("Amazigh", "Si des données existent", "Suite", "gray", "à vérifier")}</table></div>
<div class="row" style="margin-top:16px"><div class="card" style="flex:1"><h3>Mesure de départ</h3><div class="note">Transcrire à la main 2 minutes de dialogue derja, passer un modèle existant et publier le taux d'erreur.</div></div>
<div class="card" style="flex:1"><h3>Aucune valeur inventée</h3><div class="note">Les barres en pointillés se remplissent quand les mesures existent. Une langue sans donnée est affichée comme telle.</div></div></div>""",
    ),
    "bench",
)

if __name__ == "__main__":
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        for k, v in S.items():
            html = v[0] if isinstance(v, tuple) else v
            open(f"{OUT_HTML}/{k}.html", "w").write(html)
            pg.goto(f"file://{OUT_HTML}/{k}.html")
            pg.wait_for_timeout(300)
            pg.screenshot(path=f"{OUT_IMG}/{k}.png")
            print(k)
            from PIL import Image

            im = Image.open(f"{OUT_IMG}/{k}.png").convert("RGB").resize((2000, 1250), Image.LANCZOS)
            im.save(f"{OUT_IMG}/{k}.png", optimize=True)
        b.close()
