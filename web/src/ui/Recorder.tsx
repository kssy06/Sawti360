import { RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudioClip, Callout } from "./kit";

export interface Recording {
  url: string;
  duration: number;
  peak: number;
  rms: number;
}

async function measure(blob: Blob): Promise<Omit<Recording, "url">> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sum += data[i] * data[i];
    }
    return { duration: buf.duration, peak, rms: Math.sqrt(sum / Math.max(1, data.length)) };
  } finally {
    void ctx.close();
  }
}

/**
 * Records the owner reading the generated paragraph with the real microphone, shows a live level,
 * then measures duration, peak and RMS of the recording. A file can be imported instead.
 */
export function Recorder({ onDone, minSeconds = 8, allowImport = true }: { onDone: (r: Recording | null) => void; minSeconds?: number; allowImport?: boolean }) {
  const [state, setState] = useState<"idle" | "rec" | "done" | "denied">("idle");
  const [levels, setLevels] = useState<number[]>(Array(40).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Recording | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const finish = async (blob: Blob) => {
    const m = await measure(blob).catch(() => ({ duration: 0, peak: 0, rms: 0 }));
    const r = { url: URL.createObjectURL(blob), ...m };
    setResult(r);
    setState("done");
    onDone(r);
  };

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.fftSize);
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(s);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        cancelAnimationFrame(raf.current);
        s.getTracks().forEach((t) => t.stop());
        void ctx.close();
        void finish(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
      };
      rec.current = mr;
      mr.start();
      setState("rec");
      const t0 = performance.now();
      const tick = () => {
        an.getByteTimeDomainData(data);
        let max = 0;
        for (const v of data) max = Math.max(max, Math.abs(v - 128) / 128);
        setLevels((l) => [...l.slice(1), max]);
        setElapsed((performance.now() - t0) / 1000);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setState("denied");
    }
  };

  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  const reset = () => {
    setResult(null);
    setState("idle");
    setElapsed(0);
    setLevels(Array(40).fill(0));
    onDone(null);
  };

  return (
    <div className="recorder">
      {state !== "done" ? (
        <div className="row" style={{ flexWrap: "nowrap", gap: 16 }}>
          <button type="button" className={`rec-btn ${state === "rec" ? "on" : ""}`} onClick={state === "rec" ? stop : start} aria-label={state === "rec" ? "Arrêter l’enregistrement" : "Commencer l’enregistrement"}>
            <span />
          </button>
          <div className="level" aria-hidden>
            {levels.map((v, i) => (
              <i key={i} className={state === "rec" ? "on" : ""} style={{ height: `${Math.max(6, Math.min(100, v * 260))}%` }} />
            ))}
          </div>
          <span className="mono num" style={{ minWidth: 52, textAlign: "right" }}>
            {elapsed.toFixed(1).replace(".", ",")} s
          </span>
        </div>
      ) : (
        result && <AudioClip url={result.url} label="votre enregistrement" />
      )}
      <div className="row-between">
        <span className="hint">
          {state === "idle" && "Cliquez sur le bouton rouge, lisez le paragraphe à voix haute, puis arrêtez l’enregistrement."}
          {state === "rec" && (elapsed < minSeconds ? `Continuez la lecture… (${Math.ceil(minSeconds - elapsed)} s au minimum)` : "Vous pouvez arrêter quand vous avez terminé.")}
          {state === "done" && "Enregistrement terminé. Écoutez-le avant de continuer."}
          {state === "denied" && "Accès au micro refusé ou indisponible."}
        </span>
        <span className="row">
          {state === "done" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              <RotateCcw />
              Recommencer
            </button>
          )}
          {allowImport && state !== "rec" && (
            <label className="btn btn-ghost btn-sm">
              <Upload />
              Importer un fichier audio
              <input type="file" accept="audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && finish(e.target.files[0])} />
            </label>
          )}
        </span>
      </div>
      {state === "denied" && <Callout tone="warn">{allowImport ? "Autorisez le micro dans votre navigateur, ou importez un enregistrement existant." : "Autorisez le micro dans votre navigateur pour enregistrer votre voix : le Passeport de voix se crée uniquement avec un enregistrement fait ici."}</Callout>}
    </div>
  );
}
