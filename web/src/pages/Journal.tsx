import { Check, CircleCheck, CircleX, FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { verifyChain } from "../core/audit";
import { shortHash } from "../core/canonical";
import { voiceById } from "../core/catalog";
import { fmt, PLANS, type PlanId } from "../core/credits";
import type { AuditEntry } from "../core/types";
import { balanceOf, CREATOR, useStore } from "../state/store";
import { frDate, toast } from "../ui/kit";

const ACTIONS: Record<string, string> = {
  LICENCE_SIGNEE: "Licence signée",
  LICENCE_REVOQUEE: "Licence révoquée",
  LICENCE_RETABLIE: "Licence rétablie",
  PASSEPORT_MIS_A_JOUR: "Passeport de voix modifié",
  TEXTE_VALIDE: "Texte validé",
  VALIDATION_RETIREE: "Validation retirée",
  GENERATION_AUTORISEE: "Génération autorisée",
  GENERATION_REFUSEE: "Génération refusée",
  PASSEPORT_EXPORTE: "Passeport 360° signé",
  VIDEO_IMPORTEE: "Vidéo importée",
  EXPORT: "Export",
};

function decisionChip(e: AuditEntry) {
  if (!e.decision) return <span className="muted">·</span>;
  const red = e.action === "GENERATION_REFUSEE" || e.decision === "REVOQUEE";
  return <span className={`mono code ${red ? "code-red" : ""}`}>{e.decision}</span>;
}

export default function Journal() {
  const journal = useStore((s) => s.journal);
  const usage = useStore((s) => s.usage);
  const [tab, setTab] = useState<"journal" | "energie">("journal");
  const [tampered, setTampered] = useState<AuditEntry[] | null>(null);
  const [check, setCheck] = useState<ReturnType<typeof verifyChain> | null>(null);
  const shown = tampered ?? journal;
  const target = Math.max(0, journal.findIndex((e) => e.action === "GENERATION_REFUSEE") === -1 ? Math.floor(journal.length / 2) : journal.findIndex((e) => e.action === "GENERATION_REFUSEE"));

  const tamper = () => {
    setTampered(journal.map((e, i) => (i === target ? { ...e, decision: "OK", action: e.action === "GENERATION_REFUSEE" ? "GENERATION_AUTORISEE" : e.action } : e)));
    setCheck(null);
    toast(`Entrée ${target} modifiée en mémoire : vérifiez la chaîne`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Journal d’audit</h1>
          <p className="lead">Chaque décision est inscrite ici. Chaque entrée contient l’empreinte de la précédente : modifier le passé casse la chaîne, et cela se voit.</p>
        </div>
        <div className="actions">
          <div className="seg-ctrl" role="tablist" aria-label="Vue">
            <button role="tab" aria-selected={tab === "journal"} aria-pressed={tab === "journal"} onClick={() => setTab("journal")}>
              Journal
            </button>
            <button role="tab" aria-selected={tab === "energie"} aria-pressed={tab === "energie"} onClick={() => setTab("energie")}>
              Énergie et mesures
            </button>
          </div>
        </div>
      </div>

      {tab === "journal" ? (
        <>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => setCheck(verifyChain(shown))}>
              <Check />
              Vérifier la chaîne
            </button>
            {tampered ? (
              <button className="btn btn-secondary" onClick={() => (setTampered(null), setCheck(null))}>
                <RotateCcw />
                Rétablir le journal
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={tamper} disabled={journal.length < 2}>
                <FlaskConical />
                Simuler une falsification
              </button>
            )}
            <span className="hint num">{journal.length} entrées</span>
          </div>
          {check && (
            <div className={`line ${check.ok ? "line-ok" : "line-red"} journal-verdict`} role="status">
              {check.ok ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
              <span>
                {check.ok ? (
                  <>
                    <b>Chaîne intacte.</b> Les {shown.length} entrées sont liées, aucune n’a été modifiée.
                  </>
                ) : (
                  <>
                    <b>Chaîne rompue à l’entrée {check.brokenAt}.</b> Son contenu ne correspond plus à son empreinte : la falsification est détectée.
                  </>
                )}
              </span>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th>Date</th>
                  <th>Acteur</th>
                  <th>Événement</th>
                  <th>Décision</th>
                  <th>Empreinte</th>
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((e) => (
                  <tr key={e.index} className={check && !check.ok && e.index === check.brokenAt ? "bad" : ""}>
                    <td className="r num muted">{e.index}</td>
                    <td className="num">{frDate(e.timestamp, true)}</td>
                    <td>{e.actor}</td>
                    <td>{ACTIONS[e.action] ?? e.action}</td>
                    <td>{decisionChip(e)}</td>
                    <td className="mono muted" title={e.entry_hash}>
                      {shortHash(e.entry_hash, 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p className="leaves energy-note"><b>Ce qui est mesuré ici :</b> la durée de chaque génération vue du navigateur, et la taille de l’audio reçu. <b>Ce qui ne l’est pas encore :</b> l’énergie de l’inférence, qui a lieu chez le fournisseur de voix et n’est pas publiée par requête. Nous l’affichons comme « à mesurer » plutôt que d’inventer un chiffre.</p>
          {usage.filter((u) => u.ms !== undefined).length === 0 ? (
            <div className="empty">
              <h2 className="h-sm">Aucune génération mesurée</h2>
              <p>Générez une réplique dans le Studio : sa durée et sa taille apparaîtront ici.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voix</th>
                    <th className="r">Caractères</th>
                    <th className="r">Durée mesurée</th>
                    <th className="r">Audio reçu</th>
                    <th>Énergie</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {usage
                    .filter((u) => u.ms !== undefined)
                    .map((u) => (
                      <tr key={u.id}>
                        <td>{frDate(u.at, true)}</td>
                        <td>{voiceById(u.voice_id)?.name}</td>
                        <td className="r">{fmt.format(u.chars)}</td>
                        <td className="r">{fmt.format(u.ms!)} ms</td>
                        <td className="r">{fmt.format(Math.round((u.bytes ?? 0) / 1024))} Ko</td>
                        <td className="muted">[à mesurer]</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Credits() {
  const plan = useStore((s) => s.plan);
  const setPlan = useStore((s) => s.setPlan);
  const balance = useStore(balanceOf);
  const spent = useStore((s) => s.spent);
  const allUsage = useStore((s) => s.usage);
  const usage = allUsage.filter((u) => u.creator === CREATOR.name);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Jetons</h1>
          <p className="lead">
            Comme sur ElevenLabs : une offre donne des jetons chaque mois, et chaque caractère synthétisé coûte un jeton. 70 % des jetons dépensés sur une voix vont à son titulaire.
          </p>
        </div>
      </div>
      <div className="credits">
        <section className="plans" role="radiogroup" aria-label="Offre">
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <label key={id} className={`plan ${plan === id ? "on" : ""}`}>
              <input type="radio" name="plan" checked={plan === id} onChange={() => (setPlan(id), toast(`Offre ${PLANS[id].name} (simulée)`, "ok"))} />
              <span className="plan-name">{PLANS[id].name}</span>
              <span className="num plan-qty">{fmt.format(PLANS[id].monthly)} jetons / mois</span>
              <span className="muted">{PLANS[id].blurb}</span>
            </label>
          ))}
        </section>
        <p className="hint">
          Ce mois-ci : <span className="num">{fmt.format(spent)}</span> jetons dépensés, <span className="num">{fmt.format(balance)}</span> restants. Changement d’offre simulé, aucun paiement.
        </p>
      </div>
      <h2 className="sec-title">Historique</h2>
      {usage.length === 0 ? (
        <div className="empty">
          <h2 className="h-sm">Aucune dépense pour l’instant</h2>
          <p>Chaque réplique générée apparaîtra ici avec la part versée au titulaire de la voix.</p>
        </div>
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
                <th className="r">À Sawti</th>
              </tr>
            </thead>
            <tbody className="num">
              {usage.map((u) => (
                <tr key={u.id}>
                  <td>{frDate(u.at, true)}</td>
                  <td>{u.project}</td>
                  <td>{voiceById(u.voice_id)?.name}</td>
                  <td className="r">{fmt.format(u.cost)}</td>
                  <td className="r">{u.owner ? fmt.format(u.owner) : <span className="muted">voix neutre</span>}</td>
                  <td className="r">{fmt.format(u.platform)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
