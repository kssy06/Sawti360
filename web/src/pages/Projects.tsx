import { ArrowRight, Check, Clapperboard, Film, Globe2, LockKeyhole, Trash2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgetVideo, formatDuration, formatSize, keepVideo, probeVideo, type Probe } from "../media/local";
import { runAnalysis } from "../media/pipeline";
import { DEMO_ID, useStore, type Privacy, type Project } from "../state/store";
import { frDate, Reveal, toast } from "../ui/kit";

const MAX_BYTES = 4 * 1024 * 1024 * 1024;

function Uploader() {
  const navigate = useNavigate();
  const createVideoProject = useStore((s) => s.createVideoProject);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [privacy, setPrivacy] = useState<Privacy>("publique");

  const accept = async (f: File) => {
    setError("");
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) {
      setError("Ce fichier n’est pas une vidéo. Formats acceptés : MP4, MOV, WebM.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Vidéo trop lourde pour le navigateur : 4 Go au plus.");
      return;
    }
    setBusy(true);
    try {
      const p = await probeVideo(f);
      setFile(f);
      setProbe(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vidéo illisible.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!file || !probe) return;
    const pid = createVideoProject({ name: file.name, size: file.size, type: file.type, duration: probe.duration, width: probe.width, height: probe.height, privacy });
    await keepVideo(pid, file, privacy === "publique");
    void runAnalysis(pid);
    navigate(`/studio/${pid}`);
  };

  const clear = () => {
    setFile(null);
    setProbe(null);
    setError("");
    if (input.current) input.current.value = "";
  };

  return (
    <section className="uploader">
      <Reveal show={!probe}>
        <label
          className={`dropzone ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
          onDragEnter={(e) => (e.preventDefault(), setDrag(true))}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void accept(f);
          }}
        >
          <span className="dz-icon" aria-hidden>
            <UploadCloud />
          </span>
          <span className="dz-text">
            <b>{busy ? "Lecture de la vidéo…" : "Déposez votre vidéo entière"}</b>
            <span className="muted">Film, épisode, vidéo YouTube, Short. L’IA regarde l’image pour doubler juste. MP4, MOV ou WebM.</span>
          </span>
          <span className="btn btn-secondary dz-btn">Choisir un fichier</span>
          <input ref={input} type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && accept(e.target.files[0])} />
        </label>
      </Reveal>
      <Reveal show={Boolean(error)} nudge>
        <div className="notice notice-red" role="alert">
          <X aria-hidden />
          {error}
        </div>
      </Reveal>

      <Reveal show={Boolean(probe)}>
        {probe && file && (
          <div className="staging">
            <div className="stage-preview">
              <img src={probe.poster} alt={`Aperçu de ${file.name}`} />
              <span className="stage-dur num">{formatDuration(probe.duration)}</span>
            </div>
            <div className="stage-main">
              <div className="stage-file">
                <div>
                  <h2 className="h-sm">{file.name}</h2>
                  <p className="muted num">
                    {formatDuration(probe.duration)} · {probe.width}×{probe.height} · {formatSize(file.size)}
                  </p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={clear}>
                  Changer
                </button>
              </div>

              <fieldset className="privacy">
                <legend>Cette vidéo est…</legend>
                {(
                  [
                    ["publique", Globe2, "Déjà publique", "Sur YouTube, Instagram, TikTok… Gardée dans ce navigateur pour y revenir plus tard."],
                    ["inedite", LockKeyhole, "Inédite", "Pas encore diffusée. Rien n’est gardé après la session, et le Passeport 360° le mentionne."],
                  ] as const
                ).map(([value, Icon, title, text]) => (
                  <label key={value} className={`choice ${privacy === value ? "on" : ""}`}>
                    <input type="radio" name="privacy" value={value} checked={privacy === value} onChange={() => setPrivacy(value)} className="sr-only" />
                    <Icon className="choice-icon" aria-hidden />
                    <span>
                      <b>{title}</b>
                      <span className="muted">{text}</span>
                    </span>
                    <span className="choice-tick" aria-hidden>
                      <Check />
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="notice notice-plain">
                <Film aria-hidden />
                <span>
                  <b>Ce qui quitte votre ordinateur :</b> la piste audio et une ou deux images par réplique, pour la transcription et la traduction. Le fichier vidéo, lui, reste ici.
                </span>
              </div>

              <div className="stage-actions">
                <button className="btn btn-primary" onClick={start}>
                  Lancer l’analyse
                  <ArrowRight />
                </button>
                <span className="hint">Interface de démonstration : transcription et traduction simulées.</span>
              </div>
            </div>
          </div>
        )}
      </Reveal>
    </section>
  );
}

function ProjectRow({ p }: { p: Project }) {
  const navigate = useNavigate();
  const openProject = useStore((s) => s.openProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const validated = p.segments.filter((s) => s.validated).length;
  const done = Object.values(p.gens).filter((g) => g.status === "ok").length;
  const analysing = p.pipeline?.status === "running";
  const go = () => {
    openProject(p.id);
    navigate(`/studio/${p.id}`);
  };
  return (
    <li className="proj" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}>
      <span className="proj-icon" aria-hidden>
        {p.kind === "demo" ? <Clapperboard /> : <Film />}
      </span>
      <span className="proj-main">
        <b>{p.title}</b>
        <span className="muted">
          {p.subtitle}
          {p.video ? ` · ${formatDuration(p.video.duration)}` : ""}
        </span>
      </span>
      <span className="proj-state">
        {analysing ? (
          <span className="chip chip-outline">
            <span className="led led-mock pulse" aria-hidden />
            Analyse en cours
          </span>
        ) : (
          <span className="muted num">
            {p.segments.length} répliques · {validated} validées · {done} doublées
          </span>
        )}
      </span>
      <span className="muted proj-date">{frDate(p.createdAt)}</span>
      {p.id !== DEMO_ID ? (
        <button
          className="btn btn-ghost btn-sm btn-icon"
          aria-label={`Supprimer ${p.title}`}
          onClick={(e) => {
            e.stopPropagation();
            deleteProject(p.id);
            void forgetVideo(p.id);
            toast("Projet supprimé, vidéo retirée de ce navigateur");
          }}
        >
          <Trash2 />
        </button>
      ) : (
        <span className="chip">Exemple</span>
      )}
    </li>
  );
}

export default function Projects() {
  const order = useStore((s) => s.order);
  const projects = useStore((s) => s.projects);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Studio de doublage</h1>
          <p className="lead">Importez la vidéo entière : l’IA écoute qui parle, regarde l’image, puis propose une version française que vous validez réplique par réplique.</p>
        </div>
      </div>
      <Uploader />
      <h2 className="sec-title projects-title">Projets</h2>
      <ul className="projects">
        {order.map((pid) => projects[pid] && <ProjectRow key={pid} p={projects[pid]} />)}
      </ul>
    </div>
  );
}
