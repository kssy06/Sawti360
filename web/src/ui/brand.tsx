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

/** Mini logo: the « S. » of the wordmark (Playfair Display, outlined), on a dark tile. Same drawing as the favicon. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0a0a0a" stroke="#2a2a2a" />
      <path d="M12.38 5.34L12.38 5.34Q14.09 5.34 15.02 5.70Q15.95 6.07 16.61 6.47L16.61 6.47Q16.96 6.68 17.18 6.78Q17.40 6.88 17.60 6.88L17.60 6.88Q17.89 6.88 18.02 6.56Q18.15 6.24 18.24 5.60L18.24 5.60L18.91 5.60Q18.88 6.15 18.83 6.92Q18.79 7.69 18.78 8.94Q18.76 10.19 18.76 12.22L18.76 12.22L18.09 12.22Q17.98 10.71 17.40 9.29Q16.82 7.87 15.76 6.95Q14.70 6.04 13.16 6.04L13.16 6.04Q11.77 6.04 10.87 6.82Q9.97 7.60 9.97 9.00L9.97 9.00Q9.97 10.16 10.55 10.98Q11.13 11.81 12.25 12.59Q13.37 13.38 14.96 14.48L14.96 14.48Q16.35 15.38 17.46 16.28Q18.56 17.17 19.22 18.31Q19.89 19.44 19.89 21.00L19.89 21.00Q19.89 22.92 18.89 24.16Q17.89 25.41 16.27 26.03Q14.64 26.66 12.70 26.66L12.70 26.66Q10.90 26.66 9.83 26.31Q8.76 25.96 8.03 25.58L8.03 25.58Q7.39 25.18 7.04 25.18L7.04 25.18Q6.75 25.18 6.62 25.50Q6.49 25.82 6.41 26.45L6.41 26.45L5.74 26.45Q5.80 25.76 5.81 24.83Q5.83 23.90 5.84 22.41Q5.86 20.92 5.86 18.62L5.86 18.62L6.52 18.62Q6.64 20.54 7.17 22.21Q7.71 23.87 8.83 24.89Q9.94 25.90 11.80 25.90L11.80 25.90Q12.82 25.90 13.61 25.54Q14.41 25.18 14.90 24.45Q15.40 23.73 15.40 22.66L15.40 22.66Q15.40 21.44 14.83 20.54Q14.27 19.64 13.29 18.86Q12.32 18.07 11.05 17.26L11.05 17.26Q9.68 16.36 8.49 15.46Q7.31 14.56 6.60 13.40Q5.88 12.24 5.88 10.65L5.88 10.65Q5.88 8.82 6.80 7.65Q7.71 6.47 9.21 5.91Q10.70 5.34 12.38 5.34Z" fill="#f4f4f5" />
      <path d="M23.80 22.19L23.80 22.19Q24.93 22.19 25.59 22.79Q26.26 23.38 26.26 24.42L26.26 24.42Q26.26 25.47 25.59 26.06Q24.93 26.66 23.80 26.66L23.80 26.66Q22.66 26.66 22.00 26.06Q21.33 25.47 21.33 24.42L21.33 24.42Q21.33 23.38 22.00 22.79Q22.66 22.19 23.80 22.19Z" fill="#ff4500" />
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
