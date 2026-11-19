import { ChevronRight, FileBadge2, FolderPlus, Inbox, Library, Mic, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { profileOf } from "../mock/registry";
import { accountOf, statusOf, useStore, type Project } from "../state/store";
import { DOSSIER_LABEL, hoursLeft, originalVoiceState, requestStatus, REQUEST_LABEL, type LicenseRequest } from "../state/workflow";
import { Empty, PageHead, plural, Progress, relTime, Status } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";
import { ProjectRow } from "./ProjectRow";

type Attn = { key: string; tone: "bad" | "warn" | "info"; title: string; body: string; to: string; cta: string };

function attentionItems(projects: Project[], requests: LicenseRequest[]): Attn[] {
  const out: Attn[] = [];
  for (const p of projects) {
    if (p.pipeline?.status === "running") out.push({ key: `${p.id}-an`, tone: "info", title: `Analyse en cours · ${p.title}`, body: "Détection des intervenants et segmentation.", to: `/projet/${p.id}/analyse`, cta: "Suivre" });
    for (const c of Object.values(p.characters)) {
      const st = originalVoiceState(c);
      if (st === "bloquee" && c.lifeStatus === "decede")
        out.push({ key: `${p.id}-${c.key}`, tone: "bad", title: `${DOSSIER_LABEL[c.dossier!.status]} · ${c.name}`, body: `${p.title} · autorisation familiale non validée, voix originale bloquée.`, to: `/projet/${p.id}/autorisations`, cta: "Traiter" });
      else if (st === "bloquee") out.push({ key: `${p.id}-${c.key}`, tone: "bad", title: `Consentement refusé · ${c.name}`, body: `${p.title} · choisissez une voix de remplacement.`, to: `/projet/${p.id}/autorisations`, cta: "Traiter" });
      else if (st === "en_attente" && c.lifeStatus === "vivant") out.push({ key: `${p.id}-${c.key}`, tone: "warn", title: `Consentement en attente · ${c.name}`, body: `${p.title} · demande envoyée ${relTime(c.living?.sentAt ?? new Date().toISOString())}.`, to: `/projet/${p.id}/autorisations`, cta: "Voir" });
      else if (st === "a_renseigner" || st === "a_obtenir") out.push({ key: `${p.id}-${c.key}`, tone: "warn", title: `Autorisation à compléter · ${c.name}`, body: `${p.title} · statut de vie ou dossier manquant.`, to: `/projet/${p.id}/autorisations`, cta: "Compléter" });
    }
    const toApprove = p.segments.filter((s) => !s.validated).length;
    if (p.pipeline?.status !== "running" && p.generation.status === "idle" && toApprove && p.segments.length)
      out.push({ key: `${p.id}-tr`, tone: "info", title: `${plural(toApprove, "réplique")} à approuver · ${p.title}`, body: "La traduction attend votre validation explicite.", to: `/projet/${p.id}/traduction`, cta: "Réviser" });
  }
  for (const r of requests) {
    const st = requestStatus(r);
    if (st === "acceptee" && r.price > 0 && r.payment !== "confirme")
      out.push({ key: r.id, tone: r.payment === "echoue" ? "bad" : "warn", title: `Paiement à confirmer · ${profileOf(r.voiceId)?.publicName}`, body: `${r.projectTitle} · ${r.price} DT. La voix sera utilisable après paiement.`, to: "/paiements", cta: "Payer" });
    if (st === "refusee" || st === "expiree")
      out.push({ key: r.id, tone: "bad", title: `Demande ${REQUEST_LABEL[st].toLowerCase()} · ${profileOf(r.voiceId)?.publicName}`, body: `${r.projectTitle} · ${r.characterName}. Choisissez une autre voix ou une voix IA.`, to: `/projet/${r.projectId}/voix`, cta: "Choisir" });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export default function Dashboard() {
  useCrumbs([{ label: "Tableau de bord" }]);
  const account = useStore(accountOf);
  const all = useStore((s) => s.projects);
  const order = useStore((s) => s.order);
  const requests = useStore((s) => s.requests);
  const notifications = useStore((s) => s.notifications);
  const owned = useStore((s) => (s.session ? s.ownedVoices[s.session.accountId] : undefined));
  const projects = order.map((id) => all[id]).filter((p) => p && p.accountId === account?.id);
  const statuses = projects.map((p) => statusOf({ requests }, p));
  const mineReq = requests.filter((r) => projects.some((p) => p.id === r.projectId));
  // Only requests still attached to the character's current voice need attention.
  const live = mineReq.filter((r) => all[r.projectId]?.speakerVoices[r.characterKey] === r.voiceId && !all[r.projectId]?.characters[r.characterKey]?.useOriginal);
  const attn = attentionItems(projects, live);
  const incoming = owned ? requests.filter((r) => r.voiceId === owned.voiceId && requestStatus(r) === "envoyee") : [];
  const notes = notifications.filter((n) => n.to === account?.id).slice(0, 5);
  const count = (k: string) => statuses.filter((s) => s === k).length;
  const waiting = count("attente_autorisation");

  return (
    <>
      <PageHead
        title="Tableau de bord"
        lead={
          projects.length === 0
            ? "Importez une première vidéo en derja pour démarrer un doublage."
            : attn.length
              ? `${plural(attn.length, "point demande", "points demandent")} votre attention${waiting ? `, dont ${plural(waiting, "projet")} en attente d’autorisation` : ""}.`
              : "Rien n’attend votre décision pour l’instant."
        }
        actions={
          <Link to="/nouveau" className="btn btn-primary">
            <Plus />
            Nouveau projet
          </Link>
        }
      />

      <div className="stats">
        <Link to="/projets" className="stat">
          <span className="stat-label">Projets</span>
          <span className="stat-value">{projects.length}</span>
          <span className="stat-sub">au total</span>
        </Link>
        <Link to="/projets?vue=en-cours" className="stat">
          <span className="stat-label">En cours</span>
          <span className="stat-value">{projects.length - count("termine")}</span>
          <span className="stat-sub">brouillon, analyse, génération</span>
        </Link>
        <Link to="/projets?vue=en-cours" className="stat">
          <span className="stat-label">En attente d’autorisation</span>
          <span className="stat-value">{waiting}</span>
          <span className="stat-sub">voix originale ou licence</span>
        </Link>
        <Link to="/projets?vue=termines" className="stat">
          <span className="stat-label">Terminés</span>
          <span className="stat-value">{count("termine")}</span>
          <span className="stat-sub">avec Passeport 360°</span>
        </Link>
      </div>

      <div className="dash">
        <div className="dash-col">
          <section className="card" aria-labelledby="attn-h">
            <div className="card-head">
              <h2 id="attn-h">À traiter</h2>
              <span className="card-actions hint num">{attn.length}</span>
            </div>
            {attn.length === 0 ? (
              <div className="card-body">
                <p className="muted">Aucune autorisation, demande ou validation en attente.</p>
              </div>
            ) : (
              <ul className="attn-list">
                {attn.slice(0, 6).map((a) => (
                  <li key={a.key} className={`attn-${a.tone}`}>
                    <span className="attn-mark" aria-hidden />
                    <span>
                      <b>{a.title}</b>
                      <p>{a.body}</p>
                    </span>
                    <Link to={a.to} className="btn btn-secondary btn-sm">
                      {a.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="recent-h">
            <div className="card-head">
              <h2 id="recent-h">Projets récents</h2>
              <Link to="/projets" className="card-actions link" style={{ fontSize: 13 }}>
                Tous les projets
              </Link>
            </div>
            {projects.length === 0 ? (
              <div className="card-body">
                <Empty title="Aucun projet" icon={FolderPlus} action={<Link to="/nouveau" className="btn btn-primary btn-sm">Importer une vidéo</Link>}>
                  Un projet commence par une vidéo : fichier depuis votre ordinateur ou lien direct.
                </Empty>
              </div>
            ) : (
              <div className="plist-projects">
                {projects.slice(0, 4).map((p) => (
                  <ProjectRow key={p.id} p={p} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dash-col">
          <nav className="card quick-list" aria-label="Actions rapides">
            <Link to="/bibliotheque">
              <Library aria-hidden />
              <b>Écouter des voix</b>
              <span>Bibliothèque</span>
              <ChevronRight aria-hidden className="chev" />
            </Link>
            <Link to="/passeports">
              <FileBadge2 aria-hidden />
              <b>Consulter les passeports</b>
              <span>Traçabilité publique</span>
              <ChevronRight aria-hidden className="chev" />
            </Link>
            <Link to="/proprietaire/passeport">
              <Mic aria-hidden />
              <b>{owned ? "Gérer ma voix" : "Proposer ma voix"}</b>
              <span>Passeport de voix</span>
              <ChevronRight aria-hidden className="chev" />
            </Link>
          </nav>

          <section className="card" aria-labelledby="req-h">
            <div className="card-head">
              <h2 id="req-h">Demandes de voix</h2>
              <Link to="/demandes" className="card-actions link" style={{ fontSize: 13 }}>
                Toutes
              </Link>
            </div>
            {mineReq.length === 0 ? (
              <div className="card-body">
                <p className="muted">Aucune demande envoyée. Choisissez une voix dans la bibliothèque.</p>
              </div>
            ) : (
              <ul className="attn-list">
                {[...mineReq].reverse().slice(0, 4).map((r) => {
                  const st = requestStatus(r);
                  return (
                    <li key={r.id}>
                      <span className="attn-mark" aria-hidden style={{ background: "transparent" }} />
                      <span>
                        <b>
                          {profileOf(r.voiceId)?.publicName} · {r.characterName}
                        </b>
                        <p>{r.projectTitle}</p>
                        {st === "envoyee" && (
                          <span className="countdown" style={{ marginTop: 6 }}>
                            <Progress value={hoursLeft(r) / 72} label="Temps restant avant expiration" />
                            <span className="hint num">Expire dans {Math.ceil(hoursLeft(r))} h</span>
                          </span>
                        )}
                      </span>
                      <Status tone={st === "acceptee" ? "ok" : st === "envoyee" ? "info" : "bad"}>{REQUEST_LABEL[st]}</Status>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {owned && (
            <section className="card" aria-labelledby="in-h">
              <div className="card-head">
                <Inbox size={16} aria-hidden />
                <h2 id="in-h">Demandes reçues pour votre voix</h2>
              </div>
              <div className="card-body stack-sm">
                <p className="muted">{incoming.length ? `${plural(incoming.length, "demande attend", "demandes attendent")} votre réponse.` : "Aucune demande en attente."}</p>
                <Link to="/proprietaire/demandes" className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }}>
                  Ouvrir l’espace propriétaire
                </Link>
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="notif-h">
            <div className="card-head">
              <h2 id="notif-h">Notifications récentes</h2>
            </div>
            {notes.length === 0 ? (
              <div className="card-body">
                <p className="muted">Aucune notification.</p>
              </div>
            ) : (
              <ul>
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link to={n.link ?? "/tableau-de-bord"} className={`note note-${n.tone}`}>
                      <span className="note-dot" aria-hidden />
                      <span>
                        <b>{n.title}</b>
                        <p>{n.body}</p>
                        <time dateTime={n.at}>{relTime(n.at)}</time>
                      </span>
                    </Link>
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
