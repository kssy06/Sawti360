/**
 * The only server code of the prototype (Vercel function, Node runtime).
 * It holds the ElevenLabs key and re-runs the consent gate itself, so calling this
 * endpoint directly cannot bypass the Voice Passport or the content filter.
 *
 * Trust model of the demo: the licence registry below is the server's own copy.
 * The browser may only ADD restrictions (a revocation, extra forbidden themes), never remove one.
 */
import { MAX_TTS_CHARS, PROJECT, SEED_LICENSES, voiceById } from "../src/core/catalog.js";
import { signLicense } from "../src/core/crypto.js";
import { runGate } from "../src/core/gate.js";
import { THEMES } from "../src/core/safety.js";
import type { Lang, Theme, Use, VoiceLicense } from "../src/core/types.js";

const REGISTRY: VoiceLicense[] = SEED_LICENSES.map(signLicense);
const USES: Use[] = ["doublage_film", "doublage_video_en_ligne", "bande_annonce", "publicite", "contenu_politique", "contenu_intime"];
const LANGS: Lang[] = ["fr", "ar", "en"];
const MODEL = "eleven_multilingual_v2";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function GET(): Response {
  return json(200, {
    configured: Boolean(process.env.ELEVENLABS_API_KEY),
    mock: process.env.SAWTI_TTS_MOCK === "1",
    model: MODEL,
  });
}

interface Body {
  voice_id?: unknown;
  text?: unknown;
  use?: unknown;
  language?: unknown;
  human_validated?: unknown;
  revoked?: unknown;
  extra_themes?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { error: "REQUETE_INVALIDE", message: "Corps JSON attendu." });
  }
  const voiceId = typeof body.voice_id === "string" ? body.voice_id : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const use = USES.includes(body.use as Use) ? (body.use as Use) : null;
  const language = LANGS.includes(body.language as Lang) ? (body.language as Lang) : null;
  if (!voiceId || !text || !use || !language) {
    return json(400, { error: "REQUETE_INVALIDE", message: "voice_id, text, use et language sont obligatoires." });
  }
  if ([...text].length > MAX_TTS_CHARS) {
    return json(413, { error: "TEXTE_TROP_LONG", message: `${MAX_TTS_CHARS} caractères au plus par réplique.` });
  }

  const revoked = Array.isArray(body.revoked) ? body.revoked.filter((x): x is string => typeof x === "string") : [];
  const extraThemes = Array.isArray(body.extra_themes)
    ? body.extra_themes.filter((x): x is Theme => typeof x === "string" && x in THEMES)
    : [];
  const licenses = REGISTRY.map((l) =>
    revoked.includes(l.license_id) && l.status !== "revoked" ? { ...l, status: "revoked" as const, revoked_at: new Date().toISOString() } : l,
  );

  const gate = runGate(
    {
      voice_id: voiceId,
      text,
      use,
      language,
      project_id: PROJECT.id,
      requested_by: "api",
      human_validated: body.human_validated === true,
    },
    licenses,
    new Date(),
    extraThemes,
  );
  if (!gate.decision.allowed) return json(403, { decision: gate.decision });

  const voice = voiceById(voiceId);
  if (!voice) return json(403, { decision: { ...gate.decision, allowed: false, reason_code: "VOIX_NON_ENREGISTREE" } });

  const headers = {
    "content-type": "audio/mpeg",
    "cache-control": "no-store",
    "x-sawti-decision": gate.decision.reason_code,
    "x-sawti-license": gate.decision.license_id ?? "",
  };

  if (process.env.SAWTI_TTS_MOCK === "1") {
    return new Response(silentWav(0.6), { status: 200, headers: { ...headers, "content-type": "audio/wav", "x-sawti-mock": "1" } });
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return json(503, {
      decision: gate.decision,
      error: "SYNTHESE_NON_CONFIGUREE",
      message: "Autorisé par le Passeport de voix, mais la clé ElevenLabs n’est pas configurée sur ce déploiement.",
    });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.eleven_voice_id)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.55, similarity_boost: 0.75 } }),
    },
  );
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return json(502, {
      decision: gate.decision,
      error: "MOTEUR_VOIX_INDISPONIBLE",
      message: `Le moteur de voix a répondu ${upstream.status}.`,
      detail: detail.slice(0, 300),
    });
  }
  return new Response(upstream.body, { status: 200, headers });
}

/** A short silent WAV, used only when SAWTI_TTS_MOCK=1 for local interface tests. */
function silentWav(seconds: number): ArrayBuffer {
  const rate = 16000;
  const n = Math.round(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  return buf;
}
