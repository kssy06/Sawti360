import { ArrowRight, Check, FileBadge2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { forgetVideo, formatDuration } from "../../media/local";
import { statusOf, useStore, type StepKey } from "../../state/store";
import { FORMAT_LABEL, PROJECT_LABEL } from "../../state/workflow";
import { Dialog, Prov, Status, toast } from "../../ui/kit";
import { useCrumbs } from "../../ui/Shell";
import { STATUS_TONE } from "../ProjectRow";
import Analysis from "./Analysis";
import Authorizations from "./Authorizations";
import Characters from "./Characters";
import Generation from "./Generation";
import Result from "./Result";
import { nextStep, STEP_GUIDE, STEPS, stepStates } from "./shared";
import Timeline from "./Timeline";
import Translation from "./Translation";
import VoicesStep from "./VoicesStep";

export default function Workspace() {
  const { id = "", step } = useParams();
  const p = useStore((s) => s.projects[id]);
  const requests = useStore((s) => s.requests);
  const session = useStore((s) => s.session);
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Direction of travel between steps, so the next step slides in from the side it comes from.
  const lastIndex = useRef(-1);
  const stepIndex = STEPS.findIndex((x) => x.key === step);
  const dir = lastIndex.current === -1 || stepIndex === lastIndex.current ? "none" : stepIndex > lastIndex.current ? "fwd" : "back";
  useEffect(() => {
    lastIndex.current = stepIndex;
  }, [stepIndex]);
  useEffect(() => {
    if (p) openProject(p.id);
  }, [p, openProject]);
  useCrumbs([{ label: "Projets", to: "/projets" }, { label: p?.title ?? "Projet", to: p ? `/projet/${p.id}` : undefined }, { label: STEPS.find((s) => s.key === step)?.label ?? "" }]);

  if (!p || p.accountId !== session?.accountId) return <Navigate to="/projets" replace />;
  const states = stepStates(p, requests);
  const key = step as StepKey;
  if (!STEPS.some((s) => s.key === key) || states[key] === "locked") return <Navigate to={`/projet/${p.id}/${nextStep(p, requests)}`} replace />;
  const status = statusOf({ requests }, p);
  const index = STEPS.findIndex((s) => s.key === key);

  return (
    <>
      <div className="wk-head">
        <div className="grow">
          <h1>{p.title}</h1>
          <div className="wk-meta">
            <Status tone={STATUS_TONE[status]}>{PROJECT_LABEL[status]}</Status>
            <span className="sep" aria-hidden />
            <span>{FORMAT_LABEL[p.format]}</span>
            <span className="sep" aria-hidden />
            <span>Derja tunisienne → Français</span>
            {p.video && (
              <>
                <span className="sep" aria-hidden />
                <span className="num">{formatDuration(p.video.duration)}</span>
              </>
            )}
            {p.example && (
              <>
                <span className="sep" aria-hidden />
                <Prov kind="example">projet d’exemple</Prov>
              </>
            )}
          </div>
        </div>
        <div className="row">
          {p.generation.status === "done" && (
            <Link to={`/passeports/${p.id}`} className="btn btn-secondary">
              <FileBadge2 />
              Passeport 360°
            </Link>
          )}
          {!p.example && (
            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(true)} aria-label="Supprimer le projet">
              <Trash2 />
            </button>
          )}
        </div>
      </div>

      {/* Same indicator language as the AnimatedStepper: filled circles for done steps, an orange ring and
          glow on the current step (the glow glides between steps), connectors that fill as steps complete. */}
      <nav className="pstepper" aria-label="Étapes du projet">
        {STEPS.map((s, i) => {
          const st = states[s.key];
          const status = s.key === key ? "active" : st === "done" ? "complete" : st === "attn" ? "attn" : st === "locked" ? "locked" : "inactive";
          return (
            <Fragment key={s.key}>
              <Link to={`/projet/${p.id}/${s.key}`} className={`pstep ${status}`} aria-current={s.key === key ? "step" : undefined} aria-disabled={st === "locked" || undefined} tabIndex={st === "locked" ? -1 : undefined}>
                <span className="astep-dot">
                  {status === "complete" ? <Check aria-hidden /> : <span>{i + 1}</span>}
                  {status === "active" && <motion.span layoutId="project-step-glow" className="astep-glow" transition={{ type: "spring", stiffness: 380, damping: 32 }} aria-hidden />}
                </span>
                <span className="pstep-name">
                  {s.label}
                  {st === "attn" && s.key !== key && <span className="pstep-attn">à traiter</span>}
                </span>
              </Link>
              {i < STEPS.length - 1 && (
                <span className="astep-connector pstep-connector" aria-hidden>
                  <motion.span initial={false} animate={{ scaleX: st === "done" ? 1 : 0 }} transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }} />
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <StepGuide step={key} index={index} next={STEPS[index + 1] && states[STEPS[index + 1].key] !== "locked" ? STEPS[index + 1] : undefined} projectId={p.id} />

      <div key={key} className="step-view" data-dir={dir}>
        {key === "analyse" && <Analysis p={p} />}
        {key === "personnages" && <Characters p={p} />}
        {key === "autorisations" && <Authorizations p={p} />}
        {key === "voix" && <VoicesStep p={p} />}
        {key === "traduction" && <Translation p={p} />}
        {key === "timeline" && <Timeline p={p} />}
        {key === "generation" && <Generation p={p} />}
        {key === "resultat" && <Result p={p} />}
      </div>
      <span className="sr-only" aria-live="polite">
        Étape {index + 1} sur {STEPS.length}
      </span>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce projet ?"
        size="sm"
        description="Le projet et la vidéo conservée dans ce navigateur seront supprimés. Les entrées du journal d’audit restent, car le journal ne peut pas être modifié."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
            <button
              className="btn btn-danger-solid"
              onClick={() => {
                deleteProject(p.id);
                void forgetVideo(p.id);
                toast("Projet supprimé");
                navigate("/projets");
              }}
            >
              Supprimer
            </button>
          </>
        }
      />
    </>
  );
}

/** Footer of a step: what is left, and the way forward. */
/** One line under the stepper: where you are, what this step does, what you get from it, what comes next. */
function StepGuide({ step, index, next, projectId }: { step: StepKey; index: number; next?: { key: StepKey; label: string }; projectId: string }) {
  const g = STEP_GUIDE[step];
  return (
    <p key={step} className="step-guide">
      <span className="step-guide-count num">
        Étape {index + 1} sur {STEPS.length}
      </span>
      <span className="step-guide-text">
        <span className="step-guide-does">{g.does}</span> {g.gets}
      </span>
      {next && (
        <Link to={`/projet/${projectId}/${next.key}`} className="step-guide-next">
          Ensuite : {next.label}
          <ArrowRight aria-hidden />
        </Link>
      )}
    </p>
  );
}

export function StepFoot({ hint, children }: { hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="step-foot">
      <span className="hint">{hint}</span>
      {children}
    </div>
  );
}
