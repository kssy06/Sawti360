import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "../api/index.js";
import { setVerifierForTests } from "./auth.js";
import { parseDemoEmails, providersOf, readEnv, setEnvForTests } from "./env.js";
import { originalUrl } from "./vercel.js";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  setEnvForTests(null);
  setVerifierForTests(null);
});

describe("A1 · squelette d'API", () => {
  it("GET /api/health répond sans aucune clé, fournisseurs à null", async () => {
    setEnvForTests({});
    const r = await GET(new Request("http://x/api/health"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, backend: true, providers: { asr: null, llm1: null, llm2: null, dossier: null, tts: null, ttsMock: false, mail: false } });
    expect(body.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(body.services).toEqual({ database: false, auth: false, storage: false, signing: false });
  });

  it("GET /api/health nomme les modèles réellement configurés", async () => {
    setEnvForTests({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k", ELEVENLABS_API_KEY: "k", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", SAWTI_SIGNING_SEED: "1".repeat(64) });
    const body = await (await GET(new Request("http://x/api/health"))).json();
    expect(body.providers).toEqual({
      asr: "gemini-3.8-flash, bornes whisper-large-v3 (Groq)",
      llm1: "gemini-3.8-flash",
      llm2: "openai/gpt-oss-120b (Groq)",
      dossier: "gemini-3.8-flash",
      tts: "eleven_multilingual_v2",
      ttsMock: false,
      mail: true,
    });
    expect(body.services.signing).toBe(true);
  });

  it("chaîne de repli du LLM 2 et du dossier : Claude si sa clé existe", () => {
    const p = providersOf(readEnv({ ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-haiku-5-5" }));
    expect(p.llm2).toBe("claude-haiku-5-5");
    expect(p.dossier).toBe("claude-haiku-5-5");
    expect(p.llm1).toBeNull();
  });

  it("modèle Gemini de développement hors production seulement", () => {
    const dev = readEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL_DEV: "gemini-3.5-flash-lite" });
    const prod = readEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL_DEV: "gemini-3.5-flash-lite", VERCEL_ENV: "production" });
    expect(dev.models.gemini).toBe("gemini-3.5-flash-lite");
    expect(prod.models.gemini).toBe("gemini-3.8-flash");
  });

  it("une variable mal formée n'empêche pas l'API de démarrer", () => {
    const e = readEnv({ DATABASE_URL: "pas une url", SAWTI_SIGNING_SEED: "court", SMTP_PORT: "abc", APP_URL: "ftp://x" });
    expect(e.DATABASE_URL).toBeUndefined();
    expect(e.SAWTI_SIGNING_SEED).toBeUndefined();
    expect(e.SMTP_PORT).toBeUndefined();
    expect(e.appUrl).toBe("http://localhost:5173");
  });

  it("DEMO_EMAILS est lu en table", () => {
    expect(parseDemoEmails("nour=Equipe+Nour@gmail.com, lina = equipe+lina@gmail.com,bad,=x@y.z")).toEqual({
      nour: "equipe+nour@gmail.com",
      lina: "equipe+lina@gmail.com",
    });
  });

  it("GET /api/projects/x sans jeton : 401 JSON, pas la page HTML", async () => {
    const r = await GET(new Request("http://x/api/projects/x"));
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ error: "NON_CONNECTE", message: "Connexion requise." });
  });

  it("un jeton refusé par Supabase donne 401, un jeton valide passe au routage (404 JSON)", async () => {
    setVerifierForTests(async (t) => (t === "bon" ? { id: "00000000-0000-0000-0000-000000000001", email: "a@b.c" } : null));
    const bad = await GET(new Request("http://x/api/projects/x", { headers: { authorization: "Bearer mauvais" } }));
    expect(bad.status).toBe(401);
    const good = await GET(new Request("http://x/api/route-inconnue", { headers: { authorization: "Bearer bon" } }));
    expect(good.status).toBe(404);
    expect((await good.json()).error).toBe("INTROUVABLE");
  });

  it("la réécriture Vercel /api?__path=… est rendue au routeur", async () => {
    expect(originalUrl("https://s.app/api?__path=projects/x/characters/y&since=2026")).toBe("https://s.app/api/projects/x/characters/y?since=2026");
    expect(originalUrl("https://s.app/api/health")).toBe("https://s.app/api/health");
    expect(originalUrl("https://s.app/api?__path=")).toBe("https://s.app/api");
    const r = await GET(new Request("https://s.app/api?__path=health"));
    expect(r.status).toBe(200);
    expect((await r.json()).backend).toBe(true);
  });

  it("POST /api/tts garde son contrat (refus du thème interdit par Lina)", async () => {
    setEnvForTests({});
    const r = await POST(
      new Request("http://x/api/tts", {
        method: "POST",
        body: JSON.stringify({ voice_id: "v_lina", text: "Votez pour notre parti aux élections.", use: "doublage_film", language: "fr", human_validated: true }),
      }),
    );
    expect(r.status).toBe(403);
    expect((await r.json()).decision.reason_code).toBe("THEME_INTERDIT_PAR_TITULAIRE");
    const g = await GET(new Request("http://x/api/tts"));
    expect(await g.json()).toEqual({ configured: false, mock: false, model: "eleven_multilingual_v2" });
  });

  it("POST /api/tts en mode test : audio WAV signalé", async () => {
    setEnvForTests({ SAWTI_TTS_MOCK: "1" });
    const r = await POST(
      new Request("http://x/api/tts", {
        method: "POST",
        body: JSON.stringify({ voice_id: "v_lina", text: "Je t’attends devant la maison.", use: "doublage_film", language: "fr", human_validated: true }),
      }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("x-sawti-mock")).toBe("1");
    expect(r.headers.get("content-type")).toBe("audio/wav");
  });
});

/* ------------------------------------------------------------------ garde-fous de structure */

const RELATIVE = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

function relativeImports(file: string): { spec: string; typeOnly: boolean }[] {
  const src = readFileSync(file, "utf8");
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of src.matchAll(RELATIVE)) {
    const spec = m[3] ?? m[4];
    if (spec) out.push({ spec, typeOnly: Boolean(m[2]) });
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("garde-fous", () => {
  it("tout ce que la fonction Vercel charge utilise des imports relatifs en .js (Node ESM)", () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const { spec, typeOnly } of relativeImports(file)) {
        if (typeOnly) continue;
        if (!spec.endsWith(".js")) {
          bad.push(`${relative(WEB, file)} → ${spec}`);
          continue;
        }
        visit(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      }
    };
    visit(join(WEB, "api/index.ts"));
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });

  it("le navigateur n'importe jamais le code serveur", () => {
    const offenders = walk(join(WEB, "src"))
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => relativeImports(f).some(({ spec }) => resolve(dirname(f), spec).startsWith(join(WEB, "server"))));
    expect(offenders.map((f) => relative(WEB, f))).toEqual([]);
  });
});
