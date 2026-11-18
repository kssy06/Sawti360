import {
  AudioLines,
  Bell,
  BookUser,
  ChevronsUpDown,
  Coins,
  FileBadge2,
  Library,
  Menu,
  RotateCcw,
  ScrollText,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { voiceById } from "../core/catalog";
import { fmt, PLANS } from "../core/credits";
import { balanceOf, CREATOR, earningsOf, OWNER, OWNER_VOICE, useStore, type Persona } from "../state/store";
import { frDate, Orb, Popover, toast, Toasts } from "./kit";

const NAV: Record<Persona, { to: string; label: string; Icon: typeof AudioLines }[]> = {
  creator: [
    { to: "/studio", label: "Studio de doublage", Icon: AudioLines },
    { to: "/voix", label: "Voix", Icon: Library },
    { to: "/passeport", label: "Passeport 360°", Icon: FileBadge2 },
    { to: "/journal", label: "Journal d’audit", Icon: ScrollText },
    { to: "/jetons", label: "Jetons", Icon: Coins },
  ],
  owner: [
    { to: "/ma-voix", label: "Mon Passeport de voix", Icon: BookUser },
    { to: "/revenus", label: "Revenus", Icon: Wallet },
    { to: "/voix", label: "Voix", Icon: Library },
    { to: "/journal", label: "Journal d’audit", Icon: ScrollText },
  ],
};

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#121212" />
      <path d="M9 20.5c1.6 1.4 3.9 2.1 6.6 2.1 3.6 0 6.4-1.6 6.4-4.6 0-2.4-1.7-3.5-4.9-4.2l-2-.4c-1.6-.3-2.3-.8-2.3-1.7 0-1 1-1.7 2.8-1.7 1.6 0 3 .5 4.1 1.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="9" r="2.6" fill="#C8102E" />
    </svg>
  );
}

function PersonaSwitch() {
  const persona = useStore((s) => s.persona);
  const setPersona = useStore((s) => s.setPersona);
  const reset = useStore((s) => s.reset);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const me = persona === "creator" ? CREATOR : OWNER;
  const lina = voiceById(OWNER_VOICE)!;
  const go = (p: Persona) => {
    setPersona(p);
    setOpen(false);
    navigate(p === "creator" ? "/studio" : "/ma-voix");
  };
  return (
    <>
      <button ref={ref} className="persona" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        {persona === "owner" ? <Orb hue={lina.hue} size={30} /> : <span className="avatar">NF</span>}
        <span className="who">
          <b>{me.name}</b>
          <span>{persona === "creator" ? "Espace créateur" : "Espace titulaire de voix"}</span>
        </span>
        <ChevronsUpDown size={15} color="var(--ink-3)" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label="Changer d’espace">
        <div className="menu">
          <div className="menu-title">Voir la démonstration comme…</div>
          <button onClick={() => go("creator")} aria-pressed={persona === "creator"}>
            <span className="avatar sm">NF</span>
            <span className="who">
              <b>{CREATOR.name}</b>
              <span>Crée et double des œuvres</span>
            </span>
          </button>
          <button onClick={() => go("owner")} aria-pressed={persona === "owner"}>
            <Orb hue={lina.hue} size={24} />
            <span className="who">
              <b>{OWNER.name}</b>
              <span>Prête sa voix, fixe ses règles, est payée</span>
            </span>
          </button>
          <div className="sep" />
          <button
            onClick={() => {
              reset();
              setOpen(false);
              toast("Démonstration réinitialisée");
            }}
          >
            <RotateCcw />
            Réinitialiser la démonstration
          </button>
        </div>
      </Popover>
    </>
  );
}

function Meter() {
  const persona = useStore((s) => s.persona);
  const plan = useStore((s) => s.plan);
  const balance = useStore(balanceOf);
  const earned = useStore((s) => earningsOf(s, OWNER_VOICE));
  if (persona === "owner") {
    return (
      <div className="meter">
        <div className="meter-row">
          <span className="muted">Reçu ce mois-ci</span>
          <strong className="num">{fmt.format(earned)} jetons</strong>
        </div>
        <NavLink to="/revenus">Voir le détail des revenus</NavLink>
      </div>
    );
  }
  const total = PLANS[plan].monthly;
  return (
    <div className="meter">
      <div className="meter-row">
        <span className="muted">Jetons restants</span>
        <strong className="num">{fmt.format(balance)}</strong>
      </div>
      <div className="bar" role="meter" aria-valuenow={balance} aria-valuemin={0} aria-valuemax={total} aria-label="Jetons restants">
        <span style={{ width: `${(balance / total) * 100}%` }} />
      </div>
      <NavLink to="/jetons">Offre {PLANS[plan].name} · {fmt.format(total)} par mois</NavLink>
    </div>
  );
}

function Notifications() {
  const persona = useStore((s) => s.persona);
  const all = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markRead);
  const list = all.filter((n) => n.persona === persona);
  const unread = list.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        className="btn btn-ghost btn-icon bell"
        aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setTimeout(() => markRead(persona), 1200);
        }}
      >
        <Bell />
        {unread > 0 && <span className="dot num">{unread}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="right" label="Notifications">
        <div className="notes">
          <div className="notes-head">
            <h3>Notifications</h3>
          </div>
          {list.length === 0 ? (
            <p className="muted notes-empty">
              {persona === "owner" ? "Vous serez prévenue ici à chaque utilisation de votre voix." : "Les révocations de licence et les paiements aux titulaires apparaîtront ici."}
            </p>
          ) : (
            <ul>
              {list.slice(0, 8).map((n) => (
                <li key={n.id} className={n.read ? "" : "unread"}>
                  <span className={`tick tick-${n.tone}`} aria-hidden />
                  <div>
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                    <time className="muted">{frDate(n.at, true)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}

function SynthesisStatus() {
  const [state, setState] = useState<"loading" | "on" | "mock" | "off">("loading");
  useEffect(() => {
    fetch("/api/tts")
      .then((r) => r.json())
      .then((j) => setState(j.mock ? "mock" : j.configured ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);
  if (state === "loading") return null;
  const text = { on: "Moteur de voix connecté", mock: "Moteur de voix : mode test", off: "Moteur de voix non configuré" }[state];
  return (
    <span className={`chip ${state === "on" ? "chip-ok" : "chip-outline"}`} title="La clé ElevenLabs reste côté serveur ; le navigateur ne la voit jamais.">
      <span className={`led led-${state}`} aria-hidden />
      {text}
    </span>
  );
}

const TITLES: Record<string, string> = {
  "/studio": "Studio de doublage",
  "/voix": "Voix",
  "/passeport": "Passeport 360°",
  "/journal": "Journal d’audit",
  "/jetons": "Jetons",
  "/ma-voix": "Mon Passeport de voix",
  "/revenus": "Revenus",
};

export function Shell() {
  const persona = useStore((s) => s.persona);
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    document.title = `${TITLES[pathname] ?? "Sawti 360"} · Sawti 360`;
  }, [pathname]);
  return (
    <div className="app">
      <aside className={`side ${navOpen ? "open" : ""}`} aria-label="Navigation principale">
        <div className="brand">
          <BrandMark />
          <span>
            Sawti 360 <small>démo</small>
          </span>
        </div>
        <PersonaSwitch />
        <nav className="nav">
          {NAV[persona].map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}>
              <Icon aria-hidden />
              {label}
            </NavLink>
          ))}
          <div className="nav-label">Public</div>
          <NavLink to="/verifier">
            <UserRound aria-hidden />
            Page de vérification
          </NavLink>
        </nav>
        <div className="side-foot">
          <Meter />
          <p className="demo-note">Profils fictifs, paiements simulés. Les voix sont des voix de synthèse ElevenLabs.</p>
        </div>
      </aside>
      {navOpen && <div className="sheet-scrim side-scrim" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <header className="top">
          <button className="btn btn-ghost btn-icon nav-toggle" aria-label="Ouvrir la navigation" onClick={() => setNavOpen(true)}>
            <Menu />
          </button>
          <div className="crumb">{TITLES[pathname] ?? ""}</div>
          <div className="spacer" />
          <SynthesisStatus />
          <Notifications />
        </header>
        <Outlet />
      </div>
      <Toasts />
    </div>
  );
}
