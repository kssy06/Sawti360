import { ArrowRight, FileVideo, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { formatDuration, getFrames } from "../../media/local";
import { BACKEND } from "../../lib/backend";
import { isAnalysing, runAnalysis } from "../../media/pipeline";
import { useExampleAnalysis } from "../../state/remote/analysis";
import { useStore } from "../../state/store";
import { ANALYSIS_STEPS } from "../../mock/simulate";
import type { Project } from "../../state/store";
import { Callout, KV, ProcessList, Progress, Prov, plural } from "../../ui/kit";
import { useMedia, useVideoSrc } from "./shared";
import { StepFoot } from "./Workspace";

export default function Analysis({ p }: { p: Project }) {
  const { src } = useVideoSrc(p);
  useMedia();
  const running = p.pipeline?.status === "running";
  const failed = p.pipeline?.status === "error";
  const step = p.pipeline?.step ?? 5;
  const real = p.pipeline?.simulated === false;
  const models = real ? [p.pipeline?.providers?.asr, p.pipeline?.providers?.llm1, p.pipeline?.providers?.llm2].filter((m, i, a) => m && a.indexOf(m) === i).join(" · ") : "";
  const resumable = BACKEND && Boolean(p.pipeline?.jobId);

  // A running analysis survives navigation; restart it after a reload once the video is back
  // (back-end mode: the server's task is simply followed again).
  useEffect(() => {
    if (running && !isAnalysing(p.id) && (src || resumable)) void runAnalysis(p.id);
  }, [p.id, running, src, resumable]);

  const frames = p.segments.flatMap((s, n) => getFrames(p.id, s.id).map((f, i) => ({ key: `${s.id}-${i}`, f, label: i === 0 ? `Réplique ${n + 1}` : " " })));
  const translated = p.segments.filter((s) => s.translation).length;
  const pct = running ? Math.min(0.99, (step + (step === 3 && p.segments.length ? translated / p.segments.length : 0.4)) / ANALYSIS_STEPS.length) : failed ? Math.min(step, ANALYSIS_STEPS.length) / ANALYSIS_STEPS.length : 1;
  const chars = Object.values(p.characters);

  return (
    <>
      <div className="analysis">
        <div className="stack">
          <div className="an-stage">
            {src ? (
              <video src={src} autoPlay={running} muted loop playsInline controls={!running} />
            ) : p.video?.poster ? (
              <img src={p.video.poster} alt="" />
            ) : (
              <div className="stage-placeholder">
                <div>
                  <FileVideo size={28} aria-hidden style={{ opacity: 0.5 }} />
                  <p>{p.example ? "Projet d’exemple : pas de fichier vidéo." : "Vidéo non disponible dans ce navigateur."}</p>
                </div>
              </div>
            )}
          </div>
          {p.kind === "video" && (
            <div>
              <div className="row">
                <span className="label-sm">Images lues par l’analyse</span>
                <Prov kind="real">extraites de votre vidéo</Prov>
              </div>
              <div className="filmstrip" aria-label="Images extraites">
                {frames.length === 0 ? (
                  <p className="hint">{running ? "Les images apparaîtront ici, une ou deux par réplique." : "Aucune image extraite (vidéo distante sans autorisation de lecture, ou vidéo rechargée)."}</p>
                ) : (
                  frames.map(({ key, f, label }) => (
                    <figure key={key}>
                      <img src={f} alt="" />
                      <figcaption>{label}</figcaption>
                    </figure>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="an-overall">
            <div className="row-between">
              <span className="row">
                <h2 style={{ fontSize: 16 }}>{running ? "Analyse en cours" : failed ? "Analyse interrompue" : "Analyse terminée"}</h2>
                {failed ? null : real ? (
                  <Prov kind="real">{models || "transcription et détection"}</Prov>
                ) : (
                  <Prov kind={p.example ? "example" : "sim"}>{p.example ? undefined : "transcription et détection"}</Prov>
                )}
              </span>
              <b className="num">{Math.round(pct * 100)} %</b>
            </div>
            <Progress value={pct} label="Progression globale de l’analyse" tone={running ? "info" : failed ? "bad" : "ok"} />
          </div>
          <ProcessList
            label="Étapes de l’analyse"
            steps={ANALYSIS_STEPS.map((s, i) => ({
              key: s.key,
              label: s.label,
              detail: s.detail,
              state: failed ? (i < step ? "done" : i === step ? "error" : "todo") : !running || i < step ? "done" : i === step ? "active" : "todo",
              extra:
                running && i === step && p.pipeline?.detail ? (
                  <span className="hint">{p.pipeline.detail}</span>
                ) : running && i === step && i === 3 ? (
                  <span className="hint num">
                    Répliques traitées : {translated} / {p.segments.length}
                  </span>
                ) : undefined,
            }))}
          />
        </div>
      </div>

      {failed && (
        <Callout tone="bad" role="alert" title="L’analyse n’a pas abouti">
          <p>{p.pipeline?.error ?? "Erreur inconnue."}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => void runAnalysis(p.id)}>
              <RotateCcw />
              Relancer
            </button>
            {BACKEND && (
              <button className="btn btn-secondary btn-sm" onClick={() => void useExampleAnalysis(useStore.setState, p.id)}>
                Utiliser l’exemple simulé
              </button>
            )}
          </div>
        </Callout>
      )}

      {!running && !failed && (
        <section className="section">
          <div className="section-head">
            <h2>Résultat</h2>
          </div>
          <div className="two-col">
            <div className="card">
              <div className="card-body-tight">
                <KV
                  rows={[
                    ["Intervenants détectés", plural(chars.length, "intervenant")],
                    ["Prises de parole", plural(p.segments.length, "réplique")],
                    ["Durée analysée", p.video ? formatDuration(p.video.duration) : "extrait d’exemple"],
                    ["Passeport de voix correspondant", "Aucun intervenant rattaché automatiquement"],
                  ]}
                />
              </div>
            </div>
            <Callout tone="info" title="Une détection n’est pas une identification">
              L’IA sépare les voix et propose des noms. Elle ne sait pas qui sont réellement les personnes : c’est à vous de confirmer chaque personnage.
            </Callout>
          </div>
        </section>
      )}

      <StepFoot hint={running ? "Vous pouvez quitter cette page : l’analyse continue et le tableau de bord sera mis à jour." : undefined}>
        <Link to={`/projet/${p.id}/personnages`} className={`btn btn-primary ${running ? "" : ""}`} aria-disabled={running || failed} onClick={(e) => (running || failed) && e.preventDefault()}>
          Confirmer les personnages
          <ArrowRight />
        </Link>
      </StepFoot>
    </>
  );
}
