import "@fontsource/playfair-display/700.css";
import { Link } from "react-router-dom";

/** Eight-pointed star (khatam), the geometric figure of Tunisian zellige, drawn as two squares. */
function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts;
}

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="5" fill="#ff4500" />
      <rect x="9" y="9" width="14" height="14" fill="none" stroke="#0a0a0a" strokeWidth="1.6" />
      <rect x="9" y="9" width="14" height="14" fill="none" stroke="#0a0a0a" strokeWidth="1.6" transform="rotate(45 16 16)" />
      <rect x="14.6" y="14.6" width="2.8" height="2.8" fill="#0a0a0a" />
    </svg>
  );
}

/** Wordmark shared with the public home page: « Sawti 360. » in Playfair Display. */
export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand brand-word" aria-label="Sawti 360, accueil">
      Sawti 360.
    </Link>
  );
}

/**
 * The Passeport 360° seal: concentric rules, the khatam, and the verification state.
 * State is carried by the centre mark and the label, never by colour alone.
 */
export function Seal({ size = 120, state = "ok", label }: { size?: number; state?: "ok" | "bad" | "pending"; label?: string }) {
  const id = `seal-${state}-${size}`;
  // Drawn in currentColor so the seal follows the theme; the face takes the surface colour.
  const ink = "currentColor";
  const text = label ?? (state === "ok" ? "PASSEPORT 360° · SIGNATURE VÉRIFIÉE · " : state === "bad" ? "PASSEPORT 360° · SIGNATURE INVALIDE · " : "PASSEPORT 360° · EN ATTENTE DE SIGNATURE · ");
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={text.replace(/ · $/, "")} style={{ color: state === "bad" ? "var(--bad-ink)" : "var(--ink)" }}>
      <defs>
        <path id={id} d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
      </defs>
      <circle cx="50" cy="50" r="48" stroke={ink} strokeWidth="1.2" style={{ fill: "var(--surface)" }} />
      <circle cx="50" cy="50" r="31" fill="none" stroke={ink} strokeWidth="0.6" strokeDasharray={state === "pending" ? "2 2" : undefined} />
      <text style={{ fill: ink }}>
        <textPath href={`#${id}`} startOffset="0" textLength="236" lengthAdjust="spacing">
          {text}
        </textPath>
      </text>
      <polygon points={starPath(50, 50, 22).join(" ")} fill="none" stroke={ink} strokeWidth="1.1" />
      {state === "ok" && <path d="M41 50.5l6 6 12-13" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
      {state === "bad" && <path d="M43 43l14 14M57 43L43 57" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />}
      {state === "pending" && <circle cx="50" cy="50" r="3" fill={ink} />}
    </svg>
  );
}
