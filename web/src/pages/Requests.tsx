import { Inbox } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { costOf, fmt, PLANS, type PlanId } from "../core/credits";
import { voiceById } from "../core/catalog";
import { BACKEND } from "../lib/backend";
import { profileOf } from "../mock/registry";
import { accountOf, balanceOf, useStore } from "../state/store";
import { PAYMENT_LABEL, requestStatus, type LicenseRequest, type RequestStatus } from "../state/workflow";
import { Callout, Empty, frDate, PageHead, Prov, Status, Tabs, toast, VoiceMark } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";
import { PayDialog, price, RequestBlock } from "./licensing";

function useMine() {
  const account = useStore(accountOf);
  const projects = useStore((s) => s.projects);
  const requests = useStore((s) => s.requests);
  return requests.filter((r) => projects[r.projectId]?.accountId === account?.id).reverse();
}

/** Écran 08 — the creator's licence requests, with their 72-hour lifetime and payment. */
export default function Requests() {
  useCrumbs([{ label: "Demandes de voix" }]);
  const mine = useMine();
  const projects = useStore((s) => s.projects);
  const [tab, setTab] = useState<"all" | RequestStatus>("all");
  const [paying, setPaying] = useState<LicenseRequest | null>(null);
  const count = (s: RequestStatus) => mine.filter((r) => requestStatus(r) === s).length;
  const rows = mine.filter((r) => tab === "all" || requestStatus(r) === tab);

  return (
    <>
      <PageHead
        title="Demandes de voix"
        lead="Chaque demande porte sur un projet précis. Le titulaire répond depuis un lien sécurisé ; sans réponse sous 72 heures, la demande expire."
        actions={
          <Link to="/bibliotheque" className="btn btn-secondary">
            Bibliothèque de voix
          </Link>
        }
      />
      <Tabs
        label="Statut des demandes"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "Toutes", count: mine.length },
          { value: "envoyee", label: "Envoyées", count: count("envoyee") },
          { value: "acceptee", label: "Acceptées", count: count("acceptee") },
          { value: "refusee", label: "Refusées", count: count("refusee") },
          { value: "expiree", label: "Expirées", count: count("expiree") },
        ]}
      />
      <div style={{ marginTop: 20 }} key={tab} className="tab-panel">
        {rows.length === 0 ? (
          <Empty title="Aucune demande" icon={Inbox} action={<Link to="/bibliotheque" className="btn btn-primary btn-sm">Choisir une voix</Link>}>
            Demandez une licence depuis la bibliothèque ou depuis l’étape « Voix françaises » d’un projet.
          </Empty>
        ) : (
          <div className="card">
            {rows.map((r) => {
              const st = requestStatus(r);
              const prof = profileOf(r.voiceId);
              const replaced = projects[r.projectId]?.speakerVoices[r.characterKey] !== r.voiceId;
              return (
                <div key={r.id} className="req-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr) auto" }}>
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <VoiceMark name={prof?.publicName ?? "?"} kind="licensed" size={32} />
                    <span className="cell-main">
                      <b>{prof?.publicName}</b>
                      <span>
                        {r.projectTitle} · {r.characterName}
                      </span>
                    </span>
                  </span>
                  <RequestBlock r={r} onPay={setPaying} />
                  <span className="row">
                    {(st === "refusee" || st === "expiree") && !replaced && projects[r.projectId] && (
                      <Link to={`/projet/${r.projectId}/voix`} className="btn btn-secondary btn-sm">
                        Choisir une autre voix
                      </Link>
                    )}
                    {replaced && <span className="hint">Voix remplacée</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PayDialog request={paying} onClose={() => setPaying(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ payments */

export function Payments() {
  useCrumbs([{ label: "Paiements" }]);
  const mine = useMine().filter((r) => r.price > 0 && requestStatus(r) === "acceptee");
  const plan = useStore((s) => s.plan);
  const setPlan = useStore((s) => s.setPlan);
  const balance = useStore(balanceOf);
  const usage = useStore((s) => s.usage);
  const account = useStore(accountOf);
  const [tab, setTab] = useState<"licences" | "credits">("licences");
  const [paying, setPaying] = useState<LicenseRequest | null>(null);
  const spentRows = usage.filter((u) => u.creator === account?.name);
  const due = mine.filter((r) => r.payment !== "confirme").reduce((a, r) => a + r.price, 0);
  const paid = mine.filter((r) => r.payment === "confirme").reduce((a, r) => a + r.price, 0);

  return (
    <>
      <PageHead title="Paiements" lead="Licences de voix payées aux titulaires, et crédits de synthèse consommés par la génération." actions={<Prov kind="sim">aucun paiement réel</Prov>} />
      <div className="stats" style={{ marginBottom: 28 }}>
        <div className="stat">
          <span className="stat-label">À régler</span>
          <span className="stat-value">{due} DT</span>
          <span className="stat-sub">licences acceptées, non payées</span>
        </div>
        <div className="stat">
          <span className="stat-label">Payé</span>
          <span className="stat-value">{paid} DT</span>
          <span className="stat-sub">licences confirmées</span>
        </div>
        <div className="stat">
          <span className="stat-label">Crédits restants</span>
          <span className="stat-value">{fmt.format(balance)}</span>
          <span className="stat-sub">jetons de synthèse</span>
        </div>
        <div className="stat">
          <span className="stat-label">Offre</span>
          <span className="stat-value" style={{ fontSize: 28 }}>{PLANS[plan].name}</span>
          <span className="stat-sub">{fmt.format(PLANS[plan].monthly)} jetons par mois</span>
        </div>
      </div>
      <Tabs
        label="Type de paiement"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "licences", label: "Licences de voix", count: mine.length },
          { value: "credits", label: "Crédits de synthèse" },
        ]}
      />
      <div style={{ marginTop: 20 }} key={tab} className="tab-panel">
        {tab === "licences" ? (
          mine.length === 0 ? (
            <Empty title="Aucune licence payante">Les licences acceptées avec un tarif apparaîtront ici. Les licences gratuites ne demandent aucun paiement.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Voix</th>
                    <th>Projet</th>
                    <th>Référence</th>
                    <th className="r">Montant</th>
                    <th>Paiement</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => (
                    <tr key={r.id}>
                      <td>{profileOf(r.voiceId)?.publicName}</td>
                      <td>
                        <span className="cell-main">
                          <b>{r.projectTitle}</b>
                          <span>{r.characterName}</span>
                        </span>
                      </td>
                      <td className="mono">{r.reference ?? "—"}</td>
                      <td className="r num">{price(r.price)}</td>
                      <td>
                        <Status tone={r.payment === "confirme" ? "ok" : r.payment === "echoue" ? "bad" : "warn"}>{PAYMENT_LABEL[r.payment]}</Status>
                        {r.paymentAt && <span className="hint" style={{ display: "block" }}>{frDate(r.paymentAt, true)}</span>}
                      </td>
                      <td className="r">
                        {r.payment !== "confirme" && (
                          <button className="btn btn-primary btn-sm" onClick={() => setPaying(r)}>
                            {r.payment === "echoue" ? "Réessayer" : "Payer"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="stack-lg">
            <Callout tone="plain">
              Une offre donne des jetons chaque mois ; chaque caractère synthétisé coûte un jeton. 70 % des jetons dépensés sur une voix licenciée sont reversés à son titulaire. Exemple : une réplique de 60 caractères coûte {costOf("x".repeat(60))} jetons.
            </Callout>
            <div className="choices choices-3" role="radiogroup" aria-label="Offre">
              {(Object.keys(PLANS) as PlanId[]).map((id) => (
                <label key={id} className="choice">
                  <input type="radio" name="plan" checked={plan === id} onChange={() => (setPlan(id), toast(BACKEND ? `Offre ${PLANS[id].name} : jetons crédités (prototype, 0 DT débité)` : `Offre ${PLANS[id].name} sélectionnée (simulation)`, "ok"))} />
                  <span className="choice-radio" aria-hidden />
                  <b>
                    {PLANS[id].name} · <span className="num">{fmt.format(PLANS[id].monthly)}</span> jetons / mois
                  </b>
                  <span className="choice-text">{PLANS[id].blurb}</span>
                </label>
              ))}
            </div>
            {spentRows.length === 0 ? (
              <Empty title="Aucune synthèse ce mois-ci">Chaque réplique générée apparaîtra ici avec la part versée au titulaire.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Réplique</th>
                      <th>Voix</th>
                      <th className="r">Jetons</th>
                      <th className="r">Au titulaire</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {spentRows.map((u) => (
                      <tr key={u.id}>
                        <td>{frDate(u.at, true)}</td>
                        <td>{u.project}</td>
                        <td>{voiceById(u.voice_id)?.name}</td>
                        <td className="r">{fmt.format(u.cost)}</td>
                        <td className="r">{u.owner ? fmt.format(u.owner) : <span className="muted">voix IA</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <PayDialog request={paying} onClose={() => setPaying(null)} />
    </>
  );
}
