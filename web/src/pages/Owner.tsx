import { CircleSlash, Inbox, Mic, RotateCcw, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { USES } from "../core/catalog";
import { fmt, OWNER_SHARE } from "../core/credits";
import { RED_LINES, THEMES } from "../core/safety";
import type { Theme, Use } from "../core/types";
import { paragraphFor, type VoiceProfile } from "../mock/registry";
import { accountOf, earningsOf, sampleUrls, useStore } from "../state/store";
import { EXPIRY_HOURS, hoursLeft, PAYMENT_LABEL, requestStatus, REQUEST_LABEL, type LicenseRequest } from "../state/workflow";
import { AudioClip, Callout, Dialog, Empty, frDate, Hash, KV, LicenseStatus, PageHead, Progress, Prov, relTime, Status, Tabs, toast, VoiceMark } from "../ui/kit";
import { AnimatedStepper, Step } from "../ui/AnimatedStepper";
import { Recorder, type Recording } from "../ui/Recorder";
import { useCrumbs } from "../ui/Shell";
import { price, REQ_TONE, SamplePlayer } from "./licensing";

function useOwned() {
  return useStore((s) => (s.session ? s.ownedVoices[s.session.accountId] : undefined));
}

const LANGS = ["Français", "Arabe", "Derja tunisienne", "Anglais"];

/* ------------------------------------------------------------------ profile form (shared) */

function ProfileForm({ value, onChange }: { value: Omit<VoiceProfile, "voiceId" | "accountId">; onChange: (v: Omit<VoiceProfile, "voiceId" | "accountId">) => void }) {
  const ids = { name: useId(), desc: useId(), cond: useId(), price: useId() };
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="stack">
      <div className="field-row">
        <div className="field">
          <label htmlFor={ids.name}>Nom ou pseudonyme public</label>
          <input id={ids.name} className="input" value={value.publicName} onChange={(e) => set("publicName", e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Type de nom</span>
          <label className="check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={value.pseudonym} onChange={(e) => set("pseudonym", e.target.checked)} />
            C’est un pseudonyme
          </label>
        </div>
      </div>
      <div className="field">
        <label htmlFor={ids.desc}>Description</label>
        <textarea id={ids.desc} className="textarea" rows={3} value={value.description} onChange={(e) => set("description", e.target.value)} placeholder="Votre voix, votre registre, vos expériences." maxLength={400} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          Langues
        </legend>
        <div className="row">
          {LANGS.map((l) => (
            <label key={l} className="check" style={{ marginRight: 12 }}>
              <input type="checkbox" checked={value.languages.includes(l)} onChange={() => set("languages", value.languages.includes(l) ? value.languages.filter((x) => x !== l) : [...value.languages, l])} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field-row">
        <div className="field">
          <label htmlFor={ids.price}>Tarif par projet (DT)</label>
          <input id={ids.price} className="input num" type="number" min={0} step={10} value={value.price} onChange={(e) => set("price", Math.max(0, Number(e.target.value) || 0))} />
          <span className="hint">0 pour une licence gratuite. Le cadre tarifaire fixé par Sawti reste à formaliser.</span>
        </div>
        <div className="field">
          <span className="label">Disponibilité</span>
          <div className="row" style={{ marginTop: 6, gap: 10 }}>
            <span className="switch">
              <input type="checkbox" role="switch" aria-label="Disponible pour de nouvelles demandes" checked={value.availability === "disponible"} onChange={(e) => set("availability", e.target.checked ? "disponible" : "indisponible")} />
            </span>
            <span style={{ fontSize: 13 }}>{value.availability === "disponible" ? "Disponible pour de nouvelles demandes" : "Indisponible"}</span>
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor={ids.cond}>Conditions de licence</label>
        <textarea id={ids.cond} className="textarea" rows={2} value={value.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="Ex. pas de publicité, crédit au générique." />
        <span className="hint">La licence est toujours permanente pour un projet précis et ne couvre pas d’autres projets.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ creation wizard (Écrans 14–16) */

function CreatePassport() {
  const account = useStore(accountOf);
  const create = useStore((s) => s.createOwnVoice);
  const navigate = useNavigate();
  const [agree, setAgree] = useState(false);
  const [rec, setRec] = useState<Recording | null>(null);
  const [profile, setProfile] = useState<Omit<VoiceProfile, "voiceId" | "accountId">>({
    publicName: account?.name ?? "",
    pseudonym: false,
    languages: ["Français"],
    description: "",
    price: 0,
    conditions: "",
    availability: "disponible",
    sampleText: "",
    tags: [],
  });
  const para = paragraphFor(account?.id ?? "x");
  const checks = rec
    ? [
        { ok: rec.duration >= 8, label: "Durée suffisante", detail: `${rec.duration.toFixed(1).replace(".", ",")} s enregistrées (8 s au minimum)` },
        { ok: rec.peak > 0.05, label: "Voix audible", detail: `Niveau maximal ${Math.round(rec.peak * 100)} %` },
        { ok: rec.peak < 0.99, label: "Pas de saturation", detail: rec.peak < 0.99 ? "Aucun écrêtage détecté" : "Le signal sature : éloignez-vous du micro" },
      ]
    : [];
  const qualityOk = checks.length > 0 && checks.every((c) => c.ok);
  const profileOk = Boolean(profile.publicName.trim()) && profile.languages.length > 0;

  const publish = () => {
    if (!rec || !account) return;
    create({ ...profile, sampleText: para.slice(0, 80) }, { duration: rec.duration, peak: rec.peak, rms: rec.rms, recordedAt: new Date().toISOString() });
    sampleUrls.set(`v_user_${account.id}`, rec.url);
    toast("Passeport de voix créé et publié", "ok");
    navigate("/proprietaire");
  };

  return (
    <AnimatedStepper width={720} completeButtonText="Créer et publier" onFinalStepCompleted={publish}>
      <Step title="Votre voix, vos règles" label="Principes" canContinue={agree} hint="Cochez la case pour commencer.">
        <p>Le Passeport de voix vous permet de proposer votre voix sous licence. Vous restez maître de chaque utilisation.</p>
        <KV
          rows={[
            ["Une seule voix par compte", "Vous pouvez utiliser votre nom ou un pseudonyme public."],
            ["Chaque projet est une demande", "Vous acceptez ou refusez depuis un lien sécurisé ; sans réponse, la demande expire après 72 heures."],
            ["Licence par projet", "Permanente pour le projet accepté, elle ne couvre aucun autre projet."],
            ["Pas de pièce d’identité", "Le parcours standard ne demande aucune preuve d’identité personnelle."],
            ["Créé par vous seul·e", "Personne ne peut créer ce passeport à votre place."],
          ]}
        />
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Je crée ce Passeport de voix pour ma propre voix.</span>
        </label>
      </Step>

      <Step title="Lisez ce paragraphe à voix haute" label="Enregistrement" canContinue={Boolean(rec)} hint="Enregistrez votre lecture pour continuer.">
        <p>Sawti a généré ce texte pour vous. Il sert à vérifier la correspondance et la qualité de votre voix.</p>
        <p className="read-para">{para}</p>
        {rec ? (
          <div className="recorder">
            <AudioClip url={rec.url} label="votre enregistrement" />
            <div className="row-between">
              <span className="hint">Enregistrement prêt. Écoutez-le avant de continuer.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRec(null)}>
                <RotateCcw />
                Recommencer
              </button>
            </div>
          </div>
        ) : (
          <Recorder onDone={setRec} allowImport={false} />
        )}
      </Step>

      <Step title="Vérification" label="Vérification" canContinue={qualityOk} hint="L’enregistrement doit passer les trois contrôles : revenez à l’étape précédente pour réenregistrer.">
        <p>Mesures calculées sur votre enregistrement, dans votre navigateur.</p>
        {rec && (
          <>
            <div className="metrics">
              <div>
                <b>{rec.duration.toFixed(1).replace(".", ",")} s</b>
                <span>Durée</span>
              </div>
              <div>
                <b>{Math.round(rec.peak * 100)} %</b>
                <span>Niveau maximal</span>
              </div>
              <div>
                <b>{Math.round(rec.rms * 1000) / 10} %</b>
                <span>Niveau moyen (RMS)</span>
              </div>
            </div>
            <ul className="ready-list">
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? "ok" : "no"}>
                  {c.ok ? <ShieldCheck aria-hidden /> : <CircleSlash aria-hidden />}
                  <span>
                    <b>{c.label}</b>
                    <span>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Callout tone="plain">
          Mesures de durée et de niveau <Prov kind="real" />. La comparaison avec le texte lu (correspondance) est <Prov kind="sim" /> dans ce prototype.
        </Callout>
      </Step>

      <Step title="Votre profil public" label="Profil public" canContinue={profileOk} hint="Indiquez un nom et au moins une langue.">
        <p>Ce que les créateurs verront dans la bibliothèque. Vous pourrez le modifier à tout moment.</p>
        <ProfileForm value={profile} onChange={setProfile} />
      </Step>
    </AnimatedStepper>
  );
}

/* ------------------------------------------------------------------ incoming request row */

function IncomingRow({ r }: { r: LicenseRequest }) {
  const respond = useStore((s) => s.respondLicense);
  const [confirm, setConfirm] = useState<"accept" | "refuse" | null>(null);
  const st = requestStatus(r);
  return (
    <div className="req-row" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) auto" }}>
      <span className="cell-main">
        <b>
          {r.creator} · {r.projectTitle}
        </b>
        <span>
          Personnage : {r.characterName} · reçue {relTime(r.sentAt)}
        </span>
        {r.message && <span style={{ color: "var(--ink-2)", marginTop: 4 }}>« {r.message} »</span>}
      </span>
      <span className="stack-sm">
        <span className="row">
          <Status tone={REQ_TONE[st]}>{REQUEST_LABEL[st]}</Status>
          <span className="price">{price(r.price)}</span>
          {st === "acceptee" && r.price > 0 && <Status tone={r.payment === "confirme" ? "ok" : "warn"}>Paiement {PAYMENT_LABEL[r.payment].toLowerCase()}</Status>}
        </span>
        {st === "envoyee" && (
          <span className="countdown">
            <Progress value={hoursLeft(r) / EXPIRY_HOURS} label="Temps restant" />
            <span className="hint num">Expire dans {Math.ceil(hoursLeft(r))} h</span>
          </span>
        )}
      </span>
      <span className="row">
        {st === "envoyee" && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirm("refuse")}>
              Refuser
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setConfirm("accept")}>
              Accepter
            </button>
          </>
        )}
      </span>
      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === "accept" ? "Accepter cette demande ?" : "Refuser cette demande ?"}
        description={confirm === "accept" ? `Votre voix pourra être utilisée pour « ${r.projectTitle} » uniquement, de façon permanente.${r.price ? ` Le créateur devra payer ${price(r.price)} avant de l’utiliser.` : ""}` : "Le créateur sera prévenu et pourra choisir une autre voix."}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>
              Annuler
            </button>
            <button
              className={confirm === "accept" ? "btn btn-primary" : "btn btn-danger-solid"}
              onClick={() => {
                respond(r.token, confirm === "accept");
                toast(confirm === "accept" ? "Demande acceptée" : "Demande refusée", confirm === "accept" ? "ok" : "plain");
                setConfirm(null);
              }}
            >
              {confirm === "accept" ? "Accepter" : "Refuser"}
            </button>
          </>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ pages */

export function OwnerHome() {
  useCrumbs([{ label: "Espace propriétaire vocal" }]);
  const owned = useOwned();
  const requests = useStore((s) => s.requests);
  const usage = useStore((s) => s.usage);
  const account = useStore(accountOf);
  const notes = useStore((s) => s.notifications).filter((n) => n.to === account?.id && n.space === "owner").slice(0, 5);
  if (!owned) {
    return (
      <>
        <PageHead title="Proposez votre voix" lead="Créez votre Passeport de voix : enregistrez un paragraphe, publiez votre profil, puis répondez aux demandes des créateurs, projet par projet." />
        <div className="two-col">
          <div className="card">
            <div className="card-body stack">
              <ol className="auth-principles" style={{ borderTopColor: "var(--ink)" }}>
                <li>
                  <div>
                    <b>Enregistrez un paragraphe</b>
                    <p>Sawti génère un texte ; votre lecture sert à vérifier la qualité de votre voix.</p>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Publiez votre profil</b>
                    <p>Nom ou pseudonyme, échantillon, langues, conditions et tarif.</p>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Répondez aux demandes</b>
                    <p>Acceptez ou refusez chaque projet. Sans votre accord, rien n’est généré.</p>
                  </div>
                </li>
              </ol>
              <Link to="/proprietaire/passeport" className="btn btn-primary" style={{ justifySelf: "start" }}>
                <Mic />
                Créer mon Passeport de voix
              </Link>
            </div>
          </div>
          <Callout tone="plain" title="Pas de pièce d’identité">
            Le parcours standard ne demande aucune preuve d’identité personnelle. Un compte ne peut proposer qu’une seule voix.
          </Callout>
        </div>
      </>
    );
  }
  const mine = requests.filter((r) => r.voiceId === owned.voiceId);
  const pending = mine.filter((r) => requestStatus(r) === "envoyee");
  const granted = mine.filter((r) => requestStatus(r) === "acceptee").length;
  const paid = mine.filter((r) => r.payment === "confirme").reduce((a, r) => a + r.price, 0);
  return (
    <>
      <PageHead
        title="Vue d’ensemble"
        lead={`${owned.profile.publicName} · Passeport de voix créé le ${frDate(owned.createdAt)}`}
        actions={
          <Link to="/proprietaire/profil" className="btn btn-secondary">
            Modifier le profil
          </Link>
        }
      />
      <div className="stats">
        <Link to="/proprietaire/demandes" className="stat">
          <span className="stat-label">Demandes en attente</span>
          <span className="stat-value">{pending.length}</span>
          <span className="stat-sub">réponse sous 72 h</span>
        </Link>
        <div className="stat">
          <span className="stat-label">Licences accordées</span>
          <span className="stat-value">{granted}</span>
          <span className="stat-sub">un projet chacune</span>
        </div>
        <Link to="/proprietaire/revenus" className="stat">
          <span className="stat-label">Licences payées</span>
          <span className="stat-value">{paid} DT</span>
          <span className="stat-sub">paiements simulés</span>
        </Link>
        <Link to="/proprietaire/revenus" className="stat">
          <span className="stat-label">Part sur la synthèse</span>
          <span className="stat-value">{fmt.format(earningsOf({ usage }, owned.voiceId))}</span>
          <span className="stat-sub">jetons, {Math.round(OWNER_SHARE * 100)} % reversés</span>
        </Link>
      </div>
      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Demandes à traiter</h2>
            <Link to="/proprietaire/demandes" className="card-actions link" style={{ fontSize: 13 }}>
              Toutes
            </Link>
          </div>
          {pending.length === 0 ? (
            <div className="card-body">
              <p className="muted">Aucune demande en attente.</p>
            </div>
          ) : (
            pending.map((r) => <IncomingRow key={r.id} r={r} />)
          )}
        </section>
        <div className="dash-col">
          <section className="card">
            <div className="card-head">
              <VoiceMark name={owned.profile.publicName} kind="licensed" size={28} />
              <h2>Profil public</h2>
              <span className="card-actions">
                <Status tone={owned.profile.availability === "disponible" ? "ok" : "muted"}>{owned.profile.availability === "disponible" ? "Disponible" : "Indisponible"}</Status>
              </span>
            </div>
            <div className="card-body stack">
              <p style={{ fontSize: 13 }}>{owned.profile.description || "Sans description."}</p>
              <SamplePlayer profile={owned.profile} />
              <KV rows={[["Tarif", price(owned.profile.price)], ["Langues", owned.profile.languages.join(", ")]]} />
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Activité</h2>
            </div>
            {notes.length === 0 ? (
              <div className="card-body">
                <p className="muted">Aucune activité récente.</p>
              </div>
            ) : (
              <ul>
                {notes.map((n) => (
                  <li key={n.id} className={`note note-${n.tone}`}>
                    <span className="note-dot" aria-hidden />
                    <span>
                      <b>{n.title}</b>
                      <p>{n.body}</p>
                      <time>{relTime(n.at)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export function MyVoicePassport() {
  const owned = useOwned();
  const lic = useStore((s) => (owned ? s.licenses.find((l) => l.voice_id === owned.voiceId) : undefined));
  useCrumbs([{ label: "Espace propriétaire vocal", to: "/proprietaire" }, { label: owned ? "Mon Passeport de voix" : "Créer mon Passeport de voix" }]);
  if (!owned)
    return (
      <>
        <PageHead title="Créer mon Passeport de voix" />
        <CreatePassport />
      </>
    );
  return (
    <>
      <PageHead
        title="Mon Passeport de voix"
        lead="Le document qui encadre chaque utilisation de votre voix."
        actions={
          <>
            <Link to="/proprietaire/profil" className="btn btn-secondary">
              Profil et tarif
            </Link>
            <Link to="/proprietaire/regles" className="btn btn-secondary">
              Règles et consentement
            </Link>
          </>
        }
      />
      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <VoiceMark name={owned.profile.publicName} kind="licensed" size={32} />
            <h2>{owned.profile.publicName}</h2>
            <span className="card-actions">{lic ? <LicenseStatus lic={lic} /> : <Status tone="ok">Publié</Status>}</span>
          </div>
          <div className="card-body-tight">
            <KV
              rows={[
                ["Identifiant de voix", <span className="mono">{owned.voiceId}</span>],
                ["Créé le", frDate(owned.createdAt)],
                ["Échantillon", owned.sample ? `${owned.sample.duration.toFixed(1).replace(".", ",")} s, enregistré le ${frDate(owned.sample.recordedAt)}` : "—"],
                ["Preuve d’identité", "Non demandée (parcours standard)"],
                ...(lic
                  ? ([
                      ["Licence signée", <span className="mono">{lic.license_id}</span>],
                      ["Usages autorisés", lic.allowed_uses.map((u) => USES[u]).join(", ")],
                      ["Thèmes refusés", lic.forbidden_themes.map((t) => THEMES[t].label).join(", ") || "aucun"],
                      ["Signature Ed25519", <Hash value={lic.signature} n={14} />],
                    ] as [string, React.ReactNode][])
                  : ([["Synthèse", "Votre voix apparaît dans la bibliothèque ; sa synthèse sera branchée avec le service de clonage autorisé."]] as [string, React.ReactNode][])),
              ]}
            />
          </div>
        </div>
        <div className="sticky-aside">
          <div className="card">
            <div className="card-body stack-sm">
              <span className="label-sm">Échantillon public</span>
              <SamplePlayer profile={owned.profile} />
            </div>
          </div>
          <Callout tone="plain">Chaque demande vous est envoyée par e-mail avec un lien sécurisé, et apparaît dans « Demandes reçues ».</Callout>
        </div>
      </div>
    </>
  );
}

export function OwnerRequests() {
  useCrumbs([{ label: "Espace propriétaire vocal", to: "/proprietaire" }, { label: "Demandes reçues" }]);
  const owned = useOwned();
  const requests = useStore((s) => s.requests);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  if (!owned)
    return (
      <>
        <PageHead title="Demandes reçues" />
        <Empty title="Pas encore de Passeport de voix" icon={Inbox} action={<Link to="/proprietaire/passeport" className="btn btn-primary btn-sm">Créer mon Passeport de voix</Link>}>
          Les demandes de licence arrivent ici une fois votre voix publiée.
        </Empty>
      </>
    );
  const mine = requests.filter((r) => r.voiceId === owned.voiceId).reverse();
  const pending = mine.filter((r) => requestStatus(r) === "envoyee");
  const rows = tab === "pending" ? pending : mine;
  return (
    <>
      <PageHead title="Demandes reçues" lead="Acceptez ou refusez chaque demande. Une demande sans réponse expire après 72 heures." />
      <Tabs
        label="Filtrer"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pending", label: "En attente", count: pending.length },
          { value: "all", label: "Toutes", count: mine.length },
        ]}
      />
      <div className="card tab-panel" key={tab} style={{ marginTop: 20 }}>
        {rows.length === 0 ? (
          <div className="card-body">
            <p className="muted">{tab === "pending" ? "Aucune demande en attente." : "Aucune demande reçue."}</p>
          </div>
        ) : (
          rows.map((r) => <IncomingRow key={r.id} r={r} />)
        )}
      </div>
    </>
  );
}

export function OwnerProfile() {
  useCrumbs([{ label: "Espace propriétaire vocal", to: "/proprietaire" }, { label: "Profil public et tarif" }]);
  const owned = useOwned();
  const update = useStore((s) => s.updateProfile);
  const [draft, setDraft] = useState(owned?.profile);
  if (!owned || !draft)
    return (
      <>
        <PageHead title="Profil public et tarif" />
        <Empty title="Pas encore de Passeport de voix" action={<Link to="/proprietaire/passeport" className="btn btn-primary btn-sm">Créer mon Passeport de voix</Link>} />
      </>
    );
  const dirty = JSON.stringify(draft) !== JSON.stringify(owned.profile);
  return (
    <>
      <PageHead title="Profil public et tarif" lead="Ce que voient les créateurs dans la bibliothèque." />
      <div className="two-col">
        <div className="card">
          <div className="card-body">
            <ProfileForm value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />
          </div>
          <div className="card-foot">
            <button className="btn btn-ghost" disabled={!dirty} onClick={() => setDraft(owned.profile)}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              disabled={!dirty || !draft.publicName.trim()}
              onClick={() => {
                update(draft);
                toast("Profil public enregistré", "ok");
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
        <aside className="sticky-aside">
          <span className="label-sm">Aperçu dans la bibliothèque</span>
          <article className="vcard">
            <div className="vcard-head">
              <VoiceMark name={draft.publicName || "?"} kind="licensed" size={40} />
              <span className="cell-main grow">
                <b>{draft.publicName || "Sans nom"}</b>
                <span>{draft.pseudonym ? "Pseudonyme" : "Nom public"}</span>
              </span>
              <Status tone={draft.availability === "disponible" ? "ok" : "muted"}>{draft.availability === "disponible" ? "Disponible" : "Indisponible"}</Status>
            </div>
            <p className="vcard-desc">{draft.description || "Sans description."}</p>
            <dl className="vcard-facts">
              <div>
                <dt>Langues</dt>
                <dd>{draft.languages.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Tarif par projet</dt>
                <dd className="price">{price(draft.price)}</dd>
              </div>
            </dl>
          </article>
        </aside>
      </div>
    </>
  );
}

const OFFERABLE: Use[] = ["doublage_film", "doublage_video_en_ligne", "bande_annonce", "publicite"];

export function OwnerRules() {
  useCrumbs([{ label: "Espace propriétaire vocal", to: "/proprietaire" }, { label: "Règles et consentement" }]);
  const owned = useOwned();
  const lic = useStore((s) => (owned ? s.licenses.find((l) => l.voice_id === owned.voiceId) : undefined));
  const update = useStore((s) => s.updateOwnLicense);
  const revoke = useStore((s) => s.revoke);
  const reinstate = useStore((s) => s.reinstate);
  const [uses, setUses] = useState<Use[]>(lic?.allowed_uses ?? []);
  const [themes, setThemes] = useState<Theme[]>(lic?.forbidden_themes ?? []);
  const [confirm, setConfirm] = useState(false);
  if (!owned || !lic) {
    return (
      <>
        <PageHead title="Règles et consentement" />
        <Callout tone="plain" title={owned ? "Règles signées à venir pour votre voix" : "Pas encore de Passeport de voix"}>
          {owned ? "Les usages autorisés et les thèmes refusés sont signés dans une licence quand la synthèse de votre voix est branchée. Dans ce prototype, c’est le cas du profil de démonstration Lina M." : "Créez d’abord votre Passeport de voix."}
        </Callout>
      </>
    );
  }
  const revoked = lic.status === "revoked";
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const dirty = uses.join() !== lic.allowed_uses.join() || [...themes].sort().join() !== [...lic.forbidden_themes].sort().join();
  return (
    <>
      <PageHead title="Règles et consentement" lead={`Licence ${lic.license_id} · valide du ${frDate(lic.valid_from)} au ${frDate(lic.valid_until)}`} actions={<LicenseStatus lic={lic} />} />
      <div className="owner-grid">
        <div className="stack-lg">
          <section className="card">
            <div className="card-head">
              <h2>Ce que ma voix peut faire</h2>
            </div>
            <div className="card-body-tight">
              {OFFERABLE.map((u) => (
                <div key={u} className="opt-row">
                  <span className="cell-main">
                    <b>{USES[u]}</b>
                    <span>{u === "publicite" ? "Désactivé par défaut : votre voix ne vend rien sans votre accord." : "Les créateurs vous demandent une licence par projet."}</span>
                  </span>
                  <span className="switch">
                    <input type="checkbox" role="switch" checked={uses.includes(u)} onChange={() => setUses(toggle(uses, u))} aria-label={USES[u]} disabled={revoked} />
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Ce que ma voix ne dira jamais</h2>
            </div>
            <div className="card-body stack">
              <div className="theme-grid">
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <label key={t} className="choice">
                    <input type="checkbox" checked={themes.includes(t)} onChange={() => setThemes(toggle(themes, t))} disabled={revoked} />
                    <span className="choice-radio" aria-hidden style={{ borderRadius: 3 }} />
                    <b>{THEMES[t].label}</b>
                    <span className="choice-text">{THEMES[t].hint}</span>
                  </label>
                ))}
              </div>
              <Callout tone="plain">
                <b>Toujours refusé, pour toutes les voix :</b> {Object.values(RED_LINES).map((r) => r.label.toLowerCase()).join(", ")}.
              </Callout>
            </div>
            <div className="card-foot">
              <span className="hint grow">
                Signature actuelle <Hash value={lic.signature} n={10} />. Chaque modification est signée à nouveau et inscrite au journal.
              </span>
              <button className="btn btn-primary" disabled={!dirty || revoked} onClick={() => (update({ allowed_uses: OFFERABLE.filter((u) => uses.includes(u)), forbidden_themes: themes }), toast("Règles signées à nouveau", "ok"))}>
                Enregistrer et signer
              </button>
            </div>
          </section>
        </div>
        <aside className="sticky-aside">
          <section className="card" style={{ borderColor: "var(--bad-line)" }}>
            <div className="card-head">
              <h3>Retirer mon consentement</h3>
            </div>
            <div className="card-body stack">
              {revoked ? (
                <>
                  <p style={{ fontSize: 13 }}>Licence révoquée le {frDate(lic.revoked_at!, true)}. Toute nouvelle génération avec votre voix est refusée, y compris par le serveur.</p>
                  <button className="btn btn-secondary" onClick={() => (reinstate(lic.license_id), toast("Licence rétablie et signée à nouveau", "ok"))}>
                    <RotateCcw />
                    Rétablir ma licence
                  </button>
                </>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Vous pouvez révoquer à tout moment, sans justification. L’audio déjà livré ne peut pas être retiré, et les Passeports 360° le mentionnent.
                  </p>
                  <button className="btn btn-danger" onClick={() => setConfirm(true)}>
                    Révoquer ma licence…
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Révoquer votre licence ?"
        description="Les générations futures seront refusées immédiatement. L’audio déjà livré aux créateurs ne peut pas être retiré."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button className="btn btn-danger-solid" onClick={() => (revoke(lic.license_id), setConfirm(false), toast("Licence révoquée", "bad"))}>
              <CircleSlash />
              Révoquer
            </button>
          </>
        }
      />
    </>
  );
}

export function OwnerEarnings() {
  useCrumbs([{ label: "Espace propriétaire vocal", to: "/proprietaire" }, { label: "Revenus" }]);
  const owned = useOwned();
  const usage = useStore((s) => s.usage);
  const requests = useStore((s) => s.requests);
  if (!owned) return <Empty title="Pas encore de Passeport de voix" />;
  const rows = usage.filter((u) => u.voice_id === owned.voiceId);
  const lic = requests.filter((r) => r.voiceId === owned.voiceId && r.price > 0 && requestStatus(r) === "acceptee");
  return (
    <>
      <PageHead title="Revenus" lead={`Licences payées par projet, et ${Math.round(OWNER_SHARE * 100)} % des jetons dépensés sur votre voix.`} actions={<Prov kind="sim">paiements simulés</Prov>} />
      <div className="section-head">
        <h2>Licences de projet</h2>
      </div>
      {lic.length === 0 ? (
        <Empty title="Aucune licence payante" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Projet</th>
                <th>Créateur</th>
                <th className="r">Montant</th>
                <th>Paiement</th>
              </tr>
            </thead>
            <tbody>
              {lic.map((r) => (
                <tr key={r.id}>
                  <td>{r.projectTitle}</td>
                  <td>{r.creator}</td>
                  <td className="r num">{price(r.price)}</td>
                  <td>
                    <Status tone={r.payment === "confirme" ? "ok" : "warn"}>{PAYMENT_LABEL[r.payment]}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="section-head section">
        <h2>Part sur la synthèse</h2>
      </div>
      {rows.length === 0 ? (
        <Empty title="Pas encore d’utilisation">Dès qu’un créateur génère une réplique avec votre voix, la ligne apparaît ici.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Œuvre</th>
                <th>Créateur</th>
                <th className="r">Caractères</th>
                <th className="r">Votre part</th>
              </tr>
            </thead>
            <tbody className="num">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>{frDate(u.at, true)}</td>
                  <td>{u.project}</td>
                  <td>{u.creator}</td>
                  <td className="r">{fmt.format(u.chars)}</td>
                  <td className="r">
                    <b>+{fmt.format(u.owner)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
