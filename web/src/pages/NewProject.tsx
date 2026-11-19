import { ArrowRight, FileVideo, Fingerprint, HardDrive, Link2, Loader2, LockKeyhole, ScanEye, UploadCloud, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDuration, formatSize, hashFile, keepVideo, probeUrl, probeVideo, setRemoteVideo, shrinkImage, type Probe } from "../media/local";
import { runAnalysis } from "../media/pipeline";
import { useStore, type Privacy } from "../state/store";
import { FORMAT_LABEL, transparencyPolicy, type VideoFormat } from "../state/workflow";
import { Callout, PageHead, Progress, Prov, Tabs } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";

const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const PLATFORMS = /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|dailymotion\.com|x\.com|twitter\.com)/i;

type Source = { kind: "file"; file: File; probe: Probe } | { kind: "link"; url: string; probe: Probe };

export default function NewProject() {
  useCrumbs([{ label: "Projets", to: "/projets" }, { label: "Nouveau projet" }]);
  const navigate = useNavigate();
  const create = useStore((s) => s.createVideoProject);
  const [tab, setTab] = useState<"file" | "link">("file");
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [hash, setHash] = useState<{ ratio: number; value?: string }>({ ratio: 0 });
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<VideoFormat>("film");
  const [privacy, setPrivacy] = useState<Privacy>("publique");
  const [starting, setStarting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), url: useId() };
  const cancelHash = useRef(false);

  useEffect(() => () => void (cancelHash.current = true), []);

  const acceptFile = async (f: File) => {
    setError("");
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) return setError("Ce fichier n’est pas une vidéo. Formats acceptés : MP4, MOV, WebM.");
    if (f.size > MAX_BYTES) return setError("Vidéo trop lourde pour un traitement dans le navigateur : 4 Go au plus.");
    setBusy(true);
    try {
      const probe = await probeVideo(f);
      setSource({ kind: "file", file: f, probe });
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
      if (probe.duration < 90) setFormat("reel");
      setHash({ ratio: 0 });
      cancelHash.current = false;
      const value = await hashFile(f, (ratio) => !cancelHash.current && setHash({ ratio }));
      if (!cancelHash.current) setHash({ ratio: 1, value });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vidéo illisible par ce navigateur.");
      setSource(null);
    } finally {
      setBusy(false);
    }
  };

  const checkLink = async () => {
    setError("");
    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      return setError("Adresse invalide. Collez un lien complet commençant par https://");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return setError("Seuls les liens http et https sont acceptés.");
    if (PLATFORMS.test(u.hostname)) {
      return setError(
        "Les liens de plateformes (YouTube, Vimeo, TikTok, Instagram…) demandent une importation côté serveur, qui n’est pas branchée dans ce prototype. Téléchargez la vidéo depuis la plateforme si vous en avez le droit, puis déposez le fichier.",
      );
    }
    setBusy(true);
    try {
      const probe = await probeUrl(u.toString());
      setSource({ kind: "link", url: u.toString(), probe });
      if (!title) setTitle(decodeURIComponent(u.pathname.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
      setHash({ ratio: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lien illisible.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    cancelHash.current = true;
    setSource(null);
    setHash({ ratio: 0 });
    setError("");
    if (input.current) input.current.value = "";
  };

  const start = async () => {
    if (!source) return;
    setStarting(true);
    const p = source.probe;
    const poster = p.poster ? await shrinkImage(p.poster, 240) : undefined;
    const name = source.kind === "file" ? source.file.name : source.url.split("/").pop() || "video";
    const pid = create({
      title,
      format,
      meta: {
        name,
        size: source.kind === "file" ? source.file.size : 0,
        type: source.kind === "file" ? source.file.type : "video/mp4",
        duration: p.duration,
        width: p.width,
        height: p.height,
        privacy,
        poster,
        sha256: source.kind === "file" ? hash.value : undefined,
        url: source.kind === "link" ? source.url : undefined,
      },
    });
    if (source.kind === "file") await keepVideo(pid, source.file, privacy === "publique");
    else setRemoteVideo(pid, source.url);
    void runAnalysis(pid);
    navigate(`/projet/${pid}/analyse`);
  };

  const policy = transparencyPolicy(format);
  const ready = source && (source.kind === "link" || hash.value);

  return (
    <>
      <PageHead title="Nouveau projet" lead="Importez la vidéo en derja à doubler. Elle est lue et analysée dans votre navigateur ; seules les informations nécessaires à l’analyse quittent votre ordinateur." />

      <div className="import">
        <div className="stack-lg">
          <Tabs
            label="Source de la vidéo"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setError("");
            }}
            tabs={[
              { value: "file", label: "Depuis cet appareil" },
              { value: "link", label: "Lien externe" },
            ]}
          />

          {!source && tab === "file" && (
            <label
              className={`dropzone tab-panel ${drag ? "drag" : ""}`}
              onDragEnter={(e) => (e.preventDefault(), setDrag(true))}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) void acceptFile(f);
              }}
            >
              <span className="dz-icon" aria-hidden>
                {busy ? <Loader2 className="spin" /> : <UploadCloud />}
              </span>
              <span className="dz-title">{busy ? "Lecture de la vidéo…" : drag ? "Déposez pour importer" : "Déposez votre vidéo ici"}</span>
              <span className="dz-text">Film, épisode, podcast vidéo ou Short, depuis votre ordinateur ou votre téléphone.</span>
              <span className="btn btn-secondary" aria-hidden>
                Choisir un fichier
              </span>
              <span className="dz-formats">MP4, MOV ou WebM · 4 Go au plus</span>
              <input ref={input} type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && acceptFile(e.target.files[0])} />
            </label>
          )}

          {!source && tab === "link" && (
            <div className="or-link tab-panel">
              <div className="field">
                <label htmlFor={ids.url}>Lien direct vers la vidéo</label>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="input-icon grow">
                    <Link2 aria-hidden />
                    <input id={ids.url} className="input" type="url" placeholder="https://exemple.tn/films/extrait.mp4" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && checkLink()} />
                  </span>
                  <button className="btn btn-secondary" onClick={checkLink} disabled={busy || !url.trim()}>
                    {busy ? <Loader2 className="spin" /> : null}
                    Vérifier le lien
                  </button>
                </div>
                <span className="hint">Lien compatible : fichier MP4 ou WebM accessible publiquement. La vidéo est lue depuis son adresse, sans copie sur nos serveurs.</span>
              </div>
            </div>
          )}

          {error && (
            <Callout tone="bad" role="alert" action={<button className="btn btn-ghost btn-sm btn-icon" onClick={() => setError("")} aria-label="Fermer"><X /></button>}>
              {error}
            </Callout>
          )}

          {source && (
            <div className="file-card">
              <div className={`file-thumb ${source.probe.poster ? "" : "file-thumb-empty"}`}>
                {source.probe.poster ? <img src={source.probe.poster} alt={`Miniature de la vidéo`} /> : <FileVideo aria-hidden />}
                <span className="dur">{formatDuration(source.probe.duration)}</span>
              </div>
              <div className="file-info">
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div className="stack-sm" style={{ minWidth: 0 }}>
                    <b className="ellipsis">{source.kind === "file" ? source.file.name : source.url}</b>
                    <div className="file-meta">
                      <span>
                        Durée <b className="num">{formatDuration(source.probe.duration)}</b>
                      </span>
                      {source.kind === "file" && (
                        <span>
                          Taille <b className="num">{formatSize(source.file.size)}</b>
                        </span>
                      )}
                      {source.probe.width > 0 && (
                        <span>
                          Image <b className="num">{source.probe.width}×{source.probe.height}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={clear}>
                    Changer
                  </button>
                </div>
                {source.kind === "file" ? (
                  <div className="upload-row">
                    <div className="row-between">
                      <span>{hash.value ? "Import local terminé" : "Import local et calcul de l’empreinte SHA-256"}</span>
                      <span className="num">{Math.round(hash.ratio * 100)} %</span>
                    </div>
                    <Progress value={hash.ratio} label="Progression de l’import" tone={hash.value ? "ok" : "info"} />
                    {hash.value && (
                      <span className="hint">
                        Empreinte <span className="mono">{hash.value.slice(0, 24)}…</span> <Prov kind="real" /> · reprise dans le Passeport 360°.
                      </span>
                    )}
                  </div>
                ) : (
                  <Callout tone="plain">Vidéo lue depuis son adresse. {source.probe.poster ? "" : "L’hébergeur n’autorise pas la lecture des images : la miniature et les images d’analyse ne sont pas disponibles."}</Callout>
                )}
              </div>
            </div>
          )}

          <section className="stack" aria-labelledby="meta-h">
            <h2 id="meta-h" className="h3" style={{ fontSize: 16 }}>
              Informations du projet
            </h2>
            <div className="field">
              <label htmlFor={ids.title}>Titre du projet</label>
              <input id={ids.title} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Le dernier car" />
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Format
              </legend>
              <div className="choices choices-3">
                {(Object.keys(FORMAT_LABEL) as VideoFormat[]).map((f) => (
                  <label key={f} className="choice">
                    <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
                    <span className="choice-radio" aria-hidden />
                    <b>{FORMAT_LABEL[f]}</b>
                    <span className="choice-text">
                      Label IA : {transparencyPolicy(f).label.toLowerCase()} · QR : {transparencyPolicy(f).qr.toLowerCase()}
                    </span>
                  </label>
                ))}
              </div>
              {policy.pending && <span className="hint">L’affichage du label IA sur les Reels et Shorts reste à confirmer (spécification V2, point ouvert).</span>}
            </fieldset>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Diffusion de la vidéo source
              </legend>
              <div className="choices choices-2">
                <label className="choice">
                  <input type="radio" name="privacy" checked={privacy === "publique"} onChange={() => setPrivacy("publique")} />
                  <span className="choice-radio" aria-hidden />
                  <b>Déjà publique</b>
                  <span className="choice-text">Gardée dans ce navigateur pour reprendre le projet plus tard.</span>
                </label>
                <label className="choice">
                  <input type="radio" name="privacy" checked={privacy === "inedite"} onChange={() => setPrivacy("inedite")} />
                  <span className="choice-radio" aria-hidden />
                  <b>Inédite</b>
                  <span className="choice-text">Rien n’est conservé après la session.</span>
                </label>
              </div>
            </fieldset>
          </section>

          <div className="step-foot">
            <span className="hint">L’analyse détecte les intervenants et propose des personnages. Elle ne prouve pas l’identité réelle des personnes.</span>
            <button className="btn btn-primary btn-lg" onClick={start} disabled={!ready || starting}>
              {starting ? <Loader2 className="spin" /> : null}
              Lancer l’analyse
              <ArrowRight />
            </button>
          </div>
        </div>

        <aside className="aside-facts" aria-label="Données et confidentialité">
          <div className="card">
            <div className="card-head">
              <h3>Ce qui se passe avec votre vidéo</h3>
            </div>
            <div className="card-body-tight">
              <ul className="fact-list">
                <li>
                  <HardDrive aria-hidden />
                  <span>
                    <b>Le fichier reste sur votre appareil</b>
                    <span>Il est lu par votre navigateur, jamais téléversé sur nos serveurs.</span>
                  </span>
                </li>
                <li>
                  <Fingerprint aria-hidden />
                  <span>
                    <b>Une empreinte SHA-256 est calculée</b>
                    <span>Elle identifie la source dans le Passeport 360° sans exposer la vidéo.</span>
                  </span>
                </li>
                <li>
                  <ScanEye aria-hidden />
                  <span>
                    <b>L’analyse lit l’audio et quelques images</b>
                    <span>Une ou deux images par réplique, pour identifier qui parle.</span>
                  </span>
                </li>
                <li>
                  <LockKeyhole aria-hidden />
                  <span>
                    <b>Les vidéos inédites ne sont pas conservées</b>
                    <span>Elles disparaissent de ce navigateur à la fin de la session.</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <Callout tone="info" title="Prototype">
            L’extraction des images et l’empreinte sont réelles. La transcription, la détection des intervenants et la traduction sont <b>simulées</b> avec des répliques d’exemple en derja.
          </Callout>
        </aside>
      </div>
    </>
  );
}
