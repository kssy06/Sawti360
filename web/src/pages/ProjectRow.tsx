import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { statusOf, useStore, type Project } from "../state/store";
import { PROJECT_LABEL, type ProjectStatus } from "../state/workflow";
import { Progress, relTime, Status, type Tone } from "../ui/kit";
import { nextStep, STEPS, stepStates } from "./project/shared";

export const STATUS_TONE: Record<ProjectStatus, Tone> = {
  brouillon: "muted",
  analyse: "info",
  attente_autorisation: "warn",
  generation: "info",
  termine: "ok",
};

export function ProjectRow({ p }: { p: Project }) {
  const requests = useStore((s) => s.requests);
  const status = statusOf({ requests }, p);
  const st = stepStates(p, requests);
  const done = STEPS.filter((s) => st[s.key] === "done").length;
  const step = nextStep(p, requests);
  return (
    <Link to={`/projet/${p.id}/${step}`} className="proj">
      {p.video?.poster ? (
        <img className="proj-thumb" src={p.video.poster} alt="" />
      ) : (
        <span className="proj-thumb" aria-hidden>
          {p.title}
        </span>
      )}
      <span className="proj-main">
        <b>{p.title}</b>
        <span>
          {p.subtitle}
          {p.example ? " · exemple" : ""}
        </span>
        <span style={{ marginTop: 4 }}>
          <Status tone={STATUS_TONE[status]}>{PROJECT_LABEL[status]}</Status>
        </span>
      </span>
      <span className="proj-progress">
        <Progress value={done / STEPS.length} label={`Avancement de ${p.title}`} tone={status === "termine" ? "ok" : "info"} />
        <span className="hint">
          {done} / {STEPS.length} étapes · suivante : {STEPS.find((s) => s.key === step)?.label.toLowerCase()}
        </span>
      </span>
      <span className="proj-date">{relTime(p.updatedAt)}</span>
      <ChevronRight aria-hidden />
    </Link>
  );
}
