import { useEffect, useRef, useState } from "react";

/** Live `prefers-reduced-motion` value. */
export function useReducedMotion(): boolean {
  const query = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
  const [reduced, setReduced] = useState(Boolean(query?.matches));
  useEffect(() => {
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return reduced;
}

const HEX = "0123456789abcdef";

/**
 * Text that resolves character by character, left to right, from random glyphs of the same alphabet.
 * Used for hashes, signatures and identifiers while a verification runs. The settled text is always
 * the real value; with reduced motion it is shown immediately.
 */
export function ScrambleText({ value, run, delay = 0, duration = 700, alphabet = HEX, className = "" }: { value: string; run: boolean; delay?: number; duration?: number; alphabet?: string; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (!run || reduced) {
      setShown(value);
      return;
    }
    let start = 0;
    const scramble = (locked: number) =>
      [...value]
        .map((ch, i) => (i < locked || ch === "…" || ch === "-" || ch === " " ? ch : alphabet[Math.floor(Math.random() * alphabet.length)]))
        .join("");
    setShown(scramble(0));
    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start - delay;
      if (t < 0) {
        if (Math.random() < 0.5) setShown(scramble(0));
      } else {
        const locked = Math.min(value.length, Math.floor((t / duration) * value.length));
        setShown(scramble(locked));
        if (locked >= value.length) return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, run, delay, duration, alphabet, reduced]);
  return (
    <span className={`mono scramble ${className}`} aria-label={value} title={value}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

/** Shortens a long hex value the way the interface shows it, so the scramble keeps the same width. */
export const shortHex = (v: string, n = 12) => (v.length > n * 2 ? `${v.slice(0, n)}…${v.slice(-4)}` : v);

/**
 * A timed sequence of phases that pauses while the tab is hidden or `paused` is set.
 * Returns the current phase index and a key that changes on every loop (to restart CSS animations).
 */
export function usePhases(durations: number[], { paused = false, loop = true, disabled = false }: { paused?: boolean; loop?: boolean; disabled?: boolean } = {}) {
  const [phase, setPhase] = useState(disabled ? durations.length - 1 : 0);
  const [cycle, setCycle] = useState(0);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    if (disabled) {
      setPhase(durations.length - 1);
      return;
    }
    if (paused || hidden) return;
    const last = phase === durations.length - 1;
    if (last && !loop) return;
    const t = setTimeout(() => {
      if (last) {
        setPhase(0);
        setCycle((c) => c + 1);
      } else setPhase(phase + 1);
    }, durations[phase]);
    return () => clearTimeout(t);
  }, [phase, paused, hidden, loop, disabled, durations]);
  return { phase, cycle };
}

/**
 * Press feedback: a soft ink ripple grows from the exact point where a button is pressed.
 * One delegated listener for the whole app; skipped under reduced motion.
 */
export function installPressRipple() {
  if (typeof document === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (reduce?.matches || e.button !== 0) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".btn:not(.btn-link):not(:disabled), .demo-account, .vopt:not(:disabled)");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--rx", `${e.clientX - r.left}px`);
      el.style.setProperty("--ry", `${e.clientY - r.top}px`);
      el.style.setProperty("--rs", `${Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2}px`);
      el.classList.remove("rippling");
      void el.offsetWidth;
      el.classList.add("rippling");
    },
    { passive: true },
  );
  document.addEventListener("animationend", (e) => {
    if ((e as AnimationEvent).animationName === "press-ripple") (e.target as HTMLElement).classList?.remove("rippling");
  });
}
