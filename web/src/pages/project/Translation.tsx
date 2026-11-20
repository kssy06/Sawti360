import { EMOTION_KEYS, EMOTIONS, type Emotion } from "../../core/emotion";
import { ArrowRight, Check, CircleCheck, Coins, RefreshCw, ScanSearch, TriangleAlert, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { FR_CHARS_PER_SECOND } from "../../core/catalog";
import { costOf, fmt } from "../../core/credits";
import { CHECK, TRANSLATE } from "../../core/engines";
import { checkFidelity } from "../../core/fidelity";
import type { Segment } from "../../core/types";
import { useStore, type Project } from "../../state/store";
import { Callout, Progress, Prov, Segmented, Status, timecode, toast } from "../../ui/kit";
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

/** The generation speeds a line up to ×1.15 on its own (C2): only past that is it really too long. */
const MAX_SPEEDUP = 1.15;

/** « Intervenant B » → « B », « Amel » → « A ». */
const initialOf = (name: string) => (name.replace(/^Intervenante? /, "").trim()[0] ?? "?").toUpperCase();

const VOICE_KIND = { licensed: "Voix licenciée", ai: "Voix IA", original: "Voix originale", none: "Pas encore de voix" } as const;

/** The line already says what Sawti Check proposed. */
const applied = (p: Project, s: Segment) => Boolean(p.reviews[s.id]?.suggestion) && s.translation === p.reviews[s.id]?.suggestion;

/** Sawti Check asks for a change the line does not have yet (the « Signalées » filter). */
const needsFix = (p: Project, s: Segment) => p.reviews[s.id]?.verdict === "correction" && !applied(p, s);

/** Older reviews were rewritten « Correction … appliquée » when applied: shown the same way. */
const legacyApplied = (note: string) => /^Correction d.* appliquée/.test(note);

function Row({ p, s }: { p: Project; s: Segment }) {
  const edit = useStore((st) => st.editTranslation);
  const setEmotion = useStore((st) => st.setLineEmotion);
  const eid = useId();
  const setValidated = useStore((st) => st.setValidated);
  const apply = useStore((st) => st.applySuggestion);
  const fid = useId();
  const review = p.reviews[s.id];
  const alerts = checkFidelity(s.source, s.translation);
  const state = trState(p, s);
  const info = voiceInfo(p, s.speaker);
  const spoken = [...s.translation.trim()].length / FR_CHARS_PER_SECOND;
  const onScreen = s.end - s.start;
  const tooLong = spoken > onScreen * MAX_SPEEDUP + 0.2;
  const sped = !tooLong && spoken > onScreen + 0.2;
  const jetons = p.characters[s.speaker]?.useOriginal ? 0 : costOf(s.translation);
  const order = Object.keys(p.characters);
  const tone = Math.max(0, order.indexOf(s.speaker)) % 4;
  const speaker = p.characters[s.speaker]?.name ?? s.speaker;
  const f = (n: number) => n.toFixed(1).replace(".", ",");
  const done = applied(p, s) || (review ? legacyApplied(review.note) : false);

  return (
    <div id={`tr-${s.id}`} className={`tr-row ${s.validated ? "approved" : ""}`}>
      <div className="tr-who">
        <span className={`spk spk-${tone}`} aria-hidden>
          {initialOf(speaker)}
        </span>
        <span className="tr-who-text">
          <b>{speaker}</b>
          <span className="mono muted">
            {timecode(s.start)}–{timecode(s.end).slice(3)}
          </span>
          <span className={`tr-voice tr-voice-${info.kind}`}>{info.kind === "none" ? VOICE_KIND.none : `${VOICE_KIND[info.kind]} · ${info.name}`}</span>
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
          Français · {TRANSLATE}, modifiable
        </label>
        <textarea id={fid} className="textarea" rows={2} value={s.translation} onChange={(e) => edit(s.id, e.target.value)} lang="fr" />
        <span className="tr-meta">
          <span className={`hint num ${tooLong ? "hint-warn" : ""}`} title={`${f(onScreen)} s à l’écran ; environ ${f(spoken)} s pour dire le français`}>
            {tooLong ? <TriangleAlert size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> : null}
            {tooLong ? ` Trop longue : ${f(spoken)} s pour ${f(onScreen)} s` : sped ? `${f(spoken)} s pour ${f(onScreen)} s, un peu accélérée` : `${f(spoken)} s pour ${f(onScreen)} s`}
          </span>
          <span className="hint num tr-jetons" title="1 jeton par caractère doublé">
            <Coins size={14} aria-hidden /> {fmt.format(jetons)} jetons
          </span>
        </span>
        {alerts.map((a) => (
          <span key={a.type} className="hint hint-bad">
            <b>{a.type === "CHIFFRES" ? "Chiffre modifié." : "Négation perdue."}</b> {a.message}
          </span>
        ))}
        <span className="tr-emotion">
          <label className="hint" htmlFor={eid}>
            Émotion de la voix
          </label>
          <select id={eid} className="select" value={s.emotion ?? "neutre"} onChange={(e) => setEmotion(p.id, s.id, e.target.value as Emotion)}>
            {EMOTION_KEYS.map((k) => (
              <option key={k} value={k}>
                {EMOTIONS[k].label}
              </option>
            ))}
          </select>
        </span>
        {state === "modifiee" && (
          <button className="btn btn-link" style={{ justifySelf: "start", fontSize: 12 }} onClick={() => edit(s.id, p.proposals[s.id])}>
            <Undo2 size={12} /> Revenir à la proposition de {TRANSLATE}
          </button>
        )}
      </div>
      <div className="tr-col">
        <span className="label-sm tr-label">Vérification · {CHECK}</span>
        {review ? (
          <div className={`review ${review.verdict === "ok" || done ? "review-ok" : ""}`}>
            <span className="review-note">
              {review.verdict === "ok" || done ? <CircleCheck size={16} aria-hidden className="review-icon ok" /> : <ScanSearch size={16} aria-hidden className="review-icon" />}
              <span>{done ? `Correction de ${CHECK} appliquée.${s.validated ? "" : " À approuver."}` : review.note}</span>
            </span>
            {review.suggestion && !done && (
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

/** The models that really ran behind Sawti Translate and Sawti Check (back-end mode), for the tooltip. */
function modelsBehind(p: Project): string {
  const llm1 = p.pipeline?.simulated === false ? p.pipeline.providers?.llm1 : undefined;
  const llm2 = Object.values(p.reviews).find((r) => !r.simulated && r.provider)?.provider;
  return [`${TRANSLATE} : ${llm1 ?? "simulé"}`, `${CHECK} : ${llm2 ?? "règles de fidélité"}`].join(" · ");
}

export default function Translation({ p }: { p: Project }) {
  const reviewAll = useStore((s) => s.reviewAll);
  const [filter, setFilter] = useState<"all" | "todo" | "flag">("all");
  const approved = p.segments.filter((s) => s.validated).length;
  const flagged = p.segments.filter((s) => needsFix(p, s) || checkFidelity(s.source, s.translation).length).length;
  const rows = p.segments.filter((s) => (filter === "all" ? true : filter === "todo" ? !s.validated : needsFix(p, s) || checkFidelity(s.source, s.translation).length > 0));
  const all = approved === p.segments.length && p.segments.length > 0;

  return (
    <>
      <div className="stack">
        <div className="row-between">
          <div className="row">
            <span title={modelsBehind(p)}>
              <Prov kind={p.example ? "example" : p.pipeline?.simulated === false ? "real" : "sim"}>
                {TRANSLATE} et {CHECK}
              </Prov>
            </span>
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
          <b>{TRANSLATE}</b> traduit en gardant le sens, le contexte, les expressions et le temps à l’écran. <b>{CHECK}</b> relit chaque réplique contre la derja et propose des corrections. <b>Rien n’est généré sans votre approbation, réplique par réplique.</b> Modifier un texte retire son approbation.
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
          <span className="hint num tr-jetons" title="1 jeton par caractère doublé ; voix originales non comptées">
            <Coins size={14} aria-hidden /> ≈ {fmt.format(p.segments.filter((x) => !p.characters[x.speaker]?.useOriginal).reduce((a, x) => a + costOf(x.translation), 0))} jetons pour tout doubler
          </span>
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
