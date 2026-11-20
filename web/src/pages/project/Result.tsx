import QRCode from "qrcode";
import { Captions, Download, FileBadge2, FileJson, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toSrt } from "../../core/srt";
import { encodePassport, type Passport360, type PassportFile } from "../../core/passport";
import { BACKEND } from "../../lib/backend";
import { audioKey, audioUrls, useStore, type Project } from "../../state/store";
import { useLineAudio } from "../../state/remote/generation";
import { fetchPublicPassport } from "../../state/remote/passports";
import { FORMAT_LABEL, transparencyPolicy } from "../../state/workflow";
import { Callout, KV, Prov, Status, timecode, toast, VoiceMark } from "../../ui/kit";
import { Mp4Item } from "./ExportMp4";
import { useVideoSrc, voiceInfo } from "./shared";

export function publicUrl(code: string) {
  return `${window.location.origin}/verifier#p=${code}`;
}

/** Back-end: the short link (identifier, read on the server, small QR). Simulated: the self-contained #p= link. */
export function passportUrl(p: Passport360): string {
  return BACKEND && p.identifiant ? `${window.location.origin}/verifier?id=${p.identifiant}` : publicUrl(encodePassport(p));
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video";

/**
 * Preview of the dubbed version with its transparency elements: the AI label at the beginning and,
 * for long formats, the QR code at the end. The image is the source video; French lines come from
 * the synthesized clips when they exist.
 */
function DubPlayer({ p, qr }: { p: Project; qr: string }) {
  const { src } = useVideoSrc(p);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const clock = useRef({ t: 0, last: 0 });
  const played = useRef(new Set<string>());
  const duration = p.video?.duration ?? Math.ceil((p.segments[p.segments.length - 1]?.end ?? 10) + 4);
  const policy = transparencyPolicy(p.format);
  const current = p.segments.find((s) => now >= s.start && now < s.end);

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      let t: number;
      const v = video.current;
      if (v) t = v.currentTime;
      else {
        if (playing) {
          clock.current.t = Math.min(duration, clock.current.t + (clock.current.last ? (ts - clock.current.last) / 1000 : 0));
          if (clock.current.t >= duration) setPlaying(false);
        }
        clock.current.last = ts;
        t = clock.current.t;
      }
      setNow((prev) => (Math.abs(prev - t) > 0.05 ? t : prev));
      const seg = p.segments.find((s) => t >= s.start && t < s.end);
      const url = seg ? audioUrls.get(audioKey(p.id, seg.id)) : undefined;
      if (v) v.volume += ((playing && url ? 0.12 : 1) - v.volume) * 0.25;
      if (playing && seg && url && !played.current.has(seg.id)) {
        played.current.add(seg.id);
        const a = new Audio(url);
        a.currentTime = Math.max(0, t - seg.start);
        void a.play().catch(() => {});
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.id, p.segments, duration, playing]);

  const toggle = () => {
    if (playing) {
      video.current?.pause();
      setPlaying(false);
    } else {
      if (!video.current && clock.current.t >= duration) clock.current.t = 0;
      if (video.current && video.current.ended) video.current.currentTime = 0;
      played.current.clear();
      clock.current.last = 0;
      void video.current?.play();
      setPlaying(true);
    }
  };
  const showLabel = now < 4;
  const showQr = policy.qrInVideo && now > duration - 5;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <div className="stage" onClick={toggle}>
        {src ? (
          <video ref={video} src={src} playsInline preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
        ) : (
          <div className="stage-placeholder">
            <div>
              <div className="stage-title">{p.title}</div>
              <p>Projet d’exemple sans fichier vidéo : l’aperçu montre la chronologie, les sous-titres et les éléments de transparence.</p>
            </div>
          </div>
        )}
        {showLabel && <span className="stage-label">Doublé avec l’IA · voix françaises générées</span>}
        {current?.translation && (
          <p className="stage-caption" key={current.id}>
            {current.translation}
          </p>
        )}
        {showQr && qr && (
          <div className="stage-qr" aria-label="QR code du Passeport 360° affiché à la fin">
            <span dangerouslySetInnerHTML={{ __html: qr }} />
            <small>Passeport 360°</small>
          </div>
        )}
        <button type="button" className={`stage-play ${playing ? "hide" : ""}`} aria-hidden tabIndex={-1}>
          <Play />
        </button>
      </div>
      <div className="transport">
        <button className="btn btn-dark btn-icon" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? <Pause /> : <Play />}
        </button>
        <span className="tc">
          {timecode(now)} / {timecode(duration)}
        </span>
        <span className="grow" />
        <span className="hint">Label IA : {policy.label.toLowerCase()} · QR : {policy.qr.toLowerCase()}</span>
      </div>
    </div>
  );
}

export default function Result({ p }: { p: Project }) {
  useLineAudio(p.id);
  const passport = useStore((s) => s.passports[p.id]);
  const journal = useStore((s) => s.journal);
  const logExport = useStore((s) => s.logExport);
  const [qr, setQr] = useState("");
  const url = useMemo(() => (passport ? passportUrl(passport) : ""), [passport]);
  useEffect(() => {
    if (url) void QRCode.toString(url, { type: "svg", errorCorrectionLevel: "L", margin: 0 }).then(setQr);
  }, [url]);
  const gens = Object.values(p.gens);
  const count = (k: string) => gens.filter((g) => g.status === k).length;
  const chars = Object.values(p.characters);

  return (
    <div className="result">
      <div className="stack-lg">
        <DubPlayer p={p} qr={qr} />
        <section className="card">
          <div className="card-head">
            <h2>Informations du projet</h2>
          </div>
          <div className="card-body-tight">
            <KV
              rows={[
                ["Titre", p.title],
                ["Format", FORMAT_LABEL[p.format]],
                ["Langues", "Derja tunisienne → Français"],
                ["Source", p.video ? `${p.video.name}${p.video.url ? " (lien externe)" : ""}` : "Projet d’exemple"],
                [
                  "Voix",
                  <div className="stack-sm">
                    {chars.map((c) => {
                      const info = voiceInfo(p, c.key);
                      return (
                        <span key={c.key} className="row" style={{ gap: 8 }}>
                          <VoiceMark name={info.name} kind={info.kind} size={20} />
                          {c.name} · {info.name} · <span className="muted">{info.label}</span>
                        </span>
                      );
                    })}
                  </div>,
                ],
                ["Validation humaine", `${p.segments.filter((s) => s.validated).length} / ${p.segments.length} répliques approuvées`],
                ["Génération", p.generation.finishedAt ? new Date(p.generation.finishedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "—"],
              ]}
            />
          </div>
        </section>
      </div>

      <aside className="sticky-aside">
        <div className="card">
          <div className="card-head">
            <h3>Statut</h3>
            <span className="card-actions">
              <Status tone="ok">Terminé</Status>
            </span>
          </div>
          <div className="card-body stack-sm">
            <span className="row">
              <span className="num strong">{count("ok")}</span> répliques synthétisées
            </span>
            {count("refused") > 0 && <span className="row"><span className="num strong">{count("refused")}</span> refusées par le moteur de règles</span>}
            {count("error") > 0 && <span className="row"><span className="num strong">{count("error")}</span> non synthétisées (moteur de voix indisponible)</span>}
            {count("skipped") > 0 && <span className="row"><span className="num strong">{count("skipped")}</span> en voix originale (rendu non branché)</span>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Téléchargements</h3>
          </div>
          <div className="card-body-tight">
            <ul className="dl-list">
              <Mp4Item p={p} fileName={`${slug(p.title)}.vf.mp4`} overlay={transparencyPolicy(p.format).qrInVideo && passport && url ? { label: passport.transparence.label, qrUrl: url } : undefined} />
              <li>
                <Captions aria-hidden />
                <span>
                  <b>Sous-titres français</b>
                  <span>Répliques approuvées, fichier .srt</span>
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    download(`${slug(p.title)}.fr.srt`, toSrt(p.segments), "application/x-subrip");
                    logExport("SOUS_TITRES_SRT", { projet: p.id });
                    toast("Sous-titres téléchargés", "ok");
                  }}
                >
                  <Download />
                  .srt
                </button>
              </li>
              <li>
                <FileJson aria-hidden />
                <span>
                  <b>Passeport 360° et journal</b>
                  <span>Dossier signé, vérifiable hors ligne</span>
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!passport}
                  onClick={async () => {
                    // Back-end mode: the chain exactly as the passport cites it, read from the server.
                    const file: PassportFile =
                      BACKEND && passport!.identifiant
                        ? await fetchPublicPassport(passport!.identifiant).then((r) => ({ passeport: r.passport, journal: r.journal }))
                        : { passeport: passport!, journal: journal.slice(0, passport!.responsabilite.nombre_entrees) };
                    download(`passeport-360-${slug(p.title)}.json`, JSON.stringify(file, null, 2), "application/json");
                    logExport("PASSEPORT_JSON", { projet: p.id });
                  }}
                >
                  <Download />
                  .json
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pp-card">
          <div className="pp-card-body">
            <div className="row-between">
              <b>Passeport 360°</b>
              <Prov kind="real">signé Ed25519</Prov>
            </div>
            <p className="hint">Public, sans compte, à partir d’une URL. Le QR code n’est qu’un moyen d’y accéder.</p>
            <div className="row">
              <Link to={`/passeports/${p.id}`} className="btn btn-primary btn-sm">
                <FileBadge2 />
                Ouvrir le passeport
              </Link>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  Page publique
                </a>
              )}
            </div>
          </div>
        </div>
        <Callout tone="plain">La vidéo d’origine reste sur votre appareil. Les fichiers téléchargés sont produits dans votre navigateur.</Callout>
      </aside>
    </div>
  );
}
