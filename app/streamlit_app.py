"""Console de démonstration Sawti 360 (interface en français).
Lancer : streamlit run app/streamlit_app.py"""
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sawti import SLOGAN, energy, fidelity, guardrails, label, passport, runtime, synth  # noqa: E402
from sawti.models import REASONS_FR  # noqa: E402

st.set_page_config(page_title="Sawti 360 — Le doublage de confiance", page_icon="🎙️", layout="wide")
st.markdown(
    """<style>
    .stApp{background:radial-gradient(ellipse at 70% 0%,#1a1560 0%,#070b24 55%)}
    .brand{letter-spacing:.35em;font-weight:800;font-size:2.4rem;margin:0}
    .tag{letter-spacing:.4em;color:#3fd5f0;font-size:.85rem;text-transform:uppercase}
    .porte{display:inline-block;border:1px solid #7b5cf0;border-radius:99px;padding:2px 12px;font-size:.75rem;color:#c9bcff;font-family:monospace}
    .card{border:1px solid #2a3a7a;border-radius:12px;padding:14px 18px;background:#0e1640aa;margin-bottom:10px}
    .ok{border-color:#3be0a0;color:#3be0a0}.ko{border-color:#ff5470;color:#ff5470}
    .big{font-size:1.4rem;font-weight:800;letter-spacing:.05em}
    .demo{color:#f5c14b;border:1px solid #f5c14b;border-radius:99px;padding:1px 10px;font-size:.75rem}
    .foot{text-align:center;color:#9fb0e8;margin-top:40px;padding-top:14px;border-top:1px solid #2a3a7a}
    </style>""",
    unsafe_allow_html=True,
)

store, audit = runtime.stores()
WER_PATH = ROOT / "results" / "wer.json"
A_MESURER = "[à mesurer]"


def wer_rows():
    return json.loads(WER_PATH.read_text(encoding="utf-8")) if WER_PATH.exists() else []


def decision_card(d, path=None):
    if d.allowed:
        st.markdown(f'<div class="card ok"><div class="big">✅ GÉNÉRATION AUTORISÉE</div>{d.reason_fr}<br>'
                    f'<small>Licence {d.license_id or "— (voix neutre)"} · décision journalisée</small></div>', unsafe_allow_html=True)
        if path:
            st.audio(str(path))
            st.caption("V1 : le son produit est un signal neutre de remplacement (aucun clonage). Ce qui est réel ici, c’est la porte d’autorisation.")
    else:
        st.markdown(f'<div class="card ko"><div class="big">⛔ GÉNÉRATION REFUSÉE</div>{d.reason_fr}<br>'
                    f'<small>Code : {d.reason_code} · aucun audio produit · refus journalisé</small></div>', unsafe_allow_html=True)


def run_generation(voice_id, project, use, lang, text, validated, who):
    def job():
        return synth.generate(voice_id=voice_id, project_id=project, use=use, language=lang, requested_by=who,
                              text=text, store=store, audit=audit, out_dir=runtime.EXPORT_DIR / "audio",
                              human_validated=validated)
    (d, path), rec = energy.measure(job, f"generation:{voice_id}")
    energy.save(rec)
    return d, path, rec


# ---------------------------------------------------------------- sidebar
st.sidebar.markdown('<p class="brand" style="font-size:1.4rem">SAWTI 360</p><p class="tag" style="font-size:.6rem">Le doublage de confiance</p>',
                    unsafe_allow_html=True)
PAGES = ["Accueil", "Parcours de doublage", "Passeports de voix", "Demande de génération", "Journal d’audit",
         "Passeport 360°", "Qualité & énergie"]
page = st.sidebar.radio("Navigation", PAGES, label_visibility="collapsed")
st.sidebar.divider()
with st.sidebar.expander("🚩 Signaler un abus"):
    desc = st.text_area("Description", key="abus_desc", placeholder="Ex. : ma voix est utilisée sans mon accord")
    vid = st.text_input("Voix concernée (facultatif)", key="abus_voice")
    if st.button("Envoyer le signalement"):
        if desc.strip():
            e = guardrails.report_abuse(audit, "utilisateur_console", desc.strip(), vid or None)
            st.success(f"Signalement journalisé (entrée n° {e.index}) pour le référent éthique.")
        else:
            st.warning("Décrivez l’abus avant d’envoyer.")
if not store.list():
    st.sidebar.warning("Aucune licence. Lancez : `python scripts/seed_demo.py`")

# ---------------------------------------------------------------- pages
if page == "Accueil":
    st.markdown('<p class="brand">SAWTI 360</p><p class="tag">Le doublage de confiance</p>', unsafe_allow_html=True)
    st.subheader("Chaque voix a un passeport. Chaque film garde son identité.")
    st.write("Un cinéaste tunisien fait doubler son film **de la derja vers le français** sous contrôle humain. "
             "À chaque étape, une **couche de confiance** vérifie le consentement des voix, mesure la qualité par langue, "
             "étiquette ce que l’IA a fait, journalise chaque décision et affiche l’énergie consommée. "
             "À l’export, le film part avec un **Passeport 360°** signé et vérifiable par QR.")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Ce qui fonctionne dans cette V1")
        st.markdown("- Passeports de voix signés (Ed25519) : créer, vérifier, révoquer\n"
                    "- Moteur de règles : **refus** sans consentement, **accord** avec licence, **refus après révocation**\n"
                    "- Journal d’audit à chaîne de hachage, détection de falsification\n"
                    "- Label, manifeste de provenance, générique des voix\n"
                    "- Passeport 360° signé + QR + vérification hors ligne\n"
                    "- Panneau énergie (CodeCarbon), script de mesure WER")
    with c2:
        st.markdown("#### Ce qui arrive (demi-finale, finale)")
        st.markdown("- Séparation des pistes, transcription derja, traduction contextuelle + glossaire\n"
                    "- Vérificateur de fidélité complet (aperçu à règles déjà actif)\n"
                    "- Synthèse vocale réelle et mixage (V1 : signal neutre de remplacement)\n"
                    "- Shield (détection de clone), filigrane, équipe rouge")
        st.info("Démo en 60 s : **Demande de génération** → voix non enregistrée (refus) → voix consentie (accord) → "
                "**Passeport 360°** → révoquer la licence → nouvelle demande (refus).")

elif page == "Parcours de doublage":
    st.markdown("### Parcours de doublage &nbsp; `DERJA → FRANÇAIS`")
    st.markdown('<span class="demo">exemple de démonstration — pas un extrait de film réel</span>', unsafe_allow_html=True)
    steps = ["1 · Import", "2 · Pistes", "3 · Transcription", "4 · Validation", "5 · Traduction", "6 · Fidélité", "7 · Adaptation", "8 · Voix"]
    tabs = st.tabs(steps)
    src_default, tr_default = "Nlaqawk fil café, rendez-vous à 15 h.", "On se retrouve au café à 50 h."
    with tabs[0]:
        st.markdown('#### 01 · Import local <span class="porte">PORTE · Sécurité : chiffrement, accès par rôle</span>', unsafe_allow_html=True)
        st.write("Le film inédit reste sur la machine du cinéaste, dans le **coffre local** chiffré (`sawti/vault.py`, Fernet/AES, rôles cinéaste / adaptateur / référent).")
        st.success("✅ V1 : coffre chiffré et contrôle de rôle implémentés et testés. 🟡 Import vidéo dans l’interface : demi-finale.")
    with tabs[1]:
        st.markdown('#### 02 · Séparation des pistes <span class="porte">PORTE · Durabilité : énergie mesurée</span>', unsafe_allow_html=True)
        st.warning("🟡 Demi-finale : Demucs (dialogue / musique et ambiance), énergie mesurée. Non implémenté en V1.")
    with tabs[2]:
        st.markdown('#### 03 · Transcription <span class="porte">PORTE · Diversité : score par langue et accent</span>', unsafe_allow_html=True)
        rows = wer_rows()
        if rows:
            st.dataframe(pd.DataFrame(rows), hide_index=True)
        else:
            st.warning(f"WER derja : **{A_MESURER}** — script prêt : `python scripts/run_wer.py` (attend `data/bench/derja_01.wav` + `.txt`).")
    with tabs[3]:
        st.markdown('#### 04 · Validation de la transcription <span class="porte">PORTE · Contrôle humain</span>', unsafe_allow_html=True)
        src = st.text_input("Transcription proposée par l’IA (modifiable)", src_default, key="src_txt")
        who = st.text_input("Validé par", "Cinéaste (démo)", key="src_who")
        if st.button("✔ Valider la transcription"):
            audit.append(who, "TRANSCRIPTION_VALIDEE", {"texte": src, "modifie": src != src_default}, "VALIDE")
            st.session_state["src_valid"] = src
            st.success("Validé par le cinéaste — le texte corrigé fait foi. Décision journalisée.")
        st.caption("L’IA propose · l’humain décide")
    with tabs[4]:
        st.markdown('#### 05 · Traduction contextuelle + glossaire <span class="porte">PORTE · Cultures et langues</span>', unsafe_allow_html=True)
        st.warning("🟡 Demi-finale : modèle local de traduction (licence à vérifier) + glossaire culturel. En V1, la traduction est saisie à la main à l’étape 6.")
    with tabs[5]:
        st.markdown('#### 06 · Vérification de fidélité <span class="porte">PORTE · Robustesse : erreurs signalées</span>', unsafe_allow_html=True)
        s = st.text_input("Source", st.session_state.get("src_valid", src_default), key="fid_s")
        t = st.text_input("Traduction", tr_default, key="fid_t")
        alerts = fidelity.check(s, t)
        if alerts:
            for a in alerts:
                st.error(f"**{a['type']}** — {a['message']}")
        else:
            st.success("Aucune alerte (chiffres, noms, négations). Ce n’est pas une preuve de fidélité : la relecture humaine reste requise.")
        st.caption("Aperçu V1 à règles déterministes (réellement exécuté). Rétro-traduction et évaluation sur 100 erreurs injectées : demi-finale — précision/rappel [à mesurer].")
    with tabs[6]:
        st.markdown('#### 07 · Adaptation et validation réplique par réplique <span class="porte">PORTE · Responsabilité</span>', unsafe_allow_html=True)
        line = st.text_input("Réplique finale", "On se retrouve au café à 15 h.", key="ad_line")
        choice = st.radio("Décision de l’adaptateur", ["Accepter", "Réécrire", "Rejeter"], horizontal=True)
        if st.button("Enregistrer la décision"):
            audit.append("Adaptateur (démo)", "REPLIQUE_" + choice.upper(), {"replique": line}, choice.upper())
            st.session_state["line_valid"] = choice != "Rejeter"
            st.success("Décision journalisée.")
    with tabs[7]:
        st.markdown('#### 08 · Synthèse vocale <span class="porte">PORTE · Consentement : refus si hors licence</span>', unsafe_allow_html=True)
        st.write("Deux choix seulement : **voix neutre** (générique, sans titulaire) ou **voix consentie** (licence valide, Passeport de voix).")
        st.info("Rendez-vous dans **Demande de génération** pour tester la porte d’autorisation.")

elif page == "Passeports de voix":
    st.markdown("### Passeports de voix")
    lics = store.list()
    if lics:
        df = pd.DataFrame([{"Licence": l.license_id, "Voix": l.voice_id, "Titulaire": l.holder_name, "Statut": l.status,
                            "Usages autorisés": ", ".join(l.allowed_uses), "Projets": ", ".join(l.projects),
                            "Langues": ", ".join(l.languages), "Valide du": l.valid_from, "au": l.valid_until,
                            "Signature": "✔ valide" if store.verify(l) else "✘ invalide",
                            "Démo": "données de démonstration" if l.demo else ""} for l in lics])
        st.dataframe(df, hide_index=True)
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Révoquer une licence")
        active = [l.license_id for l in lics if l.status == "active"]
        if active:
            lid = st.selectbox("Licence", active)
            if st.button("Révoquer", type="primary"):
                store.revoke(lid)
                audit.append("titulaire", "LICENCE_REVOQUEE", {"license_id": lid}, "REVOQUEE")
                st.success(f"{lid} révoquée. Toute nouvelle génération avec cette voix sera refusée.")
                st.rerun()
        st.caption("Limite assumée : la révocation bloque les générations futures ; elle ne retire pas un audio déjà diffusé.")
    with c2:
        st.markdown("#### Créer un Passeport de voix")
        with st.form("new_lic"):
            name = st.text_input("Titulaire de la voix")
            voice = st.text_input("Identifiant de voix", placeholder="voice_prenom")
            uses = st.multiselect("Usages autorisés", runtime.USES[:2], default=["doublage_film"])
            proj = st.text_input("Projet", runtime.DEMO_PROJECT)
            langs = st.multiselect("Langues", runtime.LANGS, default=["fr"])
            d1, d2 = st.columns(2)
            vf, vu = d1.date_input("Valide du", date.today()), d2.date_input("au", date(date.today().year + 1, date.today().month, 1))
            consent = st.file_uploader("Formulaire de consentement signé (son empreinte SHA-256 est conservée, pas le fichier)")
            if st.form_submit_button("Créer et signer"):
                if not (name and voice and consent and uses and langs):
                    st.error("Titulaire, identifiant, usages, langues et **preuve de consentement** sont obligatoires.")
                elif guardrails.is_blocked_name(name) or voice in guardrails.blocked_voice_ids():
                    st.error(REASONS_FR["PERSONNALITE_BLOQUEE"])
                else:
                    import hashlib
                    lic = store.create(voice_id=voice, holder_name=name, allowed_uses=uses, projects=[proj], languages=langs,
                                       valid_from=str(vf), valid_until=str(vu),
                                       consent_evidence_sha256=hashlib.sha256(consent.getvalue()).hexdigest())
                    audit.append("console", "LICENCE_CREEE", lic.to_dict(), "CREEE")
                    st.success(f"Passeport de voix {lic.license_id} créé et signé.")
                    st.rerun()
        st.caption("V1 : la licence est signée par la clé de la plateforme (démo), pas encore par une clé détenue par le titulaire.")

elif page == "Demande de génération":
    st.markdown("### Demande de génération")
    st.caption("Moteur de règles : autorisation vérifiée avant toute génération. Refus par défaut.")
    known = sorted({l.voice_id for l in store.list()})
    options = [synth.NEUTRAL_VOICE_ID] + known + ["voice_inconnue (non enregistrée)"] + guardrails.blocked_voice_ids()[:1]
    c1, c2 = st.columns(2)
    voice = c1.selectbox("Voix", options, index=min(len(options) - 1, len(known) + 1))
    project = c2.text_input("Projet", runtime.DEMO_PROJECT)
    use = c1.selectbox("Usage", runtime.USES)
    lang = c2.selectbox("Langue", runtime.LANGS)
    text = st.text_area("Réplique à générer", "On se retrouve au café à 15 h.")
    validated = st.checkbox("Texte validé par un humain (adaptateur)", value=True)
    if st.button("Demander la génération", type="primary"):
        d, path, rec = run_generation(voice.split(" ")[0], project, use, lang, text, validated, "console_demo")
        decision_card(d, path)
        if d.allowed:
            kind = "neutre" if d.license_id is None else "consentie"
            st.markdown(f"**Label visible :** « {label.visible_label(kind, 'Adaptateur (démo)')} »")
        if rec.get("kwh") is not None:
            st.caption(f"Énergie mesurée pour cette demande : {rec['kwh']:.2e} kWh · {rec['gco2']:.2e} gCO₂ · {rec['duree_s']} s (CodeCarbon)")

elif page == "Journal d’audit":
    st.markdown("### Journal d’audit à chaîne de hachage")
    entries = audit.entries()
    if not entries:
        st.info("Journal vide.")
    else:
        df = pd.DataFrame([{"n°": e.index, "Horodatage": e.timestamp, "Acteur": e.actor, "Action": e.action, "Décision": e.decision,
                            "Empreinte": e.entry_hash[:12] + "…", "← Empreinte précédente": e.prev_hash[:12] + "…"} for e in entries])
        st.dataframe(df, hide_index=True, height=320)
        st.code(f"Empreinte de tête : {audit.head_hash()}")
        c1, c2, c3 = st.columns(3)
        if c1.button("🔎 Vérifier la chaîne", type="primary"):
            ok, bad = audit.verify_chain()
            (st.success if ok else st.error)(f"Chaîne intègre : {len(entries)} entrées vérifiées." if ok
                                             else f"⚠️ Falsification détectée à l’entrée n° {bad}.")
        refus = [e for e in entries if e.action == "GENERATION_REFUSEE"]
        if c2.button("🧪 Démo : falsifier un refus") and refus:
            st.session_state["tampered"] = (refus[-1].index, refus[-1].decision)
            audit.tamper_for_demo(refus[-1].index, "OK")
            st.warning(f"Entrée n° {refus[-1].index} réécrite en « OK » directement en base. Cliquez sur « Vérifier la chaîne ».")
        if c3.button("↩️ Rétablir l’entrée") and st.session_state.get("tampered"):
            audit.restore_for_demo(*st.session_state.pop("tampered"))
            st.success("Entrée d’origine rétablie.")

elif page == "Passeport 360°":
    st.markdown("### Passeport 360°")
    st.caption("Dossier vérifiable qui accompagne chaque export : festivals, producteurs et financeurs peuvent le contrôler sans nous faire confiance.")
    c1, c2 = st.columns(2)
    title = c1.text_input("Titre du film", "Court-métrage de démonstration")
    version = c2.text_input("Version", "VF-demo-0.1")
    validator = c1.text_input("Validateur humain", "Adaptateur (démo)")
    referent = c2.text_input("Référent éthique", "[prénom] — référent éthique")
    active = [l for l in store.list() if l.status == "active"]
    chosen = st.multiselect("Voix consenties utilisées", [l.license_id for l in active], default=[l.license_id for l in active[:1]])
    if st.button("Générer et signer le Passeport 360°", type="primary"):
        voices = [{"role": "Narration", "kind": "neutre"}]
        voices += [{"role": f"Personnage {i + 1}", "kind": "consentie", "holder_name": l.holder_name, "license_id": l.license_id}
                   for i, l in enumerate(l for l in active if l.license_id in chosen)]
        rows = wer_rows()
        wer = {r["langue"]: f"WER {r['wer']:.1%} · CER {r['cer']:.1%} ({r['modele']})" for r in rows} or None
        es = energy.summary(energy.load())
        p = passport.assemble(title=title, version=version, asset_sha256=None, licenses=store.list(), audit=audit,
                              validator=validator, referent=referent, voices=voices, models=[synth.PLACEHOLDER_MODEL],
                              energy=es, wer=wer, demo=True)
        p = passport.sign(p, store.key)
        audit.append(validator, "PASSEPORT_360_SIGNE", {"empreinte": passport.passport_hash(p)}, "SIGNE")
        passport.export(p, runtime.EXPORT_DIR)
        st.session_state["passport"] = p
    p = st.session_state.get("passport")
    if p:
        res = passport.verify(p, store.public_key)
        a, b = st.columns([1, 2])
        a.image(passport.qr_png(p), caption="QR de vérification (empreinte du passeport)", width=220)
        with b:
            st.markdown(f'<div class="card {"ok" if res["valide"] else "ko"}"><div class="big">{"✔ VÉRIFIÉ" if res["valide"] else "✘ INVALIDE"}</div>'
                        f'{" ; ".join(res["detail"])}</div>', unsafe_allow_html=True)
            for i, sec in enumerate(["Identité du film", "Licences et consentement des voix", "Scores de qualité par langue et accent",
                                     "Label de transparence", "Manifeste de provenance", "Journal d’audit",
                                     "Sécurité et intégrité des modèles", "Énergie consommée (kWh)", "Émissions (gCO₂)"], 1):
                st.markdown(f"`0{i}` {sec} ✓")
        d1, d2 = st.columns(2)
        d1.download_button("⬇️ Télécharger le JSON", json.dumps(p, ensure_ascii=False, indent=2), "passeport_360.json", "application/json")
        d2.download_button("⬇️ Télécharger la page HTML", passport.to_html(p), "passeport_360.html", "text/html")
        st.caption("Vérification hors ligne : `python scripts/verify_passport.py exports/passeport_360.json`")
        up = st.file_uploader("Vérifier un passeport reçu (JSON)", type="json")
        if up:
            r = passport.verify(json.loads(up.getvalue().decode("utf-8")), store.public_key)
            (st.success if r["valide"] else st.error)(("VALIDE — " if r["valide"] else "INVALIDE — ") + " ; ".join(r["detail"]))
        with st.expander("Voir le contenu complet (JSON)"):
            st.json(p)

elif page == "Qualité & énergie":
    st.markdown("### Qualité & énergie")
    st.markdown("#### Qualité par langue (Sawti-Bench)")
    rows = wer_rows()
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True)
        st.caption("Valeurs mesurées par `scripts/run_wer.py` (faster-whisper + jiwer, normalisation documentée).")
    else:
        st.dataframe(pd.DataFrame([{"Langue": "ar-TN (derja)", "WER": A_MESURER, "CER": A_MESURER},
                                   {"Langue": "fr", "WER": A_MESURER, "CER": A_MESURER}]), hide_index=True)
        st.warning("Aucune donnée Sawti-Bench trouvée — à fournir par l’équipe (`data/bench/derja_01.wav` + `derja_01.txt`), puis `python scripts/run_wer.py`.")
    st.markdown("#### Panneau énergie")
    recs = energy.load()
    s = energy.summary(recs)
    m1, m2, m3, m4 = st.columns(4)
    fmt = lambda v, f: v if isinstance(v, str) else f.format(v)  # noqa: E731
    m1.metric("Énergie (kWh)", fmt(s["kwh"], "{:.2e}"))
    m2.metric("Émissions (gCO₂)", fmt(s["gco2"], "{:.2e}"))
    m3.metric("Durée cumulée (s)", fmt(s["duree_s"], "{}"))
    m4.metric("Tâches mesurées", s["mesures"])
    if recs:
        st.dataframe(pd.DataFrame(recs)[["date", "tache", "kwh", "gco2", "duree_s"]], hide_index=True, height=240)
        st.caption("Mesures CodeCarbon (estimation CPU/RAM, mode hors ligne, mix électrique TUN). En V1 elles portent sur la porte d’autorisation "
                   "et un signal de remplacement : valeurs minuscules, non représentatives d’une vraie synthèse vocale.")
    else:
        st.info("Aucune mesure pour l’instant : faites une demande de génération.")

st.markdown(f'<div class="foot">{SLOGAN}</div>', unsafe_allow_html=True)
