import { FileVideo, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { voiceById } from "../core/catalog";
import { getFrames, keepVideo, loadVideo, mediaVersion, subscribeMedia, videoUrl } from "../media/local";
import { isAnalysing, runAnalysis } from "../media/pipeline";
import { audioKey, audioUrls, PIPELINE_STEPS, type Project } from "../state/store";
import { DrawCheck, Orb, timecode, toast } from "../ui/kit";

export function useMedia() {
  return useSyncExternalStore(subscribeMedia, mediaVersion);
}

/** Loads the project's video from memory or IndexedDB; null while missing. */
export function useVideoSrc(p: Project): { src: string | null; loading: boolean } {
  useMedia();
  const [loading, setLoading] = useState(!videoUrl(p.id));
  useEffect(() => {
    let alive = true;
    if (videoUrl(p.id)) return setLoading(false);
    setLoading(true);
    loadVideo(p.id).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [p.id]);
  return { src: videoUrl(p.id), loading };
}

/* ---------------------------------------------------------------- analysis */

export function Analysis({ p }: { p: Project }) {
  const { src } = useVideoSrc(p);
  useMedia();
  const step = p.pipeline?.step ?? 0;
  useEffect(() => {
    if (p.pipeline?.status === "running" && !isAnalysing(p.id) && src) void runAnalysis(p.id);
  }, [p.id, p.pipeline?.status, src]);
  const strip = p.segments.flatMap((s, n) => getFrames(p.id, s.id).map((f, i) => ({ key: `${s.id}-${i}`, f, label: i === 0 ? `Réplique ${n + 1}` : "\u00a0" })));
  const translated = p.segments.filter((s) => s.translation).length;

  return (
    <div className="analysis">
      <div className="an-stage">
        {src ? <video className="an-video" src={src} autoPlay muted loop playsInline /> : <div className="an-video an-missing" />}
        <div className={`scan ${step === 2 ? "on" : ""}`} aria-hidden />
        <div className="an-badge">
          <span className="led led-mock pulse" aria-hidden />
          {PIPELINE_STEPS[Math.min(step, PIPELINE_STEPS.length - 1)].label}
        </div>
      </div>

      <ol className="steps" aria-label="Étapes de l’analyse">
        {PIPELINE_STEPS.map((st, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={st.key} className={`step ${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="step-mark">{state === "done" ? <DrawCheck size={22} /> : state === "active" ? <span className="spinner" /> : <span className="ring" />}</span>
              <span className="step-body">
                <b>{st.label}</b>
                <span className="muted">{st.detail}</span>
                {state === "active" && i === 2 && <span className="step-count num">Images regardées : {strip.length} / {p.segments.length * 2}</span>}
                {state === "active" && i === 3 && <span className="step-count num">Répliques traduites : {translated} / {p.segments.length}</span>}
                {state === "active" && <span className="step-bar" aria-hidden />}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="filmstrip" aria-label="Images regardées par l’IA">
        {strip.length === 0 ? (
          <p className="muted filmstrip-empty">Les images que l’IA regarde apparaîtront ici, une ou deux par réplique.</p>
        ) : (
          strip.map(({ key, f, label }) => (
            <figure key={key} className="frame-in">
              <img src={f} alt="" />
              <figcaption>{label}</figcaption>
            </figure>
          ))
        )}
      </div>
      <p className="hint an-note">Démonstration de l’interface : les images viennent bien de votre vidéo, extraites dans votre navigateur. La transcription et la traduction sont simulées en attendant le branchement des API.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- player + timeline */

type Mode = "original" | "vf";

export function VideoDeck({ p, active, onPick }: { p: Project; active: string | null; onPick: (segId: string) => void }) {
  const { src, loading } = useVideoSrc(p);
  const video = useRef<HTMLVideoElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [mode, setMode] = useState<Mode>("vf");
  const played = useRef(new Set<string>());
  const clips = useRef(new Map<string, HTMLAudioElement>());
  const duration = p.video?.duration ?? 1;
  const speakers = Object.keys(p.speakers);
  const current = p.segments.find((s) => now >= s.start && now < s.end);

  // Playhead and dub scheduling run on animation frames, so the line never lags the picture.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        const t = v.currentTime;
        if (head.current) head.current.style.left = `${(t / duration) * 100}%`;
        setNow((prev) => (Math.abs(prev - t) > 0.05 ? t : prev));
        const seg = p.segments.find((s) => t >= s.start && t < s.end);
        const url = seg ? audioUrls.get(audioKey(p.id, seg.id)) : undefined;
        const dubbing = mode === "vf" && !v.paused && seg && url;
        const target = dubbing ? 0.14 : 1;
        v.volume += (target - v.volume) * 0.25;
        if (dubbing && seg && url && !played.current.has(seg.id)) {
          played.current.add(seg.id);
          let a = clips.current.get(seg.id);
          if (!a || a.src !== url) {
            a = new Audio(url);
            clips.current.set(seg.id, a);
          }
          a.currentTime = Math.max(0, t - seg.start);
          void a.play();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.id, p.segments, duration, mode]);

  const stopClips = () => {
    clips.current.forEach((a) => a.pause());
    played.current.clear();
  };
  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    stopClips();
    v.currentTime = Math.max(0, Math.min(duration - 0.05, t));
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else {
      v.pause();
      stopClips();
    }
  };
  useEffect(() => stopClips, []);
  useEffect(() => stopClips(), [mode]);

  const ticks = useMemo(() => {
    const step = duration > 300 ? 60 : duration > 120 ? 30 : duration > 40 ? 10 : 5;
    return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
  }, [duration]);

  const reimport = async (f: File) => {
    if (p.video && (f.name !== p.video.name || f.size !== p.video.size)) {
      toast("Ce n’est pas la même vidéo que celle du projet", "red");
      return;
    }
    await keepVideo(p.id, f, p.video?.privacy === "publique");
  };

  const dubbedCount = p.segments.filter((s) => audioUrls.has(audioKey(p.id, s.id))).length;

  return (
    <section className="deck" aria-label="Lecteur vidéo">
      <div className="deck-stage" onClick={src ? toggle : undefined}>
        {src ? (
          <video
            ref={video}
            className="deck-video"
            src={src}
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeking={stopClips}
            onEnded={() => (setPlaying(false), stopClips())}
          />
        ) : (
          <div className="deck-missing">
            <FileVideo aria-hidden />
            <b>{loading ? "Chargement de la vidéo…" : "La vidéo n’est plus dans ce navigateur"}</b>
            {!loading && (
              <>
                <span className="muted">{p.video?.privacy === "inedite" ? "Vidéo inédite : elle n’est pas gardée après la session." : "Ré-importez le même fichier pour continuer."}</span>
                <label className="btn btn-secondary btn-sm" onClick={(e) => e.stopPropagation()}>
                  Ré-importer {p.video?.name}
                  <input type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && reimport(e.target.files[0])} />
                </label>
              </>
            )}
          </div>
        )}
        {src && (
          <span className={`big-play ${playing ? "hide" : ""}`} aria-hidden>
            <Play />
          </span>
        )}
        {src && mode === "vf" && current?.translation && (
          <p className="caption" key={current.id}>
            {current.translation}
          </p>
        )}
      </div>

      <div className="deck-bar">
        <button className="btn btn-secondary btn-sm btn-icon" onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? <Pause /> : <Play />}
        </button>
        <span className="mono deck-time">
          {timecode(now)} / {timecode(duration)}
        </span>
        <span className="grow" />
        <span className="hint num">{dubbedCount ? `${dubbedCount} réplique${dubbedCount > 1 ? "s" : ""} doublée${dubbedCount > 1 ? "s" : ""}` : "Générez des répliques pour entendre la version française"}</span>
        <div className="seg-ctrl" role="group" aria-label="Piste écoutée">
          <button aria-pressed={mode === "original"} onClick={() => setMode("original")}>
            Original
          </button>
          <button aria-pressed={mode === "vf"} onClick={() => setMode("vf")}>
            Version française
          </button>
        </div>
      </div>

      <div className="timeline" role="group" aria-label="Chronologie des répliques">
        <div className="tl-ruler" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ left: `${(t / duration) * 100}%` }} className="num">
              {timecode(t).replace(/\.\d$/, "")}
            </span>
          ))}
        </div>
        <div
          className="tl-tracks"
          onClick={(e) => {
            const lane = e.currentTarget.querySelector(".tl-lane");
            if (!lane) return;
            const r = lane.getBoundingClientRect();
            if (e.clientX >= r.left) seek(((e.clientX - r.left) / r.width) * duration);
          }}
        >
          {speakers.map((sp) => {
            const v = voiceById(p.speakerVoices[sp]);
            return (
              <div key={sp} className="tl-row">
                <span className="tl-label">
                  {v && <Orb hue={v.hue} size={14} neutral={v.voice_id === "v_neutre"} />}
                  {p.speakers[sp].name}
                </span>
                <div className="tl-lane">
                  {p.segments
                    .filter((s) => s.speaker === sp)
                    .map((s) => {
                      const g = p.gens[s.id];
                      const state = g?.status === "ok" && audioUrls.has(audioKey(p.id, s.id)) ? "ok" : g?.status === "refused" ? "refused" : g?.status === "pending" ? "pending" : s.validated ? "valid" : "todo";
                      return (
                        <button
                          key={s.id}
                          className={`tl-seg ${state} ${active === s.id ? "active" : ""} ${current?.id === s.id ? "live" : ""}`}
                          style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(0.6, ((s.end - s.start) / duration) * 100)}%` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            seek(s.start);
                            onPick(s.id);
                          }}
                          aria-label={`Réplique ${s.id.slice(1)}, ${timecode(s.start)}`}
                          title={s.translation || s.source}
                        />
                      );
                    })}
                </div>
              </div>
            );
          })}
          <div className="tl-head-wrap" aria-hidden>
            <div ref={head} className="tl-head" />
          </div>
        </div>
        <div className="tl-legend" aria-hidden>
          <span><i className="lg todo" />À valider</span>
          <span><i className="lg valid" />Validée</span>
          <span><i className="lg ok" />Doublée</span>
          <span><i className="lg refused" />Refusée</span>
        </div>
      </div>
    </section>
  );
}

/** Frames the vision model looked at for one line, with the context it drew from them. */
export function SeenByAI({ p, segId, context, fits, seconds }: { p: Project; segId: string; context?: string; fits?: boolean; seconds: number }) {
  useMedia();
  const frames = getFrames(p.id, segId);
  if (!context && frames.length === 0) return null;
  return (
    <div className="seen">
      {frames.length > 0 && (
        <span className="seen-frames">
          {frames.map((f, i) => (
            <img key={i} src={f} alt="" />
          ))}
        </span>
      )}
      <span className="seen-text">
        <span className="seen-label">
          <Sparkles aria-hidden />
          Ce que l’IA a vu
        </span>
        {context && <span>{context}</span>}
        {fits !== undefined && (
          <span className={`chip ${fits ? "chip-ok" : "chip-warn"} seen-fit num`}>
            {fits ? `Tient dans les ${seconds.toFixed(1).replace(".", ",")} s à l’écran` : `Trop long pour ${seconds.toFixed(1).replace(".", ",")} s : à raccourcir`}
          </span>
        )}
      </span>
    </div>
  );
}
