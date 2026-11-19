import { ArrowRight, Check, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { FR_CHARS_PER_SECOND } from "../../core/catalog";
import { checkFidelity } from "../../core/fidelity";
import type { Segment } from "../../core/types";
import { useStore, type Project } from "../../state/store";
import { Callout, Progress, Prov, Segmented, Status, timecode, toast, VoiceMark } from "../../ui/kit";
import { voiceInfo } from "./shared";
import { StepFoot } from "./Workspace";

type TrState = "generee" | "verifiee" | "modifiee" | "approuvee";
const TR_LABEL: Record<TrState, string> = { generee: "Générée", verifiee: "Vérifiée", modifiee: "Modifiée", approuvee: "Approuvée" };

function trState(p: Project, s: Segment): TrState {
  if (s.validated) return "approuvee";
  if (p.proposals[s.id] !== undefined && p.proposals[s.id] !== s.translation) return "modifiee";
  if (p.reviews[s.id]) return "verifiee";
  return "generee";
}

function Row({ p, s }: { p: Project; s: Segment }) {
  const edit = useStore((st) => st.editTranslation);
  const setValidated = useStore((st) => st.setValidated);
  const apply = useStore((st) => st.applySuggestion);
  const fid = useId();
  const review = p.reviews[s.id];
  const alerts = checkFidelity(s.source, s.translation);
  const state = trState(p, s);
  const info = voiceInfo(p, s.speaker);
  const spoken = [...s.translation.trim()].length / FR_CHARS_PER_SECOND;
  const onScreen = s.end - s.start;
  const tooLong = spoken > onScreen + 0.2;
  const f = (n: number) => n.toFixed(1).replace(".", ",");

  return (
    <div id={`tr-${s.id}`} className={`tr-row ${s.validated ? "approved" : ""}`}>
      <div className="tr-who">
        <span className="mono muted">
          {timecode(s.start)}–{timecode(s.end).slice(3)}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <VoiceMark name={info.name} kind={info.kind} size={20} />
          <b>{p.characters[s.speaker]?.name ?? s.speaker}</b>
        </span>
        {s.confidence < 0.8 && (
          <Status tone="warn" title="Score de confiance de la transcription">
            Transcription {Math.round(s.confidence * 100)} %
          </Status>
        )}
      </div>
      <div className="tr-col">
        <span className="label-sm tr-label">Derja · original</span>
        <p className="ar tr-src" lang="ar-TN">
          {s.source}
        </p>
      </div>
      <div className="tr-col">
        <label className="label-sm tr-label-fr" htmlFor={fid}>
          Français · LLM 1, modifiable
        </label>
        <textarea id={fid} className="textarea" rows={2} value={s.translation} onChange={(e) => edit(s.id, e.target.value)} lang="fr" />
        <span className={`hint num ${tooLong ? "hint-warn" : ""}`}>
          {tooLong ? <TriangleAlert size={12} aria-hidden style={{ verticalAlign: "-2px" }} /> : null} {f(onScreen)} s à l’écran · ≈ {f(spoken)} s en français
        </span>
        {alerts.map((a) => (
          <span key={a.type} className="hint hint-bad">
            <b>{a.type === "CHIFFRES" ? "Chiffre modifié." : "Négation perdue."}</b> {a.message}
          </span>
        ))}
        {state === "modifiee" && (
          <button className="btn btn-link" style={{ justifySelf: "start", fontSize: 12 }} onClick={() => edit(s.id, p.proposals[s.id])}>
            <Undo2 size={12} /> Revenir à la proposition du LLM 1
          </button>
        )}
      </div>
      <div className="tr-col">
        <span className="label-sm tr-label">Vérification · LLM 2</span>
        {review ? (
          <div className={`review ${review.verdict === "ok" ? "review-ok" : ""}`}>
            <span>{review.note}</span>
            {review.suggestion && (
              <>
                <span className="sug">« {review.suggestion} »</span>
                <button className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }} onClick={() => (apply(p.id, s.id), toast("Correction appliquée, à approuver"))}>
                  Appliquer la correction
                </button>
              </>
            )}
          </div>
        ) : (
          <span className="hint">Pas encore vérifiée.</span>
        )}
      </div>
      <div className="tr-actions">
        <button className="btn btn-secondary btn-sm approve-btn" aria-pressed={s.validated} onClick={() => setValidated(s.id, !s.validated)} disabled={!s.translation.trim()}>
          <Check />
          {s.validated ? "Approuvée" : "Approuver"}
        </button>
        <span className="tr-state">{TR_LABEL[state]}</span>
      </div>
    </div>
  );
}

export default function Translation({ p }: { p: Project }) {
  const reviewAll = useStore((s) => s.reviewAll);
  const [filter, setFilter] = useState<"all" | "todo" | "flag">("all");
  const approved = p.segments.filter((s) => s.validated).length;
  const flagged = p.segments.filter((s) => p.reviews[s.id]?.verdict === "correction" || checkFidelity(s.source, s.translation).length).length;
  const rows = p.segments.filter((s) => (filter === "all" ? true : filter === "todo" ? !s.validated : p.reviews[s.id]?.verdict === "correction" || checkFidelity(s.source, s.translation).length > 0));
  const all = approved === p.segments.length && p.segments.length > 0;

  return (
    <>
      <div className="stack">
        <div className="row-between">
          <div className="row">
            <Prov kind={p.example ? "example" : "sim"}>LLM 1 et LLM 2</Prov>
            <Prov kind="real">vérificateur de fidélité, approbations au journal</Prov>
          </div>
          <div className="row">
            <Segmented
              size="sm"
              label="Filtrer les répliques"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Toutes", count: p.segments.length },
                { value: "todo", label: "À approuver", count: p.segments.length - approved },
                { value: "flag", label: "Signalées", count: flagged },
              ]}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => (reviewAll(p.id), toast("Vérification relancée sur toutes les répliques"))}>
              <RefreshCw />
              Relancer la vérification
            </button>
          </div>
        </div>
        <Callout tone="plain">
          Le LLM 1 traduit en gardant le sens, le contexte et les expressions. Le LLM 2 relit et propose des corrections. <b>Rien n’est généré sans votre approbation, réplique par réplique.</b> Modifier un texte retire son approbation.
        </Callout>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="tr-head" style={{ paddingTop: 14 }}>
          <span>Réplique</span>
          <span>Derja</span>
          <span>Traduction</span>
          <span>Vérification</span>
          <span>Décision</span>
        </div>
        {rows.length === 0 ? (
          <div className="card-body">
            <p className="muted">Aucune réplique dans ce filtre.</p>
          </div>
        ) : (
          rows.map((s) => <Row key={s.id} p={p} s={s} />)
        )}
        <div className="approve-bar">
          <span className="num strong">
            {approved} / {p.segments.length} approuvées
          </span>
          <Progress value={p.segments.length ? approved / p.segments.length : 0} label="Répliques approuvées" tone={all ? "ok" : "info"} />
          <span className="grow" />
          {all ? <Status tone="ok">Traduction approuvée</Status> : <span className="hint">Chaque approbation est signée dans le journal d’audit.</span>}
        </div>
      </div>

      <StepFoot hint="La timeline permet d’écouter et d’ajuster chaque réplique à sa place dans la vidéo.">
        <Link to={`/projet/${p.id}/timeline`} className="btn btn-primary">
          Ouvrir la timeline
          <ArrowRight />
        </Link>
      </StepFoot>
    </>
  );
}
