import { ArrowRight, CircleCheck, CircleX, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { costOf, fmt } from "../../core/credits";
import { BACKEND } from "../../lib/backend";
import { GEN_STAGES } from "../../mock/simulate";
import { balanceOf, slotsOf, useStore, type Project } from "../../state/store";
import { transparencyPolicy } from "../../state/workflow";
import { ENGINE_TEXT, useEngineStatus } from "../../ui/engine";
import { Callout, DrawCheck, KV, ProcessList, Progress, Prov, timecode, type StepState } from "../../ui/kit";
import { StepFoot } from "./Workspace";

function overall(p: Project): number {
  const g = p.generation;
  if (g.status === "done") return 1;
  if (g.status === "idle") return 0;
  const synth = g.synthTotal ? g.synthDone / g.synthTotal : 1;
  if (g.stage === 0) return synth * 0.4;
  return 0.4 + ((g.stage - 1) / (GEN_STAGES.length - 1)) * 0.6 + 0.6 / (GEN_STAGES.length - 1) / 2;
}

const LINE_LABEL = { ok: "Synthétisée", refused: "Refusée", error: "Non synthétisée", skipped: "Voix originale : rendu non branché", pending: "En cours" } as const;

export default function Generation({ p }: { p: Project }) {
  const requests = useStore((s) => s.requests);
  const balance = useStore(balanceOf);
  const start = useStore((s) => s.startGeneration);
  const engine = useEngineStatus();
  const slots = slotsOf({ requests }, p);
  const chars = Object.values(p.characters);
  const approved = p.segments.filter((s) => s.validated).length;
  const cost = p.segments.filter((s) => s.validated && !p.characters[s.speaker]?.useOriginal).reduce((a, s) => a + costOf(s.translation), 0);
  const policy = transparencyPolicy(p.format);
  const g = p.generation;

  const checks = [
    { ok: chars.length > 0 && chars.every((c) => c.confirmed), title: "Personnages confirmés", detail: `${chars.filter((c) => c.confirmed).length} / ${chars.length}`, to: "personnages" },
    { ok: chars.length > 0 && chars.every((c) => slots[c.key]?.usable), title: "Une voix utilisable pour chaque personnage", detail: chars.filter((c) => !slots[c.key]?.usable).map((c) => `${c.name} : ${slots[c.key]?.reason.toLowerCase()}`).join(" · ") || "Autorisations et licences validées", to: "voix" },
    { ok: approved === p.segments.length && p.segments.length > 0, title: "Traduction approuvée", detail: `${approved} / ${p.segments.length} répliques approuvées`, to: "traduction" },
    { ok: cost <= balance, title: "Crédits de synthèse suffisants", detail: `${fmt.format(cost)} jetons nécessaires · ${fmt.format(balance)} disponibles`, to: "" },
  ];
  const ready = checks.every((c) => c.ok);
  const pct = overall(p);

  if (g.status === "idle") {
    return (
      <>
        <div className="gen">
          <div className="stack-lg">
            <div className="card">
              <div className="card-head">
                <h2>Avant de générer</h2>
              </div>
              <div className="card-body-tight">
                <ul className="ready-list">
                  {checks.map((c) => (
                    <li key={c.title} className={c.ok ? "ok" : "no"}>
                      {c.ok ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
                      <span>
                        <b>{c.title}</b>
                        <span>
                          {c.detail}
                          {!c.ok && c.to && (
                            <>
                              {" · "}
                              <Link to={`/projet/${p.id}/${c.to}`} className="link">
                                Corriger
                              </Link>
                            </>
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <ProcessList label="Étapes de la génération" steps={GEN_STAGES.map((s) => ({ key: s.key, label: s.label, detail: BACKEND ? s.server.detail : s.detail, state: "todo" as StepState, prov: BACKEND ? s.server.prov : s.real ? "real" : "sim" }))} />
          </div>
          <aside className="sticky-aside">
            <div className="card">
              <div className="card-head">
                <h3>Éléments de transparence</h3>
              </div>
              <div className="card-body-tight">
                <KV
                  rows={[
                    ["Label IA", policy.label],
                    ["QR code dans la vidéo", policy.qr],
                    ["Passeport 360°", "Créé et signé à la fin"],
                  ]}
                />
              </div>
            </div>
            {engine !== "loading" && <Callout tone={engine === "off" ? "warn" : "plain"}>{ENGINE_TEXT[engine]}</Callout>}
            {g.error && (
              <Callout tone="warn" title="La génération s’est arrêtée">
                {g.error}
              </Callout>
            )}
            <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={() => void start(p.id)}>
              <Play />
              Lancer la génération
            </button>
            {!ready && <p className="hint">Toutes les conditions doivent être remplies : aucune voix n’est générée sans autorisation ni approbation.</p>}
          </aside>
        </div>
      </>
    );
  }

  const stageState = (i: number): StepState => (g.status === "done" || i < g.stage ? "done" : i === g.stage ? "active" : "todo");
  const lines = p.segments.filter((s) => s.validated);

  return (
    <>
      <div className="gen">
        <div>
          <div className="gen-overall">
            <div className="row-between">
              <span className="row">
                {g.status === "done" ? <DrawCheck size={22} /> : <span className="spinner" />}
                <h2 style={{ fontSize: 17 }}>{g.status === "done" ? "Rendu prêt" : GEN_STAGES[g.stage]?.label}</h2>
              </span>
              <span className="gen-pct">{Math.round(pct * 100)} %</span>
            </div>
            <Progress value={pct} label="Progression globale de la génération" tone={g.status === "done" ? "ok" : "info"} />
            <div className="row-between">
              <span className="hint">
                {g.status === "done" ? `Terminé le ${new Date(g.finishedAt!).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : `Temps restant estimé : ${Math.max(1, Math.round((g.etaMs ?? 0) / 1000))} s`}
              </span>
              {g.status !== "done" && !BACKEND && <Prov kind="sim">estimation de la simulation</Prov>}
            </div>
          </div>
          <ProcessList
            label="Étapes de la génération"
            steps={GEN_STAGES.map((s, i) => ({
              key: s.key,
              label: s.label,
              detail: BACKEND ? s.server.detail : s.detail,
              state: stageState(i),
              prov: BACKEND ? s.server.prov : s.real ? "real" : "sim",
              extra:
                i === 0 ? (
                  <div className="gen-lines">
                    <span className="hint num">
                      {g.synthDone} / {g.synthTotal} répliques traitées
                    </span>
                    {lines.map((s) => {
                      const r = p.gens[s.id];
                      if (!r) return null;
                      return (
                        <span key={s.id} className="gen-line">
                          <span className="mono">{timecode(s.start)}</span>
                          <span className="ellipsis">
                            {p.characters[s.speaker]?.name} · {s.translation}
                          </span>
                          <span className={`st st-${r.status === "ok" ? "ok" : r.status === "refused" ? "bad" : r.status === "pending" ? "info" : "warn"}`}>{LINE_LABEL[r.status]}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : undefined,
            }))}
          />
        </div>
        <aside className="sticky-aside">
          {g.status === "done" ? (
            <>
              <Callout tone="ok" title="Génération terminée">
                Le Passeport 360° a été créé et signé. Consultez le résultat pour télécharger les fichiers.
              </Callout>
              <Link to={`/projet/${p.id}/resultat`} className="btn btn-primary btn-lg btn-block">
                Voir le résultat
                <ArrowRight />
              </Link>
            </>
          ) : (
            <Callout tone="plain" title="Vous pouvez quitter cette page">
              Une notification vous préviendra quand le rendu sera prêt.{" "}
              {BACKEND ? "Synthèse, placement et Passeport 360° sont faits par le serveur ; le mixage et le MP4 se font dans votre navigateur au téléchargement." : "Seule la synthèse vocale est réelle ; les étapes suivantes sont simulées dans ce prototype."}
            </Callout>
          )}
          {engine !== "loading" && engine !== "on" && <Callout tone="warn">{ENGINE_TEXT[engine]}</Callout>}
        </aside>
      </div>
      {g.status === "done" && (
        <StepFoot>
          <Link to={`/projet/${p.id}/resultat`} className="btn btn-primary">
            Résultat
            <ArrowRight />
          </Link>
        </StepFoot>
      )}
    </>
  );
}
