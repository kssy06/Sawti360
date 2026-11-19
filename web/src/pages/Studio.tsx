import { ArrowLeft, ArrowRight, AudioLines, AudioWaveform, Captions, CircleAlert, Clapperboard, FileBadge2, Loader2, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { FR_CHARS_PER_SECOND, USES, VOICES, voiceById } from "../core/catalog";
import { costOf, fmt, split } from "../core/credits";
import { checkFidelity } from "../core/fidelity";
import { toSrt } from "../core/srt";
import type { Segment, Use } from "../core/types";
import { audioKey, audioUrls, balanceOf, useStore, type Project } from "../state/store";
import { ENGINE_TEXT, useEngineStatus } from "../ui/engine";
import { AnimatedNumber, AudioClip, LicenseStatus, Orb, Reveal, Status, timecode, toast } from "../ui/kit";
import { Analysis, SeenByAI, VideoDeck } from "./Video";

const TEST_VOICES = [
  { id: "voix_inconnue", label: "Voix importée sans passeport (test)" },
  { id: "voice_personnalite_publique", label: "Voix d’une personnalité publique (test)" },
];

function SegmentRow({ p, seg, active }: { p: Project; seg: Segment; active: boolean }) {
  const gen = p.gens[seg.id];
  const voiceId = p.speakerVoices[seg.speaker];
  const lic = useStore((s) => s.licenses.find((l) => l.voice_id === voiceId));
  const edit = useStore((s) => s.editTranslation);
  const setValidated = useStore((s) => s.setValidated);
  const generate = useStore((s) => s.generate);
  const voice = voiceById(voiceId);
  const alerts = checkFidelity(seg.source, seg.translation);
  const fieldId = useId();
  const url = audioUrls.get(audioKey(p.id, seg.id));
  const cost = costOf(seg.translation);
  const lowConf = seg.confidence < 0.8;
  const speakerName = p.speakers[seg.speaker]?.name ?? seg.speaker;

  const fixNumbers = (src: string[], tgt: string[]) => {
    let t = seg.translation;
    tgt.forEach((n, i) => (t = t.replace(new RegExp(`(?<![\\d])${n}(?![\\d])`), src[i])));
    edit(seg.id, t);
  };

  return (
    <article id={`seg-${seg.id}`} className={`seg ${seg.validated ? "is-valid" : ""} ${gen?.status === "refused" ? "is-refused" : ""} ${active ? "is-active" : ""}`} aria-label={`Réplique ${seg.id.slice(1)}`}>
      <div className="seg-meta">
        <span className="mono tc">
          {timecode(seg.start)} – {timecode(seg.end)}
        </span>
        <span className="speaker">
          {voice ? <Orb hue={voice.hue} size={18} neutral={voice.voice_id === "v_neutre"} /> : <span className="orb-missing" aria-hidden />}
          <b>{speakerName}</b>
          <span className="muted">· {voice?.name ?? "voix sans passeport"}</span>
        </span>
        {lowConf ? (
          <Status tone="warn" icon={TriangleAlert} title="Score de confiance de la transcription">
            Transcription incertaine ({Math.round(seg.confidence * 100)} %)
          </Status>
        ) : (
          <Status tone="muted" title="Score de confiance de la transcription">
            Transcription {Math.round(seg.confidence * 100)} %
          </Status>
        )}
      </div>

      <div className="seg-grid">
        <div className="seg-src">
          <span className="label">Derja · transcription</span>
          <p className="ar" lang="ar-TN">
            {seg.source}
          </p>
        </div>
        <div className="seg-tgt">
          <label className="label" htmlFor={fieldId}>
            Français · proposé par l’IA, à valider
          </label>
          <textarea id={fieldId} className="textarea" rows={2} value={seg.translation} onChange={(e) => edit(seg.id, e.target.value)} lang="fr" />
          <div className="tgt-meta">
            <span className="muted num">
              {cost} caractères · {cost} jetons
            </span>
            <Timing seconds={seg.end - seg.start} text={seg.translation} />
          </div>
        </div>
      </div>

      {p.kind === "video" && <SeenByAI p={p} segId={seg.id} context={seg.context} />}

      {alerts.map((a) => (
        <div key={a.type} className="line line-warn">
          <CircleAlert aria-hidden />
          <span className="grow">
            <b>{a.type === "CHIFFRES" ? "Chiffre modifié." : "Négation perdue."}</b> {a.message}
          </span>
          {a.type === "CHIFFRES" && a.source.length === a.target.length && a.source.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => fixNumbers(a.source, a.target)}>
              Remettre {a.source.join(", ")}
            </button>
          )}
        </div>
      ))}

      <footer className="seg-foot">
        <label className="check">
          <input type="checkbox" checked={seg.validated} onChange={(e) => setValidated(seg.id, e.target.checked)} />
          Texte validé
        </label>
        <span className="grow" />
        {gen?.status === "ok" && url ? <AudioClip url={url} label={`réplique ${seg.id.slice(1)}`} /> : null}
        <button className="btn btn-secondary btn-sm" onClick={() => generate(seg.id)} disabled={gen?.status === "pending"}>
          {gen?.status === "pending" ? <Loader2 className="spin" /> : <AudioLines />}
          {gen?.status === "ok" ? "Régénérer" : "Générer"}
        </button>
      </footer>

      <Reveal show={gen?.status === "pending"}>
        <p className="line">
          <Loader2 className="spin" aria-hidden />
          <span>Vérification du Passeport de voix, puis synthèse…</span>
        </p>
      </Reveal>
      <Reveal show={gen?.status === "refused"} nudge>
        {gen?.decision && (
          <div className="line line-red" role="alert">
            <ShieldX aria-hidden />
            <span className="grow">
              <b>Refusé, rien n’a été généré.</b> <span className="line-body">{gen.decision.reason_fr}
              {gen.decision.detail ? <> Détecté : {gen.decision.detail}.</> : null} Aucun jeton débité.</span>
            </span>
            <span className="mono line-code">{gen.decision.reason_code}</span>
          </div>
        )}
      </Reveal>
      <Reveal show={gen?.status === "ok"}>
        <p className="line line-ok">
          <ShieldCheck aria-hidden />
          <span>
            Autorisé par la licence <span className="mono">{gen?.decision?.license_id}</span> · {gen?.cost} jetons
            {gen?.ownerShare ? `, dont ${gen.ownerShare} pour ${lic?.holder_name ?? "le titulaire"}` : " pour Sawti (voix de base)"}
            {gen?.mock ? " · audio de test, moteur en mode test" : ""}
          </span>
        </p>
      </Reveal>
      <Reveal show={gen?.status === "error"}>
        <p className="line line-warn">
          <CircleAlert aria-hidden />
          <span className="grow">{gen?.message}</span>
        </p>
      </Reveal>
    </article>
  );
}

/** Time on screen versus the estimated French speaking time, recalculated as the line is edited. */
function Timing({ seconds, text }: { seconds: number; text: string }) {
  const spoken = [...text.trim()].length / FR_CHARS_PER_SECOND;
  const over = spoken > seconds + 0.2;
  const f = (n: number) => n.toFixed(1).replace(".", ",");
  return over ? (
    <Status tone="warn" icon={TriangleAlert} className="num timing" title="Estimation : 14 caractères par seconde en français parlé">
      ≈ {f(spoken)} s en français pour {f(seconds)} s à l’écran
    </Status>
  ) : (
    <span className="muted num timing" title="Estimation : 14 caractères par seconde en français parlé">
      {f(seconds)} s à l’écran · ≈ {f(spoken)} s en français
    </span>
  );
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Exports({ p }: { p: Project }) {
  const logExport = useStore((s) => s.logExport);
  const validated = p.segments.filter((s) => s.validated && s.translation.trim()).length;
  const slug = p.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video";
  return (
    <section className="insp-block">
      <h2 className="h-sm">Exporter</h2>
      <ul className="exports">
        <li>
          <Captions aria-hidden />
          <span>
            <b>Sous-titres français</b>
            <span className="muted">Fichier .srt des {validated} répliques validées.</span>
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!validated}
            onClick={() => {
              download(`${slug}.fr.srt`, toSrt(p.segments), "application/x-subrip");
              logExport("SOUS_TITRES_SRT", { projet: p.id, repliques: validated });
              toast("Sous-titres exportés", "ok");
            }}
          >
            .srt
          </button>
        </li>
        <li className="soon">
          <AudioWaveform aria-hidden />
          <span>
            <b>Piste audio française pour YouTube</b>
            <span className="muted">À ajouter comme langue audio dans YouTube Studio.</span>
          </span>
          <span className="muted soon-label">Bientôt</span>
        </li>
        <li className="soon">
          <Clapperboard aria-hidden />
          <span>
            <b>Vidéo doublée (MP4)</b>
            <span className="muted">Image d’origine, voix française mixée, faite dans le navigateur.</span>
          </span>
          <span className="muted soon-label">Bientôt</span>
        </li>
      </ul>
    </section>
  );
}

function Inspector({ p }: { p: Project }) {
  const licenses = useStore((s) => s.licenses);
  const setUse = useStore((s) => s.setUse);
  const setSpeakerVoice = useStore((s) => s.setSpeakerVoice);
  const generate = useStore((s) => s.generate);
  const balance = useStore(balanceOf);
  const engine = useEngineStatus();
  const [running, setRunning] = useState(false);

  const todo = p.segments.filter((s) => s.validated && p.gens[s.id]?.status !== "ok");
  const chars = todo.reduce((a, s) => a + costOf(s.translation), 0);
  const owners = todo.reduce((a, s) => {
    const lic = licenses.find((l) => l.voice_id === p.speakerVoices[s.speaker]);
    return a + (lic ? split(costOf(s.translation), lic.owner_share).owner : 0);
  }, 0);
  const validated = p.segments.filter((s) => s.validated).length;
  const base = VOICES.filter((v) => v.kind === "base");
  const holders = VOICES.filter((v) => v.kind === "consentie");

  const runAll = async () => {
    setRunning(true);
    for (const s of todo) await generate(s.id);
    setRunning(false);
    const st = useStore.getState().projects[p.id];
    const refused = todo.filter((s) => st?.gens[s.id]?.status === "refused").length;
    toast(refused ? `${todo.length - refused} générée(s), ${refused} refusée(s)` : `${todo.length} réplique(s) traitée(s)`, refused ? "red" : "ok");
  };

  return (
    <aside className="inspector">
      <section className="insp-block">
        <h2 className="h-sm">Voix des personnages</h2>
        {Object.entries(p.speakers).map(([key, sp]) => {
          const vid = p.speakerVoices[key];
          const lic = licenses.find((l) => l.voice_id === vid);
          const v = voiceById(vid);
          return (
            <div key={key} className="field">
              <label htmlFor={`voice-${key}`}>{sp.name}</label>
              <select id={`voice-${key}`} className="select" value={vid} onChange={(e) => setSpeakerVoice(key, e.target.value)}>
                <optgroup label="Voix de base Sawti · pour tous">
                  {base.map((bv) => (
                    <option key={bv.voice_id} value={bv.voice_id}>
                      {bv.name} · {bv.gender}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Voix de titulaires · 70 % reversés">
                  {holders.map((hv) => (
                    <option key={hv.voice_id} value={hv.voice_id}>
                      {hv.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tester un refus">
                  {TEST_VOICES.map((tv) => (
                    <option key={tv.id} value={tv.id}>
                      {tv.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="insp-lic">
                {v?.kind === "base" ? <Status tone="muted">Voix de base, synthèse</Status> : <LicenseStatus lic={lic} />}
                {lic && (
                  <Link to={`/voix?v=${lic.voice_id}`} className="hint">
                    Voir le passeport
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="insp-block">
        <div className="field">
          <label htmlFor="use">Usage de la version doublée</label>
          <select id="use" className="select" value={p.use} onChange={(e) => setUse(e.target.value as Use)}>
            {(Object.keys(USES) as Use[]).map((u) => (
              <option key={u} value={u}>
                {USES[u]}
              </option>
            ))}
          </select>
          <span className="hint">Chaque titulaire choisit les usages qu’il accepte.</span>
        </div>
      </section>

      <section className="insp-block">
        <h2 className="h-sm">Générer</h2>
        <dl className="sum num">
          <dt>Répliques validées</dt>
          <dd>
            {validated} / {p.segments.length}
          </dd>
          <dt>À générer</dt>
          <dd>{fmt.format(chars)} caractères</dd>
          <dt>Coût</dt>
          <dd>{fmt.format(chars)} jetons</dd>
          <dt>Dont versé aux titulaires</dt>
          <dd>{fmt.format(owners)} jetons</dd>
          <dt>Solde ensuite</dt>
          <dd>
            <AnimatedNumber value={Math.max(0, balance - chars)} /> jetons
          </dd>
        </dl>
        <button className="btn btn-primary" onClick={runAll} disabled={running || todo.length === 0}>
          {running ? <Loader2 className="spin" /> : <AudioLines />}
          {todo.length ? `Générer ${todo.length} réplique${todo.length > 1 ? "s" : ""} validée${todo.length > 1 ? "s" : ""}` : "Générer les répliques validées"}
        </button>
        {todo.length === 0 && <p className="hint">{validated ? "Toutes les répliques validées sont générées." : "Validez au moins une réplique : l’IA propose, l’humain décide."}</p>}
        <p className="hint">Avant chaque réplique : Passeport de voix vérifié dans le navigateur, puis à nouveau par le serveur, et filtre de contenu.</p>
        {engine !== "loading" && <p className={`hint ${engine === "off" ? "hint-warn" : ""}`}>{ENGINE_TEXT[engine]}</p>}
      </section>

      {p.kind === "video" && <Exports p={p} />}
    </aside>
  );
}

export default function Studio() {
  const { id } = useParams();
  const p = useStore((s) => (id ? s.projects[id] : undefined));
  const openProject = useStore((s) => s.openProject);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (id) openProject(id);
  }, [id, openProject]);

  if (!p) return <Navigate to="/projets" replace />;
  const validated = p.segments.filter((s) => s.validated).length;
  const done = Object.values(p.gens).filter((g) => g.status === "ok").length;
  const analysing = p.kind === "video" && p.pipeline?.status === "running";

  const pick = (segId: string) => {
    setActive(segId);
    const el = document.getElementById(`seg-${segId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  };

  return (
    <div className="page page-wide">
      <Link to="/projets" className="back">
        <ArrowLeft aria-hidden />
        Projets
      </Link>
      <div className="page-head">
        <div>
          <h1>{p.title}</h1>
          <p className="lead">
            {p.subtitle} · Derja tunisienne → Français
            {!analysing && ` · ${validated} réplique${validated > 1 ? "s" : ""} validée${validated > 1 ? "s" : ""} sur ${p.segments.length}`}
          </p>
        </div>
        {!analysing && (
          <div className="actions">
            <Link className="btn btn-secondary" to="/passeport">
              <FileBadge2 />
              {done ? "Exporter avec le Passeport 360°" : "Passeport 360°"}
              <ArrowRight />
            </Link>
          </div>
        )}
      </div>

      {analysing ? (
        <Analysis p={p} />
      ) : (
        <div className="studio-in">
          {p.kind === "video" && p.pipeline?.simulated && (
            <p className="sim-note">
              Démonstration de l’interface : les images viennent bien de votre vidéo, extraites dans votre navigateur ; la transcription et la traduction sont un exemple en derja, en attendant le branchement des API.
            </p>
          )}
          {p.kind === "video" && <VideoDeck p={p} active={active} onPick={pick} />}
          <div className="studio">
            <div className="segs">
              {p.segments.map((s) => (
                <SegmentRow key={s.id} p={p} seg={s} active={active === s.id} />
              ))}
            </div>
            <Inspector p={p} />
          </div>
        </div>
      )}
    </div>
  );
}
