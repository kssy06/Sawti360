import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appendEntry } from "../core/audit";
import { sha256Hex } from "../core/canonical";
import { PROJECT, SEED_LICENSES, SEED_SEGMENTS, SPEAKERS, voiceById } from "../core/catalog";
import { costOf, PLANS, split, type PlanId } from "../core/credits";
import { signLicense } from "../core/crypto";
import { runGate } from "../core/gate";
import { assemblePassport, signPassport, type Passport360 } from "../core/passport";
import { REASONS_FR } from "../core/rules";
import type { AuditEntry, Decision, Segment, Theme, Use, VoiceLicense } from "../core/types";

export type Persona = "creator" | "owner";
export const OWNER_VOICE = "v_lina";
export const CREATOR = { name: "Nour Films", role: "Studio de création · Tunis" };
export const OWNER = { name: "Lina M.", role: "Comédienne · titulaire de voix" };
export const DEMO_ID = PROJECT.id;

export interface GenState {
  status: "pending" | "ok" | "refused" | "error";
  decision?: Decision;
  message?: string;
  chars?: number;
  cost?: number;
  ownerShare?: number;
  ms?: number;
  bytes?: number;
  mock?: boolean;
  at?: string;
  by?: "client" | "server";
}

export interface UsageRow {
  id: string;
  at: string;
  project: string;
  creator: string;
  voice_id: string;
  chars: number;
  cost: number;
  owner: number;
  platform: number;
  ms?: number;
  bytes?: number;
}

export interface Notice {
  id: string;
  persona: Persona;
  at: string;
  tone: "ok" | "red" | "plain";
  title: string;
  body: string;
  read: boolean;
}

export type Privacy = "publique" | "inedite";

export interface VideoMeta {
  name: string;
  size: number;
  type: string;
  duration: number;
  width: number;
  height: number;
  privacy: Privacy;
  /** Small JPEG of one frame, shown in the project list. */
  poster?: string;
}

/** Steps shown while a video is analysed. In this UI build they are simulated (see pipeline.ts). */
export const PIPELINE_STEPS = [
  { key: "audio", label: "Extraction de la piste audio", detail: "Dans votre navigateur : la vidéo ne quitte pas votre ordinateur." },
  { key: "speakers", label: "Qui parle, et quand", detail: "Transcription de la derja et séparation des voix." },
  { key: "frames", label: "L’IA regarde les images", detail: "Une ou deux images par réplique : qui parle, à qui, où." },
  { key: "translate", label: "Traduction avec le contexte", detail: "Genre, tutoiement, durée à l’écran : une réplique qui tient dans la bouche." },
] as const;

export interface Pipeline {
  status: "running" | "done";
  step: number;
  simulated: true;
}

export interface Speaker {
  name: string;
  gender: "femme" | "homme" | "inconnu";
}

export interface Project {
  id: string;
  title: string;
  subtitle: string;
  kind: "demo" | "video";
  createdAt: string;
  video?: VideoMeta;
  pipeline?: Pipeline;
  segments: Segment[];
  speakers: Record<string, Speaker>;
  speakerVoices: Record<string, string>;
  use: Use;
  gens: Record<string, GenState>;
}

interface Data {
  persona: Persona;
  plan: PlanId;
  spent: number;
  licenses: VoiceLicense[];
  projects: Record<string, Project>;
  order: string[];
  currentId: string;
  usage: UsageRow[];
  notifications: Notice[];
  journal: AuditEntry[];
  passports: Record<string, Passport360>;
  validator: string;
}

interface Actions {
  setPersona: (p: Persona) => void;
  setPlan: (p: PlanId) => void;
  openProject: (id: string) => void;
  createVideoProject: (meta: VideoMeta) => string;
  patchProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setUse: (u: Use) => void;
  setSpeakerVoice: (speaker: string, voiceId: string) => void;
  editTranslation: (id: string, text: string) => void;
  setValidated: (id: string, v: boolean) => void;
  generate: (id: string) => Promise<void>;
  tryVoice: (voiceId: string, text: string) => Promise<GenState & { url?: string }>;
  updateOwnLicense: (patch: Pick<VoiceLicense, "allowed_uses" | "forbidden_themes">) => void;
  revoke: (licenseId: string) => void;
  reinstate: (licenseId: string) => void;
  exportPassport: () => Passport360;
  logExport: (kind: string, detail: Record<string, unknown>) => void;
  markRead: (p: Persona) => void;
  reset: () => void;
}

export type Store = Data & Actions;

/** Audio is kept in memory only (object URLs keyed by project and segment), never persisted. */
export const audioUrls = new Map<string, string>();
export const audioKey = (projectId: string, segId: string) => `${projectId}/${segId}`;

const id = () => Math.random().toString(36).slice(2, 10);
const at = (iso: string) => new Date(iso);

/** Browser storage can be missing or blocked (private mode, previews): fall back to memory. */
function safeStorage(): Storage {
  try {
    const k = "__sawti_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => void mem.set(key, value),
      removeItem: (key) => void mem.delete(key),
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
  }
}

function demoProject(): Project {
  return {
    id: DEMO_ID,
    title: PROJECT.title,
    subtitle: PROJECT.subtitle,
    kind: "demo",
    createdAt: "2026-11-14T10:00:00Z",
    segments: SEED_SEGMENTS.map((s) => ({ ...s })),
    speakers: { amel: { name: "Amel", gender: "femme" }, yassine: { name: "Yassine", gender: "homme" } },
    speakerVoices: Object.fromEntries(Object.entries(SPEAKERS).map(([k, v]) => [k, v.defaultVoice])),
    use: "doublage_film",
    gens: {},
  };
}

function seed(): Data {
  const licenses = SEED_LICENSES.map(signLicense);
  let journal: AuditEntry[] = [];
  const signedAt = ["2026-10-28T09:00:00Z", "2026-10-29T14:20:00Z", "2026-10-30T10:05:00Z", "2026-05-30T11:40:00Z", "2026-11-03T16:10:00Z"];
  licenses.forEach((l, i) => {
    journal = appendEntry(journal, "plateforme", "LICENCE_SIGNEE", { license_id: l.license_id, signature: l.signature }, "OK", at(signedAt[i] ?? "2026-10-27T08:00:00Z"));
  });
  journal = appendEntry(journal, "Hédi R.", "LICENCE_REVOQUEE", { license_id: "VL-2026-0004" }, "REVOQUEE", at("2026-11-10T09:12:00Z"));
  const prior: UsageRow[] = [
    { id: "u1", at: "2026-11-06T18:22:00Z", project: "Bledi, épisode 4", creator: "Atelier Bledi", voice_id: "v_lina", chars: 812, cost: 812, owner: 568, platform: 244 },
    { id: "u2", at: "2026-11-12T11:05:00Z", project: "Hkeyet, podcast", creator: "Studio Hkeyet", voice_id: "v_lina", chars: 640, cost: 640, owner: 448, platform: 192 },
    { id: "u3", at: "2026-11-14T15:47:00Z", project: "Bledi, épisode 5", creator: "Atelier Bledi", voice_id: "v_lina", chars: 341, cost: 341, owner: 238, platform: 103 },
  ];
  prior.forEach((u) => {
    journal = appendEntry(journal, u.creator, "GENERATION_AUTORISEE", { license_id: "VL-2026-0001", chars: u.chars }, "OK", at(u.at));
  });
  const demo = demoProject();
  return {
    persona: "creator",
    plan: "createur",
    spent: 0,
    licenses,
    projects: { [demo.id]: demo },
    order: [demo.id],
    currentId: demo.id,
    usage: prior,
    notifications: [
      { id: "n1", persona: "owner", at: "2026-11-14T15:47:00Z", tone: "ok", title: "Votre voix a été utilisée", body: "Atelier Bledi · « Bledi, épisode 5 » · 341 caractères · +238 jetons", read: true },
      { id: "n0", persona: "owner", at: "2026-11-12T11:05:00Z", tone: "ok", title: "Votre voix a été utilisée", body: "Studio Hkeyet · « Hkeyet, podcast » · 640 caractères · +448 jetons", read: true },
    ],
    journal,
    passports: {},
    validator: "Nour Films (adaptatrice)",
  };
}

export const balanceOf = (s: Pick<Data, "plan" | "spent">) => Math.max(0, PLANS[s.plan].monthly - s.spent);
export const earningsOf = (s: Pick<Data, "usage">, voiceId: string) =>
  s.usage.filter((u) => u.voice_id === voiceId).reduce((a, u) => a + u.owner, 0);
export const currentProject = (s: Pick<Data, "projects" | "currentId">): Project => s.projects[s.currentId] ?? s.projects[DEMO_ID];

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const log = (actor: string, action: string, payload: unknown, decisionCode = "") =>
        set((s) => ({ journal: appendEntry(s.journal, actor, action, payload, decisionCode) }));
      const notify = (n: Omit<Notice, "id" | "at" | "read">) =>
        set((s) => ({ notifications: [{ ...n, id: id(), at: new Date().toISOString(), read: false }, ...s.notifications] }));
      const restrictions = () => {
        const s = get();
        return {
          revoked: s.licenses.filter((l) => l.status === "revoked").map((l) => l.license_id),
          extra_themes: [...new Set(s.licenses.flatMap((l) => l.forbidden_themes))] as Theme[],
        };
      };
      const patchCurrent = (fn: (p: Project) => Partial<Project>) =>
        set((s) => {
          const p = currentProject(s);
          return { projects: { ...s.projects, [p.id]: { ...p, ...fn(p) } } };
        });

      /** Gate in the browser, then the same gate again on the server, then payment. */
      async function synthesize(voiceId: string, text: string, humanValidated: boolean, label: string): Promise<GenState & { url?: string }> {
        const s = get();
        const project = currentProject(s);
        const cost = costOf(text);
        const gate = runGate(
          { voice_id: voiceId, text, use: project.use, language: "fr", project_id: PROJECT.id, requested_by: CREATOR.name, human_validated: humanValidated },
          s.licenses,
        );
        if (!gate.decision.allowed) {
          log(CREATOR.name, "GENERATION_REFUSEE", { voice_id: voiceId, text_hash: sha256Hex(text), code: gate.decision.reason_code }, gate.decision.reason_code);
          if (gate.decision.reason_code === "THEME_INTERDIT_PAR_TITULAIRE" && voiceId === OWNER_VOICE) {
            notify({ persona: "owner", tone: "red", title: "Tentative bloquée sur votre voix", body: `${CREATOR.name} · ${gate.decision.detail ?? ""} · aucun audio généré` });
          }
          return { status: "refused", decision: gate.decision, chars: cost, by: "client" };
        }
        if (cost > balanceOf(s)) {
          return { status: "error", decision: gate.decision, message: `Jetons insuffisants : ${cost} nécessaires.`, chars: cost };
        }
        const t0 = performance.now();
        let res: Response;
        try {
          res = await fetch("/api/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ voice_id: voiceId, text, use: project.use, language: "fr", human_validated: humanValidated, ...restrictions() }),
          });
        } catch {
          return { status: "error", decision: gate.decision, message: "Serveur injoignable : vérifiez la connexion.", chars: cost };
        }
        const ms = Math.round(performance.now() - t0);
        if (res.status === 403) {
          const body = await res.json();
          log(CREATOR.name, "GENERATION_REFUSEE", { voice_id: voiceId, text_hash: sha256Hex(text), code: body.decision.reason_code, par: "serveur" }, body.decision.reason_code);
          return { status: "refused", decision: body.decision, chars: cost, by: "server" };
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { status: "error", decision: gate.decision, message: body.message ?? `Erreur ${res.status}`, chars: cost, ms };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const lic = gate.license!;
        const parts = split(cost, lic.owner_share);
        const row: UsageRow = { id: id(), at: new Date().toISOString(), project: `${project.title}, ${label}`, creator: CREATOR.name, voice_id: voiceId, chars: cost, cost, owner: parts.owner, platform: parts.platform, ms, bytes: blob.size };
        set((st) => ({ spent: st.spent + cost, usage: [row, ...st.usage] }));
        log(CREATOR.name, "GENERATION_AUTORISEE", { voice_id: voiceId, license_id: lic.license_id, text_hash: sha256Hex(text), jetons: cost, titulaire: parts.owner }, "OK");
        if (lic.owner_share > 0) {
          notify({
            persona: voiceId === OWNER_VOICE ? "owner" : "creator",
            tone: "ok",
            title: voiceId === OWNER_VOICE ? "Votre voix a été utilisée" : `${lic.holder_name} a été rémunéré·e`,
            body: `${CREATOR.name} · « ${project.title} » · ${cost} caractères · +${parts.owner} jetons`,
          });
        }
        return {
          status: "ok", decision: gate.decision, chars: cost, cost, ownerShare: parts.owner, ms, bytes: blob.size,
          mock: res.headers.get("x-sawti-mock") === "1", at: new Date().toISOString(), by: "server", url,
        };
      }

      return {
        ...seed(),
        setPersona: (persona) => set({ persona }),
        setPlan: (plan) => set({ plan }),
        openProject: (pid) => set((s) => (s.projects[pid] ? { currentId: pid } : {})),
        createVideoProject: (meta) => {
          const pid = `v_${id()}`;
          const title = meta.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Vidéo";
          const project: Project = {
            id: pid,
            title,
            subtitle: `Vidéo · ${meta.privacy === "publique" ? "déjà publique" : "inédite"}`,
            kind: "video",
            createdAt: new Date().toISOString(),
            video: meta,
            pipeline: { status: "running", step: 0, simulated: true },
            segments: [],
            speakers: {},
            speakerVoices: {},
            use: "doublage_video_en_ligne",
            gens: {},
          };
          set((s) => ({ projects: { ...s.projects, [pid]: project }, order: [pid, ...s.order], currentId: pid }));
          log(CREATOR.name, "VIDEO_IMPORTEE", { nom: meta.name, taille: meta.size, duree: meta.duration, confidentialite: meta.privacy }, meta.privacy === "publique" ? "PUBLIQUE" : "INEDITE");
          return pid;
        },
        patchProject: (pid, patch) => set((s) => (s.projects[pid] ? { projects: { ...s.projects, [pid]: { ...s.projects[pid], ...patch } } } : {})),
        deleteProject: (pid) =>
          set((s) => {
            if (pid === DEMO_ID) return {};
            const { [pid]: _gone, ...rest } = s.projects;
            return { projects: rest, order: s.order.filter((x) => x !== pid), currentId: s.currentId === pid ? DEMO_ID : s.currentId };
          }),
        setUse: (use) => patchCurrent(() => ({ use })),
        setSpeakerVoice: (speaker, voiceId) => patchCurrent((p) => ({ speakerVoices: { ...p.speakerVoices, [speaker]: voiceId } })),
        editTranslation: (sid, text) =>
          patchCurrent((p) => ({ segments: p.segments.map((x) => (x.id === sid ? { ...x, translation: text, validated: x.translation === text ? x.validated : false } : x)) })),
        setValidated: (sid, v) => {
          const seg = currentProject(get()).segments.find((x) => x.id === sid);
          patchCurrent((p) => ({ segments: p.segments.map((x) => (x.id === sid ? { ...x, validated: v } : x)) }));
          if (seg) log(get().validator, v ? "TEXTE_VALIDE" : "VALIDATION_RETIREE", { segment: sid, text_hash: sha256Hex(seg.translation) }, v ? "VALIDE" : "");
        },
        generate: async (sid) => {
          const project = currentProject(get());
          const seg = project.segments.find((x) => x.id === sid);
          if (!seg) return;
          const setGen = (g: GenState) =>
            set((st) => {
              const p = st.projects[project.id];
              return p ? { projects: { ...st.projects, [project.id]: { ...p, gens: { ...p.gens, [sid]: g } } } } : {};
            });
          setGen({ status: "pending" });
          const { url, ...result } = await synthesize(project.speakerVoices[seg.speaker], seg.translation, seg.validated, `réplique ${sid.replace(/^s/, "")}`);
          const key = audioKey(project.id, sid);
          const old = audioUrls.get(key);
          if (old) URL.revokeObjectURL(old);
          if (url) audioUrls.set(key, url);
          else audioUrls.delete(key);
          setGen(result);
        },
        tryVoice: (voiceId, text) => synthesize(voiceId, text, true, "essai de voix"),
        updateOwnLicense: (patch) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.voice_id === OWNER_VOICE ? signLicense({ ...l, ...patch }) : l)) }));
          const lic = get().licenses.find((l) => l.voice_id === OWNER_VOICE)!;
          log(OWNER.name, "PASSEPORT_MIS_A_JOUR", { license_id: lic.license_id, usages: lic.allowed_uses, themes: lic.forbidden_themes, signature: lic.signature }, "SIGNE");
        },
        revoke: (licenseId) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.license_id === licenseId ? { ...l, status: "revoked", revoked_at: new Date().toISOString() } : l)) }));
          const lic = get().licenses.find((l) => l.license_id === licenseId)!;
          log(lic.holder_name, "LICENCE_REVOQUEE", { license_id: licenseId }, "REVOQUEE");
          notify({ persona: "creator", tone: "red", title: `${lic.holder_name} a révoqué sa licence`, body: "Les prochaines générations avec cette voix seront refusées. L’audio déjà livré reste tel quel." });
        },
        reinstate: (licenseId) => {
          set((s) => ({ licenses: s.licenses.map((l) => (l.license_id === licenseId ? signLicense({ ...l, status: "active", revoked_at: null }) : l)) }));
          const lic = get().licenses.find((l) => l.license_id === licenseId)!;
          log(lic.holder_name, "LICENCE_RETABLIE", { license_id: licenseId, signature: lic.signature }, "SIGNE");
        },
        exportPassport: () => {
          const s = get();
          const project = currentProject(s);
          const usedSpeakers = Object.entries(project.speakerVoices).map(([sp, vid]) => {
            const v = voiceById(vid);
            return { personnage: project.speakers[sp]?.name ?? sp, voice_id: vid, voiceName: v?.name ?? vid, kind: v?.kind ?? "consentie" };
          });
          const mine = s.usage.filter((u) => u.creator === CREATOR.name && u.project.startsWith(project.title));
          const draft = assemblePassport({
            title: project.kind === "demo" ? `${project.title} (${project.subtitle})` : project.title,
            validator: s.validator,
            referent: "Ahmed, référent éthique",
            segments: project.segments,
            speakers: usedSpeakers,
            licenses: s.licenses,
            journal: s.journal,
            generated: mine.length,
            charactersSynthesized: mine.reduce((a, u) => a + u.chars, 0),
          });
          const signed = signPassport(draft);
          set((st) => ({
            passports: { ...st.passports, [project.id]: signed },
            journal: appendEntry(st.journal, st.validator, "PASSEPORT_EXPORTE", { projet: project.id, signature: signed.signature?.valeur }, "SIGNE"),
          }));
          return signed;
        },
        logExport: (kind, detail) => log(get().validator, "EXPORT", { type: kind, ...detail }, "OK"),
        markRead: (p) => set((s) => ({ notifications: s.notifications.map((n) => (n.persona === p ? { ...n, read: true } : n)) })),
        reset: () => {
          audioUrls.forEach((u) => URL.revokeObjectURL(u));
          audioUrls.clear();
          set({ ...seed() });
        },
      };
    },
    {
      name: "sawti360-demo",
      version: 2,
      storage: createJSONStorage(safeStorage),
      migrate: () => seed() as unknown as Store,
      partialize: (s) => {
        const projects = Object.fromEntries(
          Object.entries(s.projects).map(([pid, p]) => {
            const gens = Object.fromEntries(
              Object.entries(p.gens)
                .filter(([, g]) => g.status !== "pending")
                .map(([k, g]) => [k, g.status === "ok" ? { ...g, status: "error" as const, message: "Audio non conservé après rechargement : régénérez la réplique." } : g]),
            );
            return [pid, { ...p, gens }];
          }),
        );
        return { ...s, projects } as unknown as Store;
      },
    },
  ),
);

export { REASONS_FR };
