import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { messageOf } from "../api/client";
import { BACKEND, RECOVERY_LINK } from "../lib/backend";
import { supabase } from "../lib/supabase";
import * as remoteSession from "../state/remote/session";
import { useStore } from "../state/store";
import { Brand } from "../ui/brand";
import { Callout, Prov } from "../ui/kit";
import { Motto } from "../ui/Motto";

/**
 * Écran 01 — Authentification.
 * Demo authentication: there is no account server in this prototype. Accounts live in this browser,
 * passwords are only checked for presence and never stored.
 */

function AuthLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = "Connexion · Sawti 360";
  }, []);
  return (
    <div className="auth">
      <div className="auth-panel">
        <Brand to="/" />
        <div className="auth-motto-mobile">
          <Motto compact />
        </div>
        <div className="auth-form">{children}</div>
        {BACKEND ? (
          <p className="hint">
            <Prov kind="real">Supabase Auth</Prov> · comptes et sessions gérés par le serveur d’authentification.
          </p>
        ) : (
          <p className="hint">
            Prototype <Prov kind="sim">authentification locale</Prov> · aucun compte n’est créé sur un serveur.
          </p>
        )}
      </div>
      <aside className="auth-aside" aria-label="Principes de Sawti 360">
        <Motto />
      </aside>
    </div>
  );
}

function Password({ value, onChange, autoComplete, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Mot de passe</label>
      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
        <input id={id} className="input" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={invalid} required />
        <button type="button" className="btn btn-secondary btn-icon" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </div>
  );
}

export function Login() {
  const session = useStore((s) => s.session);
  const accounts = useStore((s) => s.accounts);
  const login = useStore((s) => s.login);
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  if (session) return <Navigate to={state?.from ?? "/tableau-de-bord"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (BACKEND) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
      if (!password) return setError("Saisissez votre mot de passe.");
      setBusy(true);
      try {
        await remoteSession.signIn(useStore.setState, useStore.getState, email, password);
        navigate(state?.from ?? "/tableau-de-bord", { replace: true });
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    const acc = accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!acc) return setError("Aucun compte de démonstration avec cette adresse. Créez un compte ou utilisez un compte ci-dessous.");
    if (!password) return setError("Saisissez votre mot de passe.");
    setBusy(true);
    await new Promise((r) => setTimeout(r, 450));
    login(acc.id);
    navigate(state?.from ?? "/tableau-de-bord", { replace: true });
  };

  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Connexion</h1>
        <p className="muted">Accédez à votre espace créateur ou propriétaire vocal.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={emailId}>Adresse e-mail</label>
          <input id={emailId} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={Boolean(error) && !password ? undefined : Boolean(error)} required />
        </div>
        <Password value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="row-between">
          <span />
          <Link to="/mot-de-passe-oublie" className="link" style={{ fontSize: 13 }}>
            Mot de passe oublié ?
          </Link>
        </div>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Loader2 className="spin" /> : null}
          Se connecter
        </button>
      </form>
      <div className="divider">ou</div>
      <div className="demo-accounts" aria-label="Comptes de démonstration">
        {accounts.slice(0, 2).map((a) => (
          <button
            key={a.id}
            type="button"
            className="demo-account"
            disabled={busy}
            onClick={async () => {
              setError("");
              setBusy(true);
              try {
                await login(a.id);
                navigate(state?.from ?? "/tableau-de-bord", { replace: true });
              } catch (err) {
                setError(messageOf(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="avatar">{a.initials}</span>
            <span className="who">
              <b>{a.name}</b>
              <span>{a.org}</span>
            </span>
            <ArrowRight size={16} color="var(--ink-3)" aria-hidden />
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        Pas encore de compte ?{" "}
        <Link to="/inscription" className="link">
          Créer un compte
        </Link>
      </p>
    </AuthLayout>
  );
}

export function Signup() {
  const session = useStore((s) => s.session);
  const signup = useStore((s) => s.signup);
  const accounts = useStore((s) => s.accounts);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ids = { name: useId(), email: useId() };
  if (session) return <Navigate to="/tableau-de-bord" replace />;
  const weak = password.length > 0 && password.length < 8;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Indiquez votre nom ou celui de votre structure.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
    if (!BACKEND && accounts.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) return setError("Un compte existe déjà avec cette adresse.");
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (!terms) return setError("Acceptez les conditions pour continuer.");
    if (BACKEND) {
      setBusy(true);
      try {
        const result = await signup(name.trim(), email.trim(), password);
        if (result === "confirm") setConfirm(true);
        else navigate("/tableau-de-bord", { replace: true });
      } catch (err) {
        setError(messageOf(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    signup(name.trim(), email.trim());
    navigate("/tableau-de-bord", { replace: true });
  };

  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Créer un compte</h1>
        <p className="muted">Un même compte permet de doubler des vidéos et de proposer sa propre voix.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={ids.name}>Nom ou structure</label>
          <input id={ids.name} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
        </div>
        <div className="field">
          <label htmlFor={ids.email}>Adresse e-mail</label>
          <input id={ids.email} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <Password value={password} onChange={setPassword} autoComplete="new-password" invalid={weak} />
        <p className={`hint ${weak ? "hint-bad" : ""}`}>8 caractères au minimum.</p>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>J’accepte que mes projets et décisions soient inscrits au journal d’audit de la plateforme.</span>
        </label>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
        {confirm && (
          <Callout tone="info" icon={MailCheck} title="Compte créé">
            Ouvrez le lien envoyé à <b>{email.trim()}</b> pour activer le compte, puis connectez-vous.
          </Callout>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Loader2 className="spin" /> : null}
          Créer le compte
        </button>
      </form>
      <p className="muted" style={{ fontSize: 13 }}>
        Déjà inscrit ?{" "}
        <Link to="/connexion" className="link">
          Se connecter
        </Link>
      </p>
    </AuthLayout>
  );
}

/** Back-end mode: arriving from the e-mailed recovery link, the person chooses a new password. */
function NewPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    setBusy(true);
    setError("");
    try {
      await remoteSession.updatePassword(useStore.setState, useStore.getState, password);
      navigate("/tableau-de-bord", { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="stack-sm">
        <h1>Nouveau mot de passe</h1>
        <p className="muted">Choisissez le nouveau mot de passe de votre compte.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <Password value={password} onChange={setPassword} autoComplete="new-password" invalid={password.length > 0 && password.length < 8} />
        <p className="hint">8 caractères au minimum.</p>
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Loader2 className="spin" /> : null}
          Enregistrer le mot de passe
        </button>
      </form>
    </>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(BACKEND && RECOVERY_LINK);
  useEffect(() => {
    if (!BACKEND) return;
    let off: (() => void) | undefined;
    void supabase().then((sb) => {
      const { data } = sb.auth.onAuthStateChange((event) => event === "PASSWORD_RECOVERY" && setRecovery(true));
      off = () => data.subscription.unsubscribe();
    });
    return () => off?.();
  }, []);
  const id = useId();
  if (recovery)
    return (
      <AuthLayout>
        <NewPassword />
      </AuthLayout>
    );
  return (
    <AuthLayout>
      <Link to="/connexion" className="link row" style={{ fontSize: 13, gap: 6 }}>
        <ArrowLeft size={14} aria-hidden />
        Retour à la connexion
      </Link>
      <div className="stack-sm">
        <h1>Mot de passe oublié</h1>
        <p className="muted">Saisissez l’adresse de votre compte. Un lien de réinitialisation valable une heure vous sera envoyé.</p>
      </div>
      {sent ? (
        BACKEND ? (
          <Callout tone="info" icon={MailCheck} title="Demande envoyée">
            Si un compte existe pour <b>{email}</b>, un lien de réinitialisation valable une heure vient de lui être envoyé. Ouvrez-le pour choisir un nouveau mot de passe.
          </Callout>
        ) : (
          <Callout tone="info" icon={MailCheck} title="Demande enregistrée">
            Si un compte existe pour <b>{email}</b>, un lien de réinitialisation lui serait envoyé. <b>Dans ce prototype, aucun e-mail n’est réellement envoyé.</b>
          </Callout>
        )
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
            if (BACKEND) {
              setBusy(true);
              setError("");
              try {
                await remoteSession.sendPasswordReset(email);
                setSent(true);
              } catch (err) {
                setError(messageOf(err));
              } finally {
                setBusy(false);
              }
              return;
            }
            setSent(true);
          }}
        >
          <div className="field">
            <label htmlFor={id}>Adresse e-mail</label>
            <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          {error && (
            <Callout tone="bad" role="alert">
              {error}
            </Callout>
          )}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>
            {busy ? <Loader2 className="spin" /> : null}
            Envoyer le lien
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
