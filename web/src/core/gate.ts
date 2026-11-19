import { MAX_TTS_CHARS } from "./catalog.js";
import { sha256Hex } from "./canonical.js";
import { verifyLicense } from "./crypto.js";
import { authorize, decision } from "./rules.js";
import { checkText, type SafetyResult } from "./safety.js";
import type { Decision, Lang, Theme, Use, VoiceLicense } from "./types.js";

export interface GateInput {
  voice_id: string;
  text: string;
  use: Use;
  language: Lang;
  project_id: string;
  requested_by: string;
  human_validated: boolean;
}

export interface GateResult {
  decision: Decision;
  safety: SafetyResult;
  license: VoiceLicense | null;
}

/**
 * The single consent gate, run identically in the browser and in api/tts.ts:
 * licence rules first (who may speak, for what), then the content filter (what may be said).
 */
export function runGate(
  input: GateInput,
  licenses: VoiceLicense[],
  now: Date = new Date(),
  /** Restrictions only: themes added on top of the signed licence (never removed). */
  extraThemes: Theme[] = [],
): GateResult {
  const request = {
    request_id: sha256Hex(`${input.voice_id}|${input.text}|${now.toISOString()}`).slice(0, 16),
    voice_id: input.voice_id,
    project_id: input.project_id,
    use: input.use,
    language: input.language,
    requested_by: input.requested_by,
    text_hash: sha256Hex(input.text),
    timestamp: now.toISOString(),
    human_validated: input.human_validated,
  };
  const ruled = authorize(request, licenses, now, { signatureValid: verifyLicense });
  const license = licenses.find((l) => l.license_id === ruled.license_id) ?? licenses.find((l) => l.voice_id === input.voice_id) ?? null;
  if (!ruled.allowed) return { decision: ruled, safety: { ok: true }, license };

  if ([...input.text].length > MAX_TTS_CHARS) {
    return {
      decision: { ...decision("CONTENU_INTERDIT", now, license), reason_fr: `Texte trop long : ${MAX_TTS_CHARS} caractères au plus par réplique.` },
      safety: { ok: true },
      license,
    };
  }
  const themes = [...new Set([...(license?.forbidden_themes ?? []), ...extraThemes])];
  const safety = checkText(input.text, themes);
  if (!safety.ok) {
    const code = safety.layer === "red_line" ? "CONTENU_INTERDIT" : "THEME_INTERDIT_PAR_TITULAIRE";
    return { decision: decision(code, now, license, `${safety.label} · « ${safety.matched} »`), safety, license };
  }
  return { decision: ruled, safety, license };
}
