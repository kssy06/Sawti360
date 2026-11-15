import math, hashlib, json
import reportlab.graphics.barcode.qrencoder as qe

PRINCIPES = ["Contrôle humain", "Consentement", "Équité d'accès", "Diversité", "Transparence",
             "Responsabilité", "Robustesse", "Sécurité des données", "Durabilité"]

ETAPES = [
    ("Import local", "Sécurité"),
    ("Séparation des pistes", "Durabilité"),
    ("Transcription", "Diversité"),
    ("Validation de la transcription", "Contrôle humain"),
    ("Traduction contextuelle", "Robustesse"),
    ("Adaptation et validation", "Responsabilité"),
    ("Choix de la voix", "Consentement"),
    ("Synthèse et mixage", "Durabilité"),
    ("Étiquetage", "Transparence"),
    ("Export", "Toutes les portes"),
]

CSS = """
:root{--bg:#F5F5F7;--surface:#FFFFFF;--side:#ECECF1;--line:#D8D8DE;--text:#1D1D1F;--sec:#58585D;
--accent:#0A5CC2;--accent-bg:#E6F0FC;--ok:#17703A;--ok-bg:#E3F3E8;--bad:#B8241B;--bad-bg:#FCE9E7;
--warn:#8A4F00;--warn-bg:#FFF1D9;--ink:#0E1B2E}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1440px;height:900px;font-family:Inter,'DejaVu Sans',system-ui,sans-serif;font-size:14px;line-height:1.4;
color:var(--text);background:linear-gradient(135deg,#DCE3EE 0%,#E9E4EE 55%,#F1E6E1 100%);display:flex;align-items:center;justify-content:center;-webkit-font-smoothing:antialiased}
.win{width:1360px;height:830px;background:var(--bg);border-radius:14px;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 24px 60px rgba(14,27,46,.28);overflow:hidden;display:flex;flex-direction:column}
.titlebar{height:52px;flex:none;background:#F7F7F9;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 16px;gap:16px;position:relative}
.lights{display:flex;gap:8px}.lights i{width:12px;height:12px;border-radius:50%;display:block}
.lights i:nth-child(1){background:#FF5F57}.lights i:nth-child(2){background:#FEBC2E}.lights i:nth-child(3){background:#28C840}
.ttl{position:absolute;left:0;right:0;text-align:center;font-weight:600;font-size:14px;pointer-events:none}
.ttl small{display:block;font-weight:400;font-size:12px;color:var(--sec);margin-top:-2px}
.badge{margin-left:auto;font-size:12px;font-weight:600;color:var(--warn);background:var(--warn-bg);padding:4px 10px;border-radius:99px;position:relative}
.body{flex:1;display:flex;min-height:0}
.side{width:262px;flex:none;background:var(--side);border-right:1px solid var(--line);padding:14px 10px;overflow:hidden}
.side h6{font-size:12px;font-weight:600;color:var(--sec);padding:10px 10px 6px;letter-spacing:.02em}
.nav{display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:8px;font-size:13.5px;margin-bottom:1px}
.nav.cur{background:var(--accent);color:#fff;font-weight:600}
.nav.done svg{color:var(--ok)}.nav.cur svg{color:#fff}.nav.todo{color:#3C3C41}.nav.todo svg{color:#8E8E93}
.nav svg{flex:none}.nav .n{margin-left:auto;font-size:12px;opacity:.75}
.main{flex:1;min-width:0;padding:24px 28px;overflow:hidden}
h1{font-size:24px;font-weight:700;letter-spacing:-.01em}
.sub{color:var(--sec);font-size:14px;margin-top:2px}
.card{background:var(--surface);border-radius:12px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);padding:16px 18px}
.card h3{font-size:14px;font-weight:600;margin-bottom:10px}
.cap{font-size:12px;color:var(--sec)}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}
.chip.ok{color:var(--ok);background:var(--ok-bg)}.chip.bad{color:var(--bad);background:var(--bad-bg)}
.chip.warn{color:var(--warn);background:var(--warn-bg)}.chip.acc{color:var(--accent);background:var(--accent-bg)}
.chip.gray{color:#48484D;background:#EBEBF0}
.btn{display:inline-flex;align-items:center;gap:6px;font:600 13.5px Inter,sans-serif;padding:7px 14px;border-radius:99px;background:#fff;color:var(--accent);box-shadow:0 0 0 1px rgba(0,0,0,.12)}
.btn.pri{background:var(--accent);color:#fff;box-shadow:none}.btn.dis{color:#6A6A70;background:#EBEBF0;box-shadow:none}
.btn.del{color:var(--bad)}
.row{display:flex;gap:16px}.col{display:flex;flex-direction:column;gap:16px}
table{border-collapse:collapse;width:100%}
th{font-size:12px;font-weight:600;color:var(--sec);text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid #EEEEF2;vertical-align:middle;font-size:13.5px}
tr:last-child td{border-bottom:0}
.ar{font-family:'DejaVu Sans',sans-serif;direction:rtl;text-align:right;font-size:17px;line-height:1.7}
.mono{white-space:nowrap;font-family:'DejaVu Sans Mono',monospace;font-size:12px}
.meter{display:inline-block;width:70px;height:6px;background:#E3E3E8;border-radius:9px;vertical-align:middle;overflow:hidden}
.meter b{display:block;height:100%;border-radius:9px;background:var(--ok)}.meter.w b{background:#B96A00}
.lbl{font-size:12px;font-weight:600;color:var(--sec);text-transform:none;margin-bottom:4px}
.note{font-size:12.5px;color:var(--sec)}
"""

def ico(kind, s=16):
    p = {
     "done": '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
     "todo": '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
     "cur": '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3" fill="currentColor"/>',
     "x": '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
     "lock": '<rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
     "warn": '<path d="M8 1.6l7 12.4H1z" fill="currentColor"/><path d="M8 6v3.6M8 11.4v.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
    }[kind]
    return f'<svg width="{s}" height="{s}" viewBox="0 0 16 16">{p}</svg>'

def sidebar(active):
    out = '<div class="side"><h6>PROJET</h6><div class="nav todo" style="color:var(--text);font-weight:600">'
    out += '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 6l4 2-4 2z" fill="currentColor"/></svg>Extrait_derja_2min</div>'
    out += '<h6>PARCOURS · 10 PORTES</h6>'
    for i, (name, _) in enumerate(ETAPES, 1):
        a = 11 if isinstance(active, str) else active
        st = "done" if i < a else ("cur" if i == a else "todo")
        out += f'<div class="nav {st}">{ico(st)}<span>{name}</span><span class="n">{i}</span></div>'
    out += '<h6>CONFIANCE</h6>'
    for k, name in [("journal", "Journal d'audit"), ("bench", "Sawti-Bench"), ("passeport", "Passeport 360°")]:
        st = "cur" if active == k else "todo"
        out += f'<div class="nav {st}">{ico("cur" if st=="cur" else "todo")}<span>{name}</span></div>'
    return out + '</div>'

def window(title, subtitle, active, content):
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="win"><div class="titlebar"><div class="lights"><i></i><i></i><i></i></div>
<div class="ttl">{title}<small>{subtitle}</small></div><span class="badge">Maquette · données illustratives</span></div>
<div class="body">{sidebar(active)}<div class="main">{content}</div></div></div></body></html>'''

def ring(states, size=200, stroke=14, center=True, on='#17703A'):
    cx = cy = size / 2; r = size / 2 - stroke
    n = len(states); span = 360 / n; gap = 7
    paths = ""
    for i, ok in enumerate(states):
        a0 = math.radians(-90 + i * span + gap / 2); a1 = math.radians(-90 + (i + 1) * span - gap / 2)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0); x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        col = on if ok else "#D2D2D8"
        paths += f'<path d="M{x0:.2f} {y0:.2f}A{r} {r} 0 0 1 {x1:.2f} {y1:.2f}" stroke="{col}" stroke-width="{stroke}" fill="none" stroke-linecap="round"/>'
    t = ""
    if center:
        k = sum(states)
        t = (f'<text x="{cx}" y="{cy+4}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="{size*0.17:.0f}" fill="#1D1D1F">360°</text>'
             f'<text x="{cx}" y="{cy+size*0.13+6:.0f}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="{max(12,size*0.065):.0f}" fill="#58585D">{k} sur {n} vérifiés</text>')
    return f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">{paths}{t}</svg>'

def qr_svg(data, px=150):
    q = qe.QRCode(3, qe.QRErrorCorrectLevel.M); q.addData(data); q.make()
    n = q.getModuleCount(); m = px / (n + 4)
    rects = "".join(f'<rect x="{(c+2)*m:.2f}" y="{(r+2)*m:.2f}" width="{m+.3:.2f}" height="{m+.3:.2f}"/>'
                    for r in range(n) for c in range(n) if q.isDark(r, c))
    return f'<svg width="{px}" height="{px}" viewBox="0 0 {px} {px}"><rect width="{px}" height="{px}" fill="#fff"/><g fill="#0E1B2E">{rects}</g></svg>'

# ---- vraie chaîne de hachage pour le journal d'audit ----
ENTRIES = [
    ("2026-11-15 16:02:11", "Import local de l'extrait", "Cinéaste", "import"),
    ("2026-11-15 16:09:40", "Transcription validée (4 répliques)", "Cinéaste", "validation"),
    ("2026-11-15 16:14:03", "Réplique 2 : chiffre corrigé (300 dinars)", "Adaptateur", "adaptation"),
    ("2026-11-15 16:18:27", "Synthèse refusée : voix non enregistrée", "Moteur de règles", "refus"),
    ("2026-11-15 16:19:02", "Synthèse acceptée : licence VL-0001 valide", "Moteur de règles", "autorisation"),
    ("2026-11-15 16:25:55", "Export signé du Passeport 360°", "Référent éthique", "export"),
]
def chain():
    prev = "0" * 64; out = []
    for i, (t, a, who, kind) in enumerate(ENTRIES):
        h = hashlib.sha256((prev + json.dumps([i, t, a, who, kind], ensure_ascii=False)).encode()).hexdigest()
        out.append((i, t, a, who, kind, prev, h)); prev = h
    return out
CHAIN = chain()
HEAD = CHAIN[-1][6]
FILM_HASH = hashlib.sha256(b"Extrait_derja_2min.mp4 - maquette").hexdigest()
