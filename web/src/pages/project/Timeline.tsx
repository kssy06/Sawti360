import { ArrowRight, AudioLines, Check, Loader2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { audioKey, audioUrls, useStore, type Project } from "../../state/store";
import { useLineAudio } from "../../state/remote/generation";
import { AudioClip, Callout, Prov, Segmented, Status, timecode, toast, VoiceMark } from "../../ui/kit";
import { useVideoSrc, voiceInfo } from "./shared";
import { StepFoot } from "./Workspace";

type Mode = "original" | "vf";

function parseTc(v: string): number | null {
  const m = v.trim().match(/^(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2].replace(",", "."));
}

/** Écran 11 — each line at its position in the video, editable, with its video passage. */
export default function Timeline({ p }: { p: Project }) {
  const { src, loading } = useVideoSrc(p);
  useLineAudio(p.id);
  const edit = useStore((s) => s.editTranslation);
  const setValidated = useStore((s) => s.setValidated);
  const patchProject = useStore((s) => s.patchProject);
  const generate = useStore((s) => s.generate);
  const video = useRef<HTMLVideoElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [mode, setMode] = useState<Mode>("vf");
  const [sel, setSel] = useState<string>(p.segments[0]?.id ?? "");
  const [stopAt, setStopAt] = useState<number | null>(null);
  const clock = useRef({ t: 0, last: 0 });
  const played = useRef(new Set<string>());
  const clips = useRef(new Map<string, HTMLAudioElement>());
  const duration = p.video?.duration ?? Math.ceil((p.segments[p.segments.length - 1]?.end ?? 10) + 1.5);
  const speakers = Object.keys(p.characters);
  const current = p.segments.find((s) => now >= s.start && now < s.end);

  const stopClips = useCallback(() => {
    clips.current.forEach((a) => a.pause());
    played.current.clear();
  }, []);

  // One animation loop drives the playhead, the virtual clock (no video file) and the French clips.
  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      let t: number;
      const v = video.current;
      if (v) t = v.currentTime;
      else {
        if (playing) {
          const dt = clock.current.last ? (ts - clock.current.last) / 1000 : 0;
          clock.current.t = Math.min(duration, clock.current.t + dt);
          if (clock.current.t >= duration) setPlaying(false);
        }
        clock.current.last = ts;
        t = clock.current.t;
      }
      if (head.current) head.current.style.left = `${(t / duration) * 100}%`;
      setNow((prev) => (Math.abs(prev - t) > 0.04 ? t : prev));
      if (stopAt !== null && t >= stopAt) {
        if (v) v.pause();
        setPlaying(false);
        setStopAt(null);
      }
      const seg = p.segments.find((s) => t >= s.start && t < s.end);
      const url = seg ? audioUrls.get(audioKey(p.id, seg.id)) : undefined;
      const dubbing = mode === "vf" && playing && seg && url;
      if (v) v.volume += ((dubbing ? 0.12 : 1) - v.volume) * 0.25;
      if (dubbing && seg && url && !played.current.has(seg.id)) {
        played.current.add(seg.id);
        let a = clips.current.get(seg.id);
        if (!a || a.src !== url) {
          a = new Audio(url);
          clips.current.set(seg.id, a);
        }
        a.currentTime = Math.max(0, t - seg.start);
        void a.play().catch(() => {});
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.id, p.segments, duration, mode, playing, stopAt]);

  useEffect(() => stopClips, [stopClips]);
  useEffect(() => {
    stopClips();
  }, [mode, stopClips]);
  // Whatever stopped playback (pause button, space bar, end of a passage, end of the video), the
  // French line that was speaking stops with it.
  useEffect(() => {
    if (!playing) stopClips();
  }, [playing, stopClips]);

  const seek = (t: number) => {
    stopClips();
    const x = Math.max(0, Math.min(duration - 0.05, t));
    if (video.current) video.current.currentTime = x;
    clock.current.t = x;
    setNow(x);
  };
  const play = () => {
    clock.current.last = 0;
    if (video.current) void video.current.play();
    setPlaying(true);
  };
  const pause = () => {
    video.current?.pause();
    setPlaying(false);
    stopClips();
  };
  const toggle = () => (playing ? pause() : play());
  const playPassage = (id: string) => {
    const s = p.segments.find((x) => x.id === id);
    if (!s) return;
    setSel(id);
    seek(Math.max(0, s.start - 0.2));
    setStopAt(s.end + 0.15);
    play();
  };
  const step = (d: number) => {
    const i = p.segments.findIndex((s) => s.id === sel);
    const n = p.segments[Math.max(0, Math.min(p.segments.length - 1, i + d))];
    if (n) {
      setSel(n.id);
      seek(n.start);
      document.getElementById(`tl-item-${n.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || (e.target as HTMLElement).isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowDown" || e.key === "j") step(1);
      else if (e.key === "ArrowUp" || e.key === "k") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ticks = useMemo(() => {
    const st = duration > 300 ? 60 : duration > 120 ? 30 : duration > 40 ? 10 : 5;
    return Array.from({ length: Math.floor(duration / st) + 1 }, (_, i) => i * st);
  }, [duration]);

  const setTime = (id: string, field: "start" | "end", value: string) => {
    const t = parseTc(value);
    const s = p.segments.find((x) => x.id === id);
    if (t === null || !s) return toast("Format attendu : mm:ss,s", "bad");
    const next = { ...s, [field]: Math.max(0, Math.min(duration, t)) };
    if (next.end - next.start < 0.3) return toast("La réplique doit durer au moins 0,3 s", "bad");
    patchProject(p.id, { segments: p.segments.map((x) => (x.id === id ? next : x)) });
  };

  const dubbed = p.segments.filter((s) => audioUrls.has(audioKey(p.id, s.id))).length;
  const approved = p.segments.filter((s) => s.validated).length;

  return (
    <>
      <div className="editor">
        <div className="stack" style={{ gap: 0 }}>
          <div className="stage" onClick={toggle}>
            {src ? (
              <video ref={video} src={src} playsInline preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onSeeking={stopClips} />
            ) : (
              <div className="stage-placeholder">
                <div>
                  <div className="stage-title">{p.title}</div>
                  <p>{loading ? "Chargement de la vidéo…" : p.example ? "Projet d’exemple sans fichier vidéo : la lecture suit la chronologie des répliques." : "Vidéo non disponible dans ce navigateur : ré-importez le fichier pour voir l’image."}</p>
                </div>
              </div>
            )}
            <span className="stage-label">{mode === "vf" ? "Version française" : "Original"}</span>
            {current && (mode === "vf" ? current.translation : current.source) && (
              <p className="stage-caption" key={current.id + mode} lang={mode === "vf" ? "fr" : "ar-TN"} dir={mode === "vf" ? "ltr" : "rtl"}>
                {mode === "vf" ? current.translation : current.source}
              </p>
            )}
            <button type="button" className={`stage-play ${playing ? "hide" : ""}`} aria-label="Lecture" tabIndex={-1}>
              <Play />
            </button>
          </div>

          <div className="transport">
            <button className="btn btn-secondary btn-icon btn-sm" onClick={() => step(-1)} aria-label="Réplique précédente">
              <SkipBack />
            </button>
            <button className="btn btn-dark btn-icon" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>
              {playing ? <Pause /> : <Play />}
            </button>
            <button className="btn btn-secondary btn-icon btn-sm" onClick={() => step(1)} aria-label="Réplique suivante">
              <SkipForward />
            </button>
            <span className="tc">
              {timecode(now)} / {timecode(duration)}
            </span>
            <span className="grow" />
            <span className="hint num">{dubbed ? `${dubbed} réplique${dubbed > 1 ? "s" : ""} avec audio` : "Pas encore d’audio français"}</span>
            <Segmented
              size="sm"
              label="Piste"
              value={mode}
              onChange={setMode}
              options={[
                { value: "original", label: "Original" },
                { value: "vf", label: "Version française" },
              ]}
            />
          </div>
          {dubbed === 0 && (
            <div className="tl-howto">
              <Callout tone="info" icon={AudioLines}>
                Pour entendre une réplique en français, sélectionnez-la puis cliquez sur <b>Aperçu audio</b> dans son détail. Pour doubler toutes les répliques d’un coup, passez à la{" "}
                <Link to={`/projet/${p.id}/generation`} className="link">
                  génération
                </Link>
                .
              </Callout>
            </div>
          )}

          <div className="tl" role="group" aria-label="Chronologie des répliques">
            <div className="tl-ruler" aria-hidden>
              {ticks.map((t) => (
                <span key={t} style={{ left: `${(t / duration) * 100}%` }}>
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
                const info = voiceInfo(p, sp);
                return (
                  <div key={sp} className="tl-row">
                    <span className="tl-label">
                      <VoiceMark name={info.name} kind={info.kind} size={18} />
                      {p.characters[sp].name}
                    </span>
                    <div className="tl-lane">
                      {p.segments
                        .filter((s) => s.speaker === sp)
                        .map((s) => {
                          const g = p.gens[s.id];
                          const cls = g?.status === "refused" ? "refused" : audioUrls.has(audioKey(p.id, s.id)) ? "dubbed" : s.validated ? "approved" : "";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`tl-seg ${cls} ${sel === s.id ? "selected" : ""} ${current?.id === s.id ? "live" : ""}`}
                              style={{ left: `${(s.start / duration) * 100}%`, width: `${Math.max(0.8, ((s.end - s.start) / duration) * 100)}%` }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSel(s.id);
                                seek(s.start);
                                document.getElementById(`tl-item-${s.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                              }}
                              aria-label={`Réplique de ${p.characters[sp].name} à ${timecode(s.start)}`}
                              title={s.translation}
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
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <span>
              <i className="tl-seg" style={{ position: "static", display: "inline-block", width: 18, height: 10 }} /> Proposée, à approuver
            </span>
            <span>
              <i className="tl-seg approved" style={{ position: "static", display: "inline-block", width: 18, height: 10 }} /> Approuvée
            </span>
            <span>
              <i className="tl-seg dubbed" style={{ position: "static", display: "inline-block", width: 18, height: 10 }} /> Audio français
            </span>
            <span>
              <i className="tl-seg refused" style={{ position: "static", display: "inline-block", width: 18, height: 10 }} /> Refusée par le moteur de règles
            </span>
            <span className="hint">Espace : lecture · flèches : réplique suivante</span>
          </div>
        </div>

        <div className="seg-list" aria-label="Répliques">
          {p.segments.map((s) => {
            const info = voiceInfo(p, s.speaker);
            const isSel = s.id === sel;
            const g = p.gens[s.id];
            const url = audioUrls.get(audioKey(p.id, s.id));
            return (
              <div
                key={s.id}
                id={`tl-item-${s.id}`}
                className={`seg-item ${isSel ? "selected" : ""} ${current?.id === s.id ? "live" : ""}`}
                onClick={() => !isSel && (setSel(s.id), seek(s.start))}
                aria-current={isSel || undefined}
              >
                <div className="seg-item-head">
                  <span className="mono">
                    {timecode(s.start)}–{timecode(s.end).slice(3)}
                  </span>
                  <b>{p.characters[s.speaker]?.name}</b>
                  <span className="grow" />
                  {s.validated ? <Status tone="ok">Approuvée</Status> : <Status tone="info">À approuver</Status>}
                </div>
                <p className="ar" lang="ar-TN">
                  {s.source}
                </p>
                {isSel ? (
                  <div className="stack-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="time-edit">
                      <label className="field">
                        <span className="label-sm">Début</span>
                        <input className="input" defaultValue={timecode(s.start)} key={`s${s.start}`} onBlur={(e) => e.target.value !== timecode(s.start) && setTime(s.id, "start", e.target.value)} aria-label="Début de la réplique" />
                      </label>
                      <label className="field">
                        <span className="label-sm">Fin</span>
                        <input className="input" defaultValue={timecode(s.end)} key={`e${s.end}`} onBlur={(e) => e.target.value !== timecode(s.end) && setTime(s.id, "end", e.target.value)} aria-label="Fin de la réplique" />
                      </label>
                    </div>
                    <label className="field">
                      <span className="label-sm">Traduction française</span>
                      <textarea className="textarea" rows={3} value={s.translation} onChange={(e) => edit(s.id, e.target.value)} lang="fr" />
                    </label>
                    <div className="row">
                      <VoiceMark name={info.name} kind={info.kind} size={22} />
                      <span className="cell-main grow">
                        <b style={{ fontSize: 13 }}>{info.name}</b>
                        <span>{info.label}</span>
                      </span>
                    </div>
                    {url && g?.status === "ok" && <AudioClip url={url} label={`réplique ${s.id}`} compact />}
                    {g?.status === "ok" && g.mock && <span className="hint">Moteur de voix en mode test : audio silencieux.</span>}
                    {g?.status === "refused" && (
                      <Callout tone="bad" title="Refusée, rien n’a été généré.">
                        {g.decision?.reason_fr} {g.decision?.detail ? `Détecté : ${g.decision.detail}.` : ""}
                      </Callout>
                    )}
                    {g?.status === "error" && <Callout tone="warn">{g.message}</Callout>}
                    <div className="row">
                      <button className="btn btn-secondary btn-sm" onClick={() => playPassage(s.id)}>
                        <Play />
                        Lire le passage
                      </button>
                      <button className="btn btn-secondary btn-sm approve-btn" aria-pressed={s.validated} onClick={() => setValidated(s.id, !s.validated)}>
                        <Check />
                        {s.validated ? "Approuvée" : "Approuver"}
                      </button>
                      {info.kind !== "original" && info.kind !== "none" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => generate(s.id)} disabled={g?.status === "pending"} title={!s.validated ? "La réplique doit être approuvée" : undefined}>
                          {g?.status === "pending" ? <Loader2 className="spin" /> : <AudioLines />}
                          Aperçu audio
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="fr">{s.translation}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        L’aperçu audio passe par le moteur de règles puis par le moteur de voix <Prov kind="real" /> : une réplique non approuvée ou une voix sans licence est refusée.
      </p>
      <StepFoot hint={approved < p.segments.length ? `${p.segments.length - approved} réplique${p.segments.length - approved > 1 ? "s" : ""} à approuver avant la génération.` : "Toutes les répliques sont approuvées."}>
        <Link to={`/projet/${p.id}/generation`} className="btn btn-primary">
          Passer à la génération
          <ArrowRight />
        </Link>
      </StepFoot>
    </>
  );
}
