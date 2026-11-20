import {
  Bell,
  ChevronRight,
  ChevronsUpDown,
  CreditCard,
  FileBadge2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  ShieldCheck,
  Store as StoreIcon,
  UserRoundCog,
  Wallet,
} from "lucide-react";
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { messageOf } from "../api/client";
import { BACKEND } from "../lib/backend";
import { accountOf, statusOf, useStore, type Persona } from "../state/store";
import { requestStatus } from "../state/workflow";
import { Brand } from "./brand";
import { FullLoader, PageLoader } from "./Loader";
import { Popover, relTime, toast, Toasts } from "./kit";
import { useNotificationPolling } from "../state/remote/notifications";

/* ------------------------------------------------------------------ breadcrumbs */

export type Crumb = { label: string; to?: string };
const CrumbCtx = createContext<(c: Crumb[]) => void>(() => {});
export function useCrumbs(crumbs: Crumb[]) {
  const set = useContext(CrumbCtx);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    document.title = `${crumbs[crumbs.length - 1]?.label ?? "Sawti 360"} · Sawti 360`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

/* ------------------------------------------------------------------ navigation */

function useCounts() {
  const projects = useStore((s) => s.projects);
  const requests = useStore((s) => s.requests);
  const session = useStore((s) => s.session);
  const owned = useStore((s) => (s.session ? s.ownedVoices[s.session.accountId] : undefined));
  const mine = Object.values(projects).filter((p) => p.accountId === session?.accountId);
  const statuses = mine.map((p) => statusOf({ requests }, p));
  const inProgress = statuses.filter((s) => s !== "termine").length;
  const done = statuses.filter((s) => s === "termine").length;
  const waiting = statuses.filter((s) => s === "attente_autorisation").length;
  const sent = requests.filter((r) => mine.some((p) => p.id === r.projectId) && (requestStatus(r) === "envoyee" || (requestStatus(r) === "acceptee" && r.price > 0 && r.payment !== "confirme"))).length;
  const incoming = owned ? requests.filter((r) => r.voiceId === owned.voiceId && requestStatus(r) === "envoyee").length : 0;
  return { all: mine.length, inProgress, done, waiting, sent, incoming, hasVoice: Boolean(owned) };
}

/**
 * The active item's highlight is one element that glides from the previous item to the new one,
 * instead of each item switching its own background.
 */
function NavPill() {
  const ref = useRef<HTMLSpanElement>(null);
  const { pathname, search } = useLocation();
  const persona = useStore((s) => s.persona);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const nav = ref.current?.parentElement;
    const active = nav?.querySelector<HTMLElement>("a.active");
    setBox(active ? { y: active.offsetTop, h: active.offsetHeight } : null);
  }, [pathname, search, persona]);
  return <span ref={ref} className={`nav-pill ${box ? "" : "hidden"}`} aria-hidden style={box ? { transform: `translateY(${box.y}px)`, height: box.h } : undefined} />;
}

function CreatorNav() {
  const c = useCounts();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const view = params.get("vue");
  const projActive = (v: string | null) => pathname === "/projets" && view === v;
  return (
    <nav className="nav" aria-label="Espace créateur">
      <NavPill />
      <NavLink to="/tableau-de-bord">
        <LayoutDashboard aria-hidden />
        Tableau de bord
      </NavLink>
      <div className="nav-sec">Projets</div>
      <NavLink to="/projets" className={() => (projActive(null) || pathname.startsWith("/projet/") ? "active" : "")} end>
        <FolderKanban aria-hidden />
        Mes projets
        <span className="nav-count">{c.all}</span>
      </NavLink>
      <NavLink to="/projets?vue=en-cours" className={() => `nav-sub ${projActive("en-cours") ? "active" : ""}`}>
        En cours
        <span className="nav-count" title={c.waiting ? `dont ${c.waiting} en attente d’autorisation` : undefined}>
          {c.inProgress}
        </span>
      </NavLink>
      <NavLink to="/projets?vue=termines" className={() => `nav-sub ${projActive("termines") ? "active" : ""}`}>
        Terminés
        <span className="nav-count">{c.done}</span>
      </NavLink>
      <div className="nav-sec">Voix</div>
      <NavLink to="/bibliotheque">
        <Library aria-hidden />
        Bibliothèque de voix
      </NavLink>
      <NavLink to="/demandes">
        <Inbox aria-hidden />
        Demandes de voix
        {c.sent > 0 && <span className="nav-count">{c.sent}</span>}
      </NavLink>
      <div className="nav-sec">Confiance</div>
      <NavLink to="/passeports">
        <FileBadge2 aria-hidden />
        Passeports vidéo
      </NavLink>
      <NavLink to="/confiance">
        <ShieldCheck aria-hidden />
        Centre de confiance
      </NavLink>
      <div className="nav-sec">Compte</div>
      <NavLink to="/paiements">
        <CreditCard aria-hidden />
        Paiements
      </NavLink>
    </nav>
  );
}

function OwnerNav() {
  const c = useCounts();
  return (
    <nav className="nav" aria-label="Espace propriétaire vocal">
      <NavPill />
      <NavLink to="/proprietaire" end>
        <LayoutDashboard aria-hidden />
        Vue d’ensemble
      </NavLink>
      <NavLink to="/proprietaire/demandes">
        <Inbox aria-hidden />
        Demandes reçues
        {c.incoming > 0 && <span className="nav-count attn">{c.incoming}</span>}
      </NavLink>
      <NavLink to="/proprietaire/profil">
        <StoreIcon aria-hidden />
        Profil public et tarif
      </NavLink>
      <NavLink to="/proprietaire/regles">
        <UserRoundCog aria-hidden />
        Règles et consentement
      </NavLink>
      <NavLink to="/proprietaire/revenus">
        <Wallet aria-hidden />
        Revenus
      </NavLink>
      <div className="nav-sec">Plateforme</div>
      <NavLink to="/bibliotheque">
        <Library aria-hidden />
        Bibliothèque de voix
      </NavLink>
      <NavLink to="/confiance">
        <ShieldCheck aria-hidden />
        Centre de confiance
      </NavLink>
    </nav>
  );
}

function SpaceSwitch() {
  const persona = useStore((s) => s.persona);
  const setPersona = useStore((s) => s.setPersona);
  const navigate = useNavigate();
  const go = (p: Persona) => {
    if (p === persona) return;
    setPersona(p);
    navigate(p === "creator" ? "/tableau-de-bord" : "/proprietaire");
  };
  return (
    <div className={`space-switch ${persona === "owner" ? "is-owner" : ""}`} role="group" aria-label="Espace de travail">
      <span className="space-pill" aria-hidden />
      <button type="button" aria-pressed={persona === "creator"} onClick={() => go("creator")}>
        Créateur
      </button>
      <button type="button" aria-pressed={persona === "owner"} onClick={() => go("owner")} aria-label="Espace propriétaire vocal">
        Propriétaire
      </button>
    </div>
  );
}

function AccountMenu() {
  const account = useStore(accountOf);
  const accounts = useStore((s) => s.accounts);
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);
  const reset = useStore((s) => s.reset);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  if (!account) return null;
  return (
    <>
      <button ref={ref} type="button" className="account-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <span className="avatar">{account.initials}</span>
        <span className="who">
          <b className="ellipsis">{account.name}</b>
          <span className="ellipsis">{account.email}</span>
        </span>
        <ChevronsUpDown size={15} color="var(--ink-3)" aria-hidden />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label="Compte" width={268}>
        <div className="menu">
          <div className="menu-title">Comptes de démonstration</div>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={a.id === account.id}
              onClick={async () => {
                setOpen(false);
                try {
                  await login(a.id);
                  navigate("/tableau-de-bord");
                  toast(`Connecté en tant que ${a.name}`);
                } catch (err) {
                  toast(messageOf(err), "bad");
                }
              }}
            >
              <span className="avatar avatar-sm">{a.initials}</span>
              <span className="who">
                <b>{a.name}</b>
                <span>{a.org}</span>
              </span>
            </button>
          ))}
          <div className="menu-sep" />
          {!BACKEND && (
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
                toast("Démonstration réinitialisée");
              }}
            >
              <RotateCcw aria-hidden />
              Réinitialiser les données de démonstration
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/connexion");
            }}
          >
            <LogOut aria-hidden />
            Se déconnecter
          </button>
        </div>
      </Popover>
    </>
  );
}

function Notifications() {
  const session = useStore((s) => s.session);
  const persona = useStore((s) => s.persona);
  const all = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markRead);
  useNotificationPolling(useStore.setState, useStore.getState);
  const list = all.filter((n) => n.to === session?.accountId && n.space === persona);
  const unread = list.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="btn btn-ghost btn-icon bell"
        aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) setTimeout(markRead, 1500);
        }}
      >
        <Bell />
        {unread > 0 && <span className="dot" aria-hidden />}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="right" label="Notifications">
        <div className="notes">
          <div className="notes-head">
            <h3>Notifications</h3>
          </div>
          {list.length === 0 ? (
            <p className="notes-empty">Aucune notification pour cet espace.</p>
          ) : (
            <ul>
              {list.slice(0, 10).map((n) => {
                const inner = (
                  <>
                    <span className="note-dot" aria-hidden />
                    <span>
                      <b>{n.title}</b>
                      <p>{n.body}</p>
                      <time dateTime={n.at}>{relTime(n.at)}</time>
                    </span>
                  </>
                );
                const cls = `note note-${n.tone} ${n.read ? "" : "unread"}`;
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link to={n.link} className={cls} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}

export function Shell() {
  const session = useStore((s) => s.session);
  const booting = useStore((s) => s.server.status === "booting");
  const persona = useStore((s) => s.persona);
  const { pathname, search } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, search]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);
  if (booting) return <FullLoader label="Connexion" />;
  if (!session) return <Navigate to="/connexion" replace state={{ from: pathname + search }} />;
  const wide = pathname.includes("/timeline");
  const routeKey = pathname.startsWith("/projet/") ? pathname.split("/").slice(0, 3).join("/") : pathname;
  return (
    <CrumbCtx.Provider value={setCrumbs}>
      <div className="app">
        <aside className={`side ${navOpen ? "open" : ""}`} aria-label="Navigation principale">
          <Brand to="/tableau-de-bord" />
          <SpaceSwitch />
          {persona === "creator" && (
            <Link to="/nouveau" className="btn btn-primary btn-block">
              <Plus />
              Nouveau projet
            </Link>
          )}
          {persona === "creator" ? <CreatorNav /> : <OwnerNav />}
          <div className="side-foot">
            <p className="side-note">
              {BACKEND
                ? "Prototype : comptes réels, paiements gratuits sans argent réel. Les étiquettes Réel, Simulé et Exemple indiquent la nature de chaque donnée."
                : "Prototype : comptes fictifs, paiements et e-mails simulés. Les étiquettes Réel, Simulé et Exemple indiquent la nature de chaque donnée."}
            </p>
            <AccountMenu />
          </div>
        </aside>
        {navOpen && <div className="side-scrim" onClick={() => setNavOpen(false)} aria-hidden />}
        <div className="main">
          <header className="top">
            <button type="button" className="btn btn-ghost btn-icon nav-toggle" aria-label="Ouvrir la navigation" onClick={() => setNavOpen(true)}>
              <Menu />
            </button>
            <nav className="crumbs" aria-label="Fil d’Ariane">
              {crumbs.map((c, i) => (
                <span key={i} className="row" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
                  {i > 0 && <ChevronRight aria-hidden />}
                  {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
                </span>
              ))}
            </nav>
            <div className="top-actions">
              <Notifications />
            </div>
          </header>
          <main className={`content ${wide ? "content-wide" : ""}`} id="contenu">
            {/* Each screen enters on its own; project steps keep the project shell and animate inside it. */}
            <div className="route-view" key={routeKey}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
        <Toasts />
      </div>
    </CrumbCtx.Provider>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
