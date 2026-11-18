import { CircleAlert, CircleCheck, CircleSlash, Clock3, Pause, Play, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { VoiceLicense } from "../core/types";

/** Voice identity: a soft two-hue orb, deterministic per voice (the reference's signature). */
export function Orb({ hue, size = 32, neutral = false }: { hue: [number, number]; size?: number; neutral?: boolean }) {
  const [a, b] = hue;
  const k = neutral ? 0 : 1;
  return (
    <span
      className="orb"
      aria-hidden
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, hsl(${a} ${90 * k}% 92%) 0%, transparent 46%),
          radial-gradient(circle at 70% 75%, hsl(${b} ${56 * k}% 58%) 0%, transparent 62%),
          linear-gradient(135deg, hsl(${a} ${50 * k}% 62%), hsl(${b} ${46 * k}% 46%))`,
      }}
    />
  );
}

export function licenseState(lic: VoiceLicense | undefined, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (!lic) return { key: "none", label: "Sans passeport", tone: "red" as const, Icon: ShieldX };
  if (lic.status === "revoked" || lic.revoked_at) return { key: "revoked", label: "Révoquée", tone: "red" as const, Icon: CircleSlash };
  if (today < lic.valid_from) return { key: "future", label: `Valide dès le ${frDate(lic.valid_from)}`, tone: "warn" as const, Icon: Clock3 };
  if (today > lic.valid_until) return { key: "expired", label: "Expirée", tone: "red" as const, Icon: CircleSlash };
  return { key: "valid", label: "Valide", tone: "ok" as const, Icon: ShieldCheck };
}

export function LicenseChip({ lic }: { lic: VoiceLicense | undefined }) {
  const st = licenseState(lic);
  return (
    <span className={`chip chip-${st.tone}`}>
      <st.Icon aria-hidden />
      {st.label}
    </span>
  );
}

export function frDate(iso: string, withTime = false): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleString("fr-FR", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" });
}

export function timecode(s: number): string {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${r}`;
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; tone: "ok" | "red" | "plain" };
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function toast(text: string, tone: Toast["tone"] = "plain") {
  const t = { id: Date.now() + Math.random(), text, tone };
  toasts = [...toasts, t].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, 3800);
}
export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          {t.tone === "red" ? <CircleAlert color="#ff9aa8" /> : <CircleCheck color="#9fe2bd" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- popover anchored to a button, escapes overflow via position: fixed ---------- */
export function Popover({
  anchor,
  open,
  onClose,
  align = "left",
  children,
  label,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  useEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    setPos(align === "left" ? { top: r.bottom + 6, left: r.left } : { top: r.bottom + 6, right: window.innerWidth - r.right });
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, align, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="pop" role="dialog" aria-label={label} style={pos}>
      {children}
    </div>
  );
}

/** Side sheet instead of a modal: the list stays visible, Escape closes it. */
export function Sheet({ title, onClose, children, head }: { title: string; onClose: () => void; children: ReactNode; head?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          {head}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </aside>
    </>
  );
}

/** Audio player whose waveform is computed from the returned audio itself. */
export function AudioClip({ url, label }: { url: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close();
        const data = decoded.getChannelData(0);
        const n = 56;
        const step = Math.max(1, Math.floor(data.length / n));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          let max = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) max = Math.max(max, Math.abs(data[j]));
          out.push(max);
        }
        const top = Math.max(...out, 0.0001);
        if (!cancelled) {
          setPeaks(out.map((v) => v / top));
          setDuration(decoded.duration);
        }
      } catch {
        if (!cancelled) setPeaks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  return (
    <div className="clip">
      <button className="btn btn-secondary btn-sm btn-icon" onClick={toggle} aria-label={playing ? `Pause : ${label}` : `Écouter : ${label}`}>
        {playing ? <Pause /> : <Play />}
      </button>
      <span className="wave" aria-hidden>
        {peaks === null
          ? Array.from({ length: 56 }, (_, i) => <i key={i} className="skeleton" style={{ height: "30%" }} />)
          : peaks.map((v, i) => <i key={i} style={{ height: `${Math.max(6, Math.round(v * 100))}%`, opacity: i / peaks.length <= progress ? 1 : 0.3 }} />)}
      </span>
      <span className="num muted clip-time">{duration ? `${duration.toFixed(1)} s` : ""}</span>
      <audio
        ref={audio}
        src={url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setProgress(0))}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
      />
    </div>
  );
}
