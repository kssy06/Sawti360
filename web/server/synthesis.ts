/**
 * One synthesis, done the same way from the three entry points (generation task, timeline preview,
 * library sample) — ARCHITECTURE.md § 4.8 and § 4.9:
 *  1. the character's voice slot with the database's data (original voice, project licence, AI voice);
 *  2. the rules engine with the signed licences of the database (refusal by default, content filter);
 *  3. jetons reserved under lock (402 when the balance is short), refunded if the engine fails;
 *  4. ElevenLabs with the voice's rendering voice; the audio is kept by the caller;
 *  5. usage row, 70 % credited to the holder, journal GENERATION_AUTORISEE, « Votre voix a été utilisée ».
 * A refusal writes GENERATION_REFUSEE, and warns the holder when one of their forbidden themes was aimed at.
 */
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { sha256Hex } from "../src/core/canonical.js";
import { voiceById } from "../src/core/catalog.js";
import { costOf, fmt, split } from "../src/core/credits.js";
import { runGate } from "../src/core/gate.js";
import { decision } from "../src/core/rules.js";
import type { Use, VoiceLicense } from "../src/core/types.js";
import { requestFor } from "../src/state/passportBuild.js";
import type { GenState, Project } from "../src/state/store.js";
import { voiceSlot, type LicenseRequest, type VoiceSlot } from "../src/state/workflow.js";
import type { AccountOut } from "./accounts.js";
import { speak, type Speech } from "./ai/elevenlabs.js";
import { appendAudit, type Db } from "./audit.js";
import { licenseOut, requestOut, type LicenseRequestRow, type VoiceLicenseRow, type VoiceProfileRow } from "./compose.js";
import { ApiError } from "./errors.js";
import { addEntry, balanceOf, lockLedger } from "./ledger.js";
import { notify } from "./notify.js";

/* ------------------------------------------------------------------ voices and licences of the database */

export interface VoiceBook {
  licenses: VoiceLicense[];
  profiles: Map<string, VoiceProfileRow>;
}

export async function loadVoiceBook(sql: Db): Promise<VoiceBook> {
  const q = sql as Sql;
  const licenses = await q<VoiceLicenseRow[]>`select license_id, voice_id, data, status, revoked_at from public.voice_licenses`;
  const profiles = await q<VoiceProfileRow[]>`select * from public.voice_profiles`;
  return { licenses: licenses.map(licenseOut), profiles: new Map(profiles.map((p) => [p.voice_id, p])) };
}

/** A Sawti base voice is an AI voice; any other known voice has a holder and needs a licence. */
export const kindIn =
  (book: VoiceBook) =>
  (voiceId: string): "licensed" | "ai" | null => {
    const v = voiceById(voiceId);
    if (v) return v.kind === "base" ? "ai" : "licensed";
    return book.profiles.has(voiceId) ? "licensed" : null;
  };

/** The ElevenLabs voice that renders this voice (premade for the catalogue, or the holder's own). */
export const renderVoiceOf = (book: VoiceBook, voiceId: string): string | null =>
  book.profiles.get(voiceId)?.eleven_voice_id ?? voiceById(voiceId)?.eleven_voice_id ?? null;

export const holderOf = (book: VoiceBook, voiceId: string): string | null => book.profiles.get(voiceId)?.account_id ?? null;

export async function projectRequests(sql: Db, projectId: string): Promise<LicenseRequest[]> {
  const rows = await (sql as Sql)<LicenseRequestRow[]>`select * from public.license_requests where project_id = ${projectId} order by sent_at`;
  return rows.map(requestOut);
}

/** voiceSlot() of workflow.ts, with the database's licence requests and voices. */
export function slotFor(project: Project, key: string, book: VoiceBook, requests: LicenseRequest[], now = new Date()): VoiceSlot {
  const c = project.characters[key];
  if (!c) return { mode: "none", usable: false, reason: "Personnage inconnu" };
  const voiceId = project.speakerVoices[key];
  return voiceSlot(c, voiceId, kindIn(book), requestFor({ requests }, project.id, key, voiceId), now);
}

export const SKIPPED: GenState = {
  status: "skipped",
  message: "Voix originale autorisée : son rendu demande le service de clonage vocal, non branché dans ce prototype.",
};

/** A line whose voice slot is not usable: refused with the slot's reason, written to the journal. */
export async function refuseSlot(sql: Db, me: AccountOut, project: Project, voiceId: string | undefined, text: string, slot: VoiceSlot): Promise<GenState> {
  const d = decision(slot.mode === "licensed" ? "PROJET_NON_AUTORISE" : "VOIX_NON_ENREGISTREE", new Date(), null, slot.reason);
  await appendAudit(sql, me.name, "GENERATION_REFUSEE", { voice_id: voiceId ?? null, text_hash: sha256Hex(text), code: d.reason_code, projet: project.id, motif: slot.reason }, d.reason_code, {
    projectId: project.id,
    accountId: me.id,
  });
  return { status: "refused", decision: d, chars: costOf(text), by: "server", at: new Date().toISOString() };
}

/* ------------------------------------------------------------------ one synthesis */

export interface SpeakInput {
  me: AccountOut;
  voiceId: string;
  text: string;
  use: Use;
  /** The project the line belongs to; null for a library sample (usage row without project). */
  project: { id: string; title: string } | null;
  /** Title shown in the usage row and the holder's notice when there is no project (default « Bibliothèque »). */
  title?: string;
  /** « réplique 3 », « essai de voix »: the usage row reads « <titre>, <label> ». */
  label: string;
  /** For the rules engine (licence limited to one project); defaults to the project. */
  gateProjectId?: string;
  humanValidated: boolean;
  /** Keeps the audio (the lines go to Storage); a failure refunds the jetons. */
  keep?: (speech: Speech) => Promise<void>;
  book?: VoiceBook;
}

export interface SpeakResult {
  gen: GenState;
  speech?: Speech;
  /** The engine's or the storage's failure, for the routes that answer with its HTTP status. */
  failure?: unknown;
  balance?: number;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Reserves the jetons under the ledger lock: 402 JETONS_INSUFFISANTS when the balance is short. */
async function reserve(sql: Sql, accountId: string, cost: number, ref: string): Promise<void> {
  await sql.begin(async (tx) => {
    await lockLedger(tx, accountId);
    const balance = await balanceOf(tx, accountId);
    if (cost > balance)
      throw new ApiError(402, "JETONS_INSUFFISANTS", `Jetons insuffisants : ${fmt.format(cost)} nécessaires, ${fmt.format(balance)} disponibles. Changez de plan pour en obtenir.`, {
        needed: cost,
        balance,
      });
    await addEntry(tx, accountId, -cost, "synthese", ref);
  });
}

export async function speakLine(sql: Sql, i: SpeakInput): Promise<SpeakResult> {
  const now = new Date();
  const book = i.book ?? (await loadVoiceBook(sql));
  const cost = costOf(i.text);
  const textHash = sha256Hex(i.text);
  const meta = { projectId: i.project?.id ?? null, accountId: i.me.id };
  const where = i.project ? { projet: i.project.id } : {};

  const gate = runGate(
    { voice_id: i.voiceId, text: i.text, use: i.use, language: "fr", project_id: i.gateProjectId ?? i.project?.id ?? "bibliotheque", requested_by: i.me.name, human_validated: i.humanValidated },
    book.licenses,
    now,
  );
  if (!gate.decision.allowed) {
    await sql.begin(async (tx) => {
      await appendAudit(tx, i.me.name, "GENERATION_REFUSEE", { voice_id: i.voiceId, text_hash: textHash, code: gate.decision.reason_code, ...where }, gate.decision.reason_code, meta);
      if (gate.decision.reason_code === "THEME_INTERDIT_PAR_TITULAIRE")
        await notify(tx, {
          accountId: holderOf(book, i.voiceId),
          space: "owner",
          tone: "red",
          title: "Tentative bloquée sur votre voix",
          body: `${i.me.name} · ${gate.decision.detail ?? ""} · aucun audio généré`,
        });
    });
    return { gen: { status: "refused", decision: gate.decision, chars: cost, by: "server", at: now.toISOString() } };
  }

  const render = renderVoiceOf(book, i.voiceId);
  if (!render)
    return { gen: { status: "error", decision: gate.decision, chars: cost, by: "server", message: "Autorisé, mais cette voix n’a pas encore de voix de rendu : le clonage vocal n’est pas branché dans ce prototype." } };

  const usageId = `u_${randomBytes(6).toString("hex")}`;
  await reserve(sql, i.me.id, cost, usageId);
  let speech: Speech;
  try {
    speech = await speak(render, i.text);
    await i.keep?.(speech);
  } catch (err) {
    await addEntry(sql, i.me.id, cost, "remboursement", usageId);
    return { gen: { status: "error", decision: gate.decision, chars: cost, by: "server", message: `${messageOf(err)} Aucun jeton débité.` }, failure: err };
  }

  const lic = gate.license!;
  const parts = split(cost, lic.owner_share);
  const holder = holderOf(book, i.voiceId);
  const title = i.project?.title ?? i.title ?? "Bibliothèque";
  await sql.begin(async (tx) => {
    if (holder && parts.owner > 0) await addEntry(tx, holder, parts.owner, "part_titulaire", usageId);
    await tx`
      insert into public.usage_rows (id, project_id, project_label, creator_account_id, creator_name, voice_id, chars, cost, owner, platform, ms, bytes)
      values (${usageId}, ${i.project?.id ?? null}, ${`${title}, ${i.label}`}, ${i.me.id}, ${i.me.name}, ${i.voiceId}, ${cost}, ${cost}, ${parts.owner}, ${parts.platform}, ${speech.ms}, ${speech.bytes.length})`;
    await appendAudit(tx, i.me.name, "GENERATION_AUTORISEE", { voice_id: i.voiceId, license_id: lic.license_id, text_hash: textHash, jetons: cost, titulaire: parts.owner, ...where }, "OK", meta);
    if (holder && parts.owner > 0)
      await notify(tx, {
        accountId: holder,
        space: "owner",
        tone: "ok",
        title: "Votre voix a été utilisée",
        body: `${i.me.name} · ${title} · ${fmt.format(cost)} caractères · +${fmt.format(parts.owner)} jetons`,
      });
  });
  return {
    gen: {
      status: "ok",
      decision: gate.decision,
      chars: cost,
      cost,
      ownerShare: parts.owner,
      ms: speech.ms,
      bytes: speech.bytes.length,
      mock: speech.mock,
      at: new Date().toISOString(),
      by: "server",
    },
    speech,
    balance: await balanceOf(sql, i.me.id),
  };
}

/* ------------------------------------------------------------------ where the lines are kept */

/** media/<compte>/<projet>/lines/<segId>.mp3 (.wav for the test audio of SAWTI_TTS_MOCK). */
export const linePath = (accountId: string, projectId: string, segId: string, mock: boolean) => `${accountId}/${projectId}/lines/${segId}.${mock ? "wav" : "mp3"}`;
