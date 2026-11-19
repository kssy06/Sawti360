/**
 * Server environment, read once and validated with zod.
 * A missing or malformed variable never crashes the API: the matching provider is reported
 * as `null` by GET /api/health and the routes that need it answer 503 NON_CONFIGURE.
 * Secrets live only in Vercel and in web/.env.local (ignored by git), never in the repository.
 */
import { z } from "zod";

const text = z.string().trim().min(1).optional().catch(undefined);
const httpUrl = z
  .string()
  .trim()
  .regex(/^https?:\/\/[^\s]+$/)
  .transform((v) => v.replace(/\/+$/, ""))
  .optional()
  .catch(undefined);
const hex64 = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/)
  .transform((v) => v.toLowerCase())
  .optional()
  .catch(undefined);
const flag = z
  .string()
  .trim()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true")
  .catch(false);
const port = z.coerce.number().int().min(1).max(65535).optional().catch(undefined);

const Schema = z.object({
  VERCEL_ENV: text,
  VERCEL_URL: text,
  APP_URL: httpUrl,

  SUPABASE_URL: httpUrl,
  VITE_SUPABASE_URL: httpUrl,
  SUPABASE_SECRET_KEY: text,
  DATABASE_URL: z
    .string()
    .trim()
    .regex(/^postgres(ql)?:\/\//)
    .optional()
    .catch(undefined),

  SAWTI_SIGNING_SEED: hex64,

  GROQ_API_KEY: text,
  GROQ_ASR_MODEL: text,
  GROQ_LLM_MODEL: text,
  GEMINI_API_KEY: text,
  GEMINI_MODEL: text,
  GEMINI_MODEL_DEV: text,
  GEMINI_ASR_MODEL: text,
  ANTHROPIC_API_KEY: text,
  CLAUDE_MODEL: text,
  ELEVENLABS_API_KEY: text,
  TTS_MODEL: text,
  SAWTI_TTS_MOCK: flag,

  SMTP_HOST: text,
  SMTP_PORT: port,
  SMTP_USER: text,
  SMTP_PASS: text,
  MAIL_FROM: text,

  DEMO_EMAILS: text,
  DEMO_PASSWORD: text,
});

type Raw = z.infer<typeof Schema>;

export interface Env extends Raw {
  /** Public address of the site, used in e-mailed links. */
  appUrl: string;
  /** Supabase project URL (server value, or the public one as a fallback). */
  supabaseUrl: string | undefined;
  /** `nour` → e-mail: the only accounts POST /api/demo/session may open. */
  demoEmails: Record<string, string>;
  isProduction: boolean;
  models: {
    groqAsr: string;
    groqLlm: string;
    /** Gemini model for analysis and dossiers: GEMINI_MODEL_DEV outside production when it is set. */
    gemini: string;
    /** Gemini model that writes the words; empty = the analysis call itself transcribes. */
    geminiAsr: string | undefined;
    claude: string;
    tts: string;
  };
}

export const DEFAULT_MODELS = {
  groqAsr: "whisper-large-v3",
  groqLlm: "openai/gpt-oss-120b",
  gemini: "gemini-3.8-flash",
  claude: "claude-opus-5-5",
  tts: "eleven_multilingual_v2",
} as const;

/** `nour=a@b.c,lina=d@e.f` → { nour: "a@b.c", lina: "d@e.f" } (malformed pairs are ignored). */
export function parseDemoEmails(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const [key, email] = pair.split("=").map((x) => x?.trim());
    if (key && email && /^[a-z0-9_-]+$/i.test(key) && /^[^\s@]+@[^\s@]+$/.test(email)) out[key.toLowerCase()] = email.toLowerCase();
  }
  return out;
}

export function readEnv(source: Record<string, string | undefined>): Env {
  const raw = Schema.parse(source);
  const isProduction = raw.VERCEL_ENV === "production";
  return {
    ...raw,
    appUrl: raw.APP_URL ?? (raw.VERCEL_URL ? `https://${raw.VERCEL_URL}` : "http://localhost:5173"),
    supabaseUrl: raw.SUPABASE_URL ?? raw.VITE_SUPABASE_URL,
    demoEmails: parseDemoEmails(raw.DEMO_EMAILS),
    isProduction,
    models: {
      groqAsr: raw.GROQ_ASR_MODEL ?? DEFAULT_MODELS.groqAsr,
      groqLlm: raw.GROQ_LLM_MODEL ?? DEFAULT_MODELS.groqLlm,
      gemini: (!isProduction && raw.GEMINI_MODEL_DEV) || raw.GEMINI_MODEL || DEFAULT_MODELS.gemini,
      geminiAsr: raw.GEMINI_ASR_MODEL,
      claude: raw.CLAUDE_MODEL ?? DEFAULT_MODELS.claude,
      tts: raw.TTS_MODEL ?? DEFAULT_MODELS.tts,
    },
  };
}

let cached: Env | null = null;

/** The environment of this instance (read on first use, then cached). */
export function env(): Env {
  return (cached ??= readEnv(process.env));
}

/** Tests only: forget the cached environment, or replace it. */
export function setEnvForTests(source: Record<string, string | undefined> | null): void {
  cached = source ? readEnv(source) : null;
}

export interface Providers {
  asr: string | null;
  llm1: string | null;
  llm2: string | null;
  dossier: string | null;
  tts: string | null;
  ttsMock: boolean;
  mail: boolean;
}

/** What GET /api/health reports: the model really used by each task, or null when no key is set. */
export function providersOf(e: Env): Providers {
  const groq = Boolean(e.GROQ_API_KEY);
  const gemini = Boolean(e.GEMINI_API_KEY);
  const claude = Boolean(e.ANTHROPIC_API_KEY);
  const writer = e.models.geminiAsr ?? e.models.gemini;
  return {
    asr: gemini
      ? groq
        ? `${writer}, bornes ${e.models.groqAsr} (Groq)`
        : writer
      : groq
        ? `${e.models.groqAsr} (Groq)`
        : null,
    llm1: gemini ? e.models.gemini : groq ? `${e.models.groqLlm} (Groq, texte seul)` : null,
    llm2: claude ? e.models.claude : groq ? `${e.models.groqLlm} (Groq)` : null,
    dossier: gemini ? e.models.gemini : claude ? e.models.claude : null,
    tts: e.ELEVENLABS_API_KEY ? e.models.tts : null,
    ttsMock: e.SAWTI_TTS_MOCK,
    mail: Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS),
  };
}

/** Infrastructure the back-end needs before any route can run for real. */
export function servicesOf(e: Env) {
  return {
    database: Boolean(e.DATABASE_URL),
    auth: Boolean(e.supabaseUrl && e.SUPABASE_SECRET_KEY),
    storage: Boolean(e.supabaseUrl && e.SUPABASE_SECRET_KEY),
    signing: Boolean(e.SAWTI_SIGNING_SEED),
  };
}
