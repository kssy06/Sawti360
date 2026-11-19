import { useState, type CSSProperties } from "react";
import { Seal } from "./brand";
import { useReducedMotion, usePhases } from "./motion";

/**
 * The motto told in the product's own grammar, in three beats:
 *  1. « L’IA propose. »    written in the machine grey, over a dashed line;
 *  2. « L’humain décide. » the line closes in solid ink, the proposal turns ink, a check draws;
 *  3. « La confiance… »   the Passeport 360° seal stamps in.
 * The three principles below follow the beat. Hover or focus pauses; reduced motion shows the end state.
 */

const PRINCIPLES = [
  {
    title: "Chaque réplique validée par un humain",
    body: "Transcription et traduction sont des propositions. Rien n’est généré sans approbation explicite.",
  },
  {
    title: "Aucune voix sans accord",
    body: "Une voix originale reste bloquée tant que la personne, ou sa famille, n’a pas donné son autorisation.",
  },
  {
    title: "Un Passeport 360° public",
    body: "Chaque vidéo exportée est accompagnée d’un dossier signé, vérifiable par tous à partir d’une URL.",
  },
];

/** Words rise out of a blur one after another, the way a proposal comes into focus. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i, all) => (
        <span key={i} className="w" style={{ "--i": i } as CSSProperties}>
          {w}
          {i < all.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </>
  );
}

// reset · propose · decide · trust (held) · fade out
const DURATIONS = [400, 2800, 2800, 5800, 520];

export function Motto({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const { phase: running, cycle } = usePhases(DURATIONS, { paused, disabled: reduced });
  // Reduced motion: the complete, settled motto, no loop.
  const phase = reduced ? 3 : running;
  const at = (n: number) => (phase >= n ? "on" : "");
  const active = phase === 0 ? -1 : Math.min(2, phase - 1);

  return (
    <div className={`motto-wrap ${compact ? "compact" : ""}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <p className="sr-only">L’IA propose. L’humain décide. La confiance accompagne chaque export.</p>
      <div className={`motto ${phase === 0 ? "resetting" : ""} ${phase === 4 ? "fading" : ""} ${reduced ? "static" : ""}`} aria-hidden>
        <p className={`motto-line l1 ${at(1)} ${phase >= 2 ? "decided" : ""}`}>
          <span className="motto-text">
            <Words text="L’IA propose." />
            <span className="motto-rule">
              <i className="dash" />
              <i className="solid" />
            </span>
          </span>
        </p>
        <p className={`motto-line l2 ${at(2)}`}>
          <span className="motto-text">
            <Words text="L’humain décide." />
          </span>
          <svg className="motto-check" viewBox="0 0 20 20" width="22" height="22">
            <path d="M4 10.6l4 4L16.2 6" />
          </svg>
        </p>
        <div className={`motto-line l3 ${at(3)}`}>
          <span className="motto-text">
            <Words text="La confiance accompagne chaque export." />
          </span>
          <span className="motto-seal">
            <Seal size={compact ? 56 : 96} state="ok" />
            <i className="motto-ink" />
          </span>
        </div>
      </div>

      {!compact && <ol className="motto-principles" aria-label="Principes">
        {PRINCIPLES.map((p, i) => (
          <li key={p.title} className={!reduced && i === active ? "active" : ""}>
            {!reduced && <span className="motto-progress" key={`${cycle}-${i === active}`} style={{ animationDuration: `${DURATIONS[i + 1]}ms`, animationPlayState: paused ? "paused" : "running" }} />}
            <b>{p.title}</b>
            <p>{p.body}</p>
          </li>
        ))}
      </ol>}
    </div>
  );
}
