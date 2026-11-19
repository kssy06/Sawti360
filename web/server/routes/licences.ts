/**
 * Voice library and project licences (spec § 5, Écrans 07–08): a request expires after 72 h,
 * the owner answers once (connected, or through the e-mailed link without an account),
 * the price is the one the owner set. Each step writes its journal entry and notifies the right account.
 */
import { randomBytes, randomInt } from "node:crypto";
import { Hono } from "hono";
import type { Sql } from "postgres";
import { z } from "zod";
import { sha256Hex } from "../../src/core/canonical.js";
import { EXPIRY_HOURS, EXPIRY_MS } from "../../src/state/workflow.js";
import { requireAccount } from "../accounts.js";
import { appendAudit, type Db } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { licenseOut, profileOut, requestOut, type LicenseRequestRow, type VoiceLicenseRow, type VoiceProfileRow } from "../compose.js";
import { db } from "../db.js";
import { env } from "../env.js";
import { ApiError, conflict, forbidden, notFound, readBody } from "../errors.js";
import { decisionMail, licenceRequestMail, sendMail } from "../mail.js";
import { notify } from "../notify.js";
import { mutateProject, updateProject } from "../projects.js";

const price = (n: number) => (n > 0 ? `${n} DT` : "gratuit");
export const newToken = () => randomBytes(32).toString("hex");
export const newRequestId = () => `r_${randomBytes(5).toString("hex").slice(0, 8)}`;

export async function profilesWithLicences(sql: Db) {
  const q = sql as Sql;
  const [profiles, licences] = await Promise.all([
    q<VoiceProfileRow[]>`select * from public.voice_profiles order by created_at, voice_id`,
    q<VoiceLicenseRow[]>`select license_id, voice_id, data, status, revoked_at from public.voice_licenses`,
  ]);
  return { profiles, licences: licences.map(licenseOut) };
}

async function profileOf(sql: Db, voiceId: string) {
  const { profiles, licences } = await profilesWithLicences(sql);
  const row = profiles.find((p) => p.voice_id === voiceId);
  return row ? { row, profile: profileOut(row, licences) } : null;
}

async function accountEmail(sql: Db, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [a] = await (sql as Sql)<{ email: string }[]>`select email from public.accounts where id = ${id}`;
  return a?.email ?? null;
}

/** Effective status: a request still « envoyée » after 72 h is expired, recorded the first time it is seen. */
export async function settleExpiry(sql: Db, row: LicenseRequestRow, now = new Date()): Promise<LicenseRequestRow> {
  if (row.status !== "envoyee" || now.getTime() <= new Date(row.expires_at).getTime()) return row;
  const [updated] = await (sql as Sql)<LicenseRequestRow[]>`
    update public.license_requests set status = 'expiree' where id = ${row.id} and status = 'envoyee' returning *`;
  return updated ?? { ...row, status: "expiree" };
}

/** The owner's answer, connected or through the link: once only, refused after 72 h. */
async function decide(sql: Sql, row: LicenseRequestRow, accept: boolean): Promise<LicenseRequestRow> {
  return (await sql.begin(async (tx) => {
    const [locked] = await tx<LicenseRequestRow[]>`select * from public.license_requests where id = ${row.id} for update`;
    const current = await settleExpiry(tx, locked);
    if (current.status === "expiree") throw new ApiError(410, "EXPIRE", `Demande expirée : sans réponse sous ${EXPIRY_HOURS} heures, elle ne peut plus être acceptée.`);
    if (current.status !== "envoyee") throw conflict("DEJA_DECIDE", "Cette demande a déjà reçu une réponse.");
    const reference = accept ? `LP-2026-${randomInt(1000, 10000)}` : null;
    const [updated] = await tx<LicenseRequestRow[]>`
      update public.license_requests set status = ${accept ? "acceptee" : "refusee"}, decided_at = now(), reference = ${reference}
      where id = ${row.id} returning *`;
    const prof = await profileOf(tx, row.voice_id);
    const who = prof?.profile.publicName ?? row.voice_id;
    await appendAudit(tx, who, accept ? "LICENCE_ACCEPTEE" : "LICENCE_REFUSEE", { demande: row.id, projet: row.project_id }, accept ? "ACCEPTEE" : "REFUSEE", {
      projectId: row.project_id,
      accountId: row.owner_account_id,
    });
    await notify(tx, {
      accountId: row.creator_account_id,
      space: "creator",
      tone: accept ? "ok" : "red",
      title: accept ? `${who} a accepté votre demande` : `${who} a refusé votre demande`,
      body: accept
        ? `${row.project_title} · ${row.character_name}. ${Number(row.price) > 0 ? `Paiement de ${Number(row.price)} DT à confirmer.` : "Licence gratuite."}`
        : `${row.project_title} · choisissez une autre voix ou une voix générée par IA.`,
      link: `/projet/${row.project_id}/voix`,
    });
    return updated;
  })) as LicenseRequestRow;
}

async function mailDecision(sql: Sql, row: LicenseRequestRow, accepted: boolean): Promise<boolean> {
  const to = await accountEmail(sql, row.creator_account_id);
  if (!to) return false;
  const prof = await profileOf(sql, row.voice_id);
  return sendMail(
    decisionMail(to, {
      who: prof?.profile.publicName ?? row.voice_id,
      accepted,
      project: row.project_title,
      detail: accepted ? `${row.character_name} · ${Number(row.price) > 0 ? `paiement de ${Number(row.price)} DT à confirmer` : "licence gratuite"}` : `${row.character_name} · choisissez une autre voix`,
      url: `${env().appUrl}/projet/${row.project_id}/voix`,
    }),
  );
}

async function requestByToken(sql: Db, token: string): Promise<LicenseRequestRow> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw notFound("Lien de licence inconnu.");
  const [row] = await (sql as Sql)<LicenseRequestRow[]>`select * from public.license_requests where token_hash = ${sha256Hex(token)}`;
  if (!row) throw notFound("Lien de licence inconnu.");
  return row;
}

const RequestBody = z.object({
  projectId: z.string().min(1).max(80),
  characterKey: z.string().min(1).max(80),
  voiceId: z.string().min(1).max(80),
  message: z.string().max(500).default(""),
});
const Decision = z.object({ accept: z.boolean() });

export const licences = new Hono<AppEnv>()
  .get("/voices", async (c) => {
    const { profiles, licences: lic } = await profilesWithLicences(db());
    return c.json(profiles.filter((p) => p.published).map((p) => profileOut(p, lic)));
  })

  .post("/license-requests", async (c) => {
    const body = await readBody(c, RequestBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const prof = await profileOf(sql, body.voiceId);
    if (!prof) throw notFound("Voix inconnue de la bibliothèque.");
    if (prof.profile.availability !== "disponible") throw conflict("CONFLIT", `${prof.profile.publicName} n’est pas disponible : licence révoquée ou profil retiré.`);
    const token = newToken();
    const id = newRequestId();
    const now = new Date();
    let created!: LicenseRequestRow;
    const project = await mutateProject(sql, user, body.projectId, async (tx, row) => {
      const ch = row.characters[body.characterKey];
      if (!ch) throw notFound("Personnage introuvable dans ce projet.");
      const amount = Number(prof.profile.price) || 0;
      [created] = await tx<LicenseRequestRow[]>`
        insert into public.license_requests (id, token_hash, project_id, project_title, character_key, character_name, voice_id,
          creator_account_id, creator_name, owner_account_id, message, price, sent_at, expires_at, status, payment)
        values (${id}, ${sha256Hex(token)}, ${row.id}, ${row.title}, ${ch.key}, ${ch.name}, ${body.voiceId}, ${user.id}, ${me.name},
          ${prof.row.account_id}, ${body.message.trim()}, ${amount}, ${now.toISOString()}, ${new Date(now.getTime() + EXPIRY_MS).toISOString()},
          'envoyee', ${amount > 0 ? "en_attente" : "non_requis"})
        returning *`;
      await updateProject(tx, row.id, {
        speaker_voices: { ...row.speaker_voices, [ch.key]: body.voiceId },
        characters: { ...row.characters, [ch.key]: { ...ch, useOriginal: false } },
      });
      await appendAudit(tx, me.name, "LICENCE_DEMANDEE", { projet: row.id, personnage: ch.key, voix: body.voiceId }, "ENVOYEE", { projectId: row.id, accountId: user.id });
      await notify(tx, {
        accountId: prof.row.account_id,
        space: "owner",
        tone: "plain",
        title: "Nouvelle demande de licence",
        body: `${me.name} · ${row.title} · expire dans ${EXPIRY_HOURS} h.`,
        link: "/proprietaire/demandes",
      });
    });
    const url = `${env().appUrl}/licence/${token}`;
    const ownerEmail = await accountEmail(sql, prof.row.account_id);
    const mail = ownerEmail
      ? await sendMail(licenceRequestMail(ownerEmail, { creator: me.name, project: created.project_title, character: created.character_name, price: price(Number(created.price)), url, hours: EXPIRY_HOURS }))
      : false;
    // The link goes back to the creator only for a fictional profile without account (demonstration).
    return c.json({ request: requestOut(created), project, mail, ...(prof.row.account_id ? {} : { licenceUrl: url }) }, 201);
  })

  .post("/license-requests/:id/decision", async (c) => {
    const { accept } = await readBody(c, Decision);
    const sql = db();
    const [row] = await sql<LicenseRequestRow[]>`select * from public.license_requests where id = ${c.req.param("id")}`;
    if (!row) throw notFound("Demande introuvable.");
    if (row.owner_account_id !== c.get("user").id) throw forbidden("Cette demande ne concerne pas votre voix.");
    const updated = await decide(sql, row, accept);
    await mailDecision(sql, updated, accept);
    return c.json(requestOut(updated));
  })

  .post("/license-requests/:id/expire", async (c) => {
    const sql = db();
    const [row] = await sql<LicenseRequestRow[]>`select * from public.license_requests where id = ${c.req.param("id")}`;
    if (!row) throw notFound("Demande introuvable.");
    if (row.creator_account_id !== c.get("user").id) throw forbidden("Cette demande n’a pas été envoyée par votre compte.");
    if (row.status !== "envoyee") throw conflict("DEJA_DECIDE", "Cette demande a déjà reçu une réponse.");
    const past = Date.now() - 60_000;
    const [updated] = await sql<LicenseRequestRow[]>`
      update public.license_requests set sent_at = ${new Date(past - EXPIRY_MS).toISOString()}, expires_at = ${new Date(past).toISOString()}, status = 'expiree'
      where id = ${row.id} returning *`;
    const prof = await profileOf(sql, row.voice_id);
    await notify(sql, {
      accountId: row.creator_account_id,
      space: "creator",
      tone: "warn",
      title: `Demande expirée après ${EXPIRY_HOURS} h`,
      body: `${row.project_title} · ${prof?.profile.publicName ?? row.voice_id}. Choisissez une autre voix ou une voix IA.`,
      link: `/projet/${row.project_id}/voix`,
    });
    return c.json(requestOut(updated));
  })

  .get("/public/licences/:token", async (c) => {
    const sql = db();
    const row = await settleExpiry(sql, await requestByToken(sql, c.req.param("token")));
    const prof = await profileOf(sql, row.voice_id);
    const [project] = await sql<{ format: string }[]>`select format from public.projects where id = ${row.project_id}`;
    return c.json({ request: requestOut(row), ownerName: prof?.profile.publicName ?? row.voice_id, projectFormat: project?.format ?? null });
  })

  .post("/public/licences/:token/decision", async (c) => {
    const { accept } = await readBody(c, Decision);
    const sql = db();
    const row = await requestByToken(sql, c.req.param("token"));
    const updated = await decide(sql, row, accept);
    await mailDecision(sql, updated, accept);
    return c.json(requestOut(updated));
  });
