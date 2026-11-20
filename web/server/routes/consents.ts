/**
 * Consent of a living person (spec § 4, Écran 06): a secure link by e-mail; the person answers once,
 * without an account, from any device. If not registered, the person creates THEIR OWN Voice Passport
 * from the link (the creator can never create it for them). Every step is journaled; the creator is
 * notified, and their screen shows « Autorisée » at the next refresh.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Sql } from "postgres";
import { z } from "zod";
import { sha256Hex } from "../../src/core/canonical.js";
import { paragraphFor } from "../../src/mock/registry.js";
import type { LivingStatus } from "../../src/state/workflow.js";
import { requireAccount } from "../accounts.js";
import { checkSample } from "../ai/voicecheck.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import type { ConsentRow, ProjectRow } from "../compose.js";
import { db } from "../db.js";
import { env } from "../env.js";
import { conflict, notFound, readBody } from "../errors.js";
import { startJob } from "../jobs.js";
import { consentMail, decisionMail, sendMail } from "../mail.js";
import { notify } from "../notify.js";
import { mutateProject } from "../projects.js";
import { signLicenseServer } from "../sign.js";
import { assertOwnPath, files } from "../storage.js";

const SendBody = z.object({ email: z.email().max(200), registered: z.boolean() });
const Decision = z.object({ accept: z.boolean() });
const PassportBody = z.object({
  samplePath: z.string().min(1).max(300),
  duration: z.number().min(0).max(600),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
  publicName: z.string().trim().max(80).optional(),
  pseudonym: z.boolean().optional(),
  languages: z.array(z.string().max(40)).max(6).optional(),
});

/** Minimum reading on the consent page (8 s in the owner space). */
const CONSENT_MIN_SECONDS = 3;

const isToken = (t: string) => /^[0-9a-f]{64}$/.test(t);
const voiceIdOf = (consentId: string) => `v_c_${consentId.replace(/-/g, "").slice(0, 10)}`;

/** The live consent behind a link: unknown or replaced by a newer link → 404. */
async function consentByToken(sql: Sql, token: string) {
  if (!isToken(token)) throw notFound("Lien de consentement inconnu.");
  const [consent] = await sql<ConsentRow[]>`select * from public.consents where token_hash = ${sha256Hex(token)}`;
  if (!consent) throw notFound("Lien de consentement inconnu.");
  if (consent.superseded) throw notFound("Ce lien a été remplacé par une demande plus récente : utilisez le dernier lien reçu.");
  const [project] = await sql<ProjectRow[]>`select * from public.projects where id = ${consent.project_id}`;
  if (!project) throw notFound("Projet introuvable.");
  const [creator] = await sql<{ name: string; email: string }[]>`select name, email from public.accounts where id = ${project.account_id}`;
  const character = project.characters[consent.character_key];
  return { consent, project, creator, character };
}

export const consents = new Hono<AppEnv>()
  .post("/projects/:id/characters/:key/consent", async (c) => {
    const body = await readBody(c, SendBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const token = randomBytes(32).toString("hex");
    const email = body.email.trim().toLowerCase();
    let title = "";
    let name = "";
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const ch = row.characters[key];
      if (!ch) throw notFound("Personnage introuvable.");
      title = row.title;
      name = ch.name;
      await tx`update public.consents set superseded = true where project_id = ${row.id} and character_key = ${key} and not superseded`;
      await tx`
        insert into public.consents (project_id, character_key, email, registered, status, token_hash)
        values (${row.id}, ${key}, ${email}, ${body.registered}, 'en_attente', ${sha256Hex(token)})`;
      await appendAudit(tx, me.name, "CONSENTEMENT_DEMANDE", { projet: row.id, personnage: key, email_hash: sha256Hex(email) }, "EN_ATTENTE", { projectId: row.id, accountId: user.id });
    });
    const consentUrl = `${env().appUrl}/consentement/${token}`;
    const mail = await sendMail(consentMail(email, { creator: me.name, project: title, character: name, url: consentUrl }));
    // The raw link is given once, here: it is stored hashed and never sent again.
    return c.json({ project, consentUrl, mail }, 201);
  })

  .get("/public/consents/:token", async (c) => {
    const { consent, project, creator, character } = await consentByToken(db(), c.req.param("token"));
    return c.json({
      projectTitle: project.title,
      creatorName: creator?.name ?? "Un créateur",
      characterName: character?.name ?? consent.character_key,
      characterDescription: character?.description ?? "",
      status: consent.status,
      registered: consent.registered,
      paragraph: paragraphFor(consent.id),
      voiceCreated: Boolean(consent.voice_id),
      sentAt: new Date(consent.sent_at).toISOString(),
      decidedAt: consent.decided_at ? new Date(consent.decided_at).toISOString() : null,
    });
  })

  .post("/public/consents/:token/voice-passport", async (c) => {
    const body = await readBody(c, PassportBody);
    const sql = db();
    const { consent, project, character } = await consentByToken(sql, c.req.param("token"));
    if (consent.status !== "en_attente") throw conflict("DEJA_DECIDE", "Ce lien a déjà reçu une réponse.");
    if (consent.voice_id) throw conflict("DEJA_DECIDE", "Votre Passeport de voix est déjà créé : vous pouvez répondre.");
    assertOwnPath(body.samplePath, `public/${consent.id}`);
    const paragraph = paragraphFor(consent.id);
    const holder = body.publicName || character?.name || "Personne invitée";
    const jobId = await startJob(sql, { kind: "voice_check", accountId: null, projectId: project.id }, async (ctx) => {
      await ctx.step(0, "Contrôle de l’enregistrement…");
      const bytes = await files().read("samples", body.samplePath);
      const mime = body.samplePath.endsWith(".wav") ? "audio/wav" : body.samplePath.endsWith(".ogg") ? "audio/ogg" : body.samplePath.endsWith(".m4a") ? "audio/mp4" : "audio/webm";
      const check = await checkSample({ bytes, mime }, body, paragraph, CONSENT_MIN_SECONDS);
      if (check.provider) ctx.providers.controle = check.provider;
      if (check.match === "non_conforme") throw new Error(check.label);
      const voiceId = voiceIdOf(consent.id);
      const today = new Date().toISOString().slice(0, 10);
      const licence = signLicenseServer({
        license_id: `VL-C-${consent.id.slice(0, 8).toUpperCase()}`,
        voice_id: voiceId,
        holder_name: holder,
        holder_role: "personne filmée, consentement pour un projet",
        allowed_uses: [project.use_case],
        forbidden_uses: ["publicite", "contenu_politique", "contenu_intime"],
        forbidden_themes: [],
        projects: [project.id],
        languages: ["fr"],
        valid_from: today,
        valid_until: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`,
        owner_share: 0.7,
        no_training: true,
        status: "active",
        revoked_at: null,
        consent_evidence_sha256: sha256Hex(bytes),
        demo: false,
        signature: "",
      });
      await sql.begin(async (tx) => {
        await tx`
          insert into public.voice_profiles (voice_id, account_id, profile, published, sample)
          values (${voiceId}, null, ${tx.json({
            publicName: holder,
            pseudonym: Boolean(body.pseudonym),
            languages: body.languages?.length ? body.languages : ["Français"],
            description: "Passeport de voix créé par la personne depuis une demande de consentement. Non publié dans la bibliothèque.",
            price: 0,
            conditions: "Utilisation limitée au projet pour lequel le consentement est donné.",
            availability: "indisponible",
            sampleText: paragraph,
            tags: [],
          })}, false, ${tx.json({ path: body.samplePath, duration: body.duration, peak: body.peak, rms: body.rms, recordedAt: new Date().toISOString(), transcript: check.transcript ?? null, wer: check.wer ?? null, match: check.match })})
          on conflict (voice_id) do nothing`;
        await tx`
          insert into public.voice_licenses (license_id, voice_id, data, status) values (${licence.license_id}, ${voiceId}, ${tx.json(licence as never)}, 'active')
          on conflict (license_id) do nothing`;
        await tx`update public.consents set registered = true, voice_id = ${voiceId} where id = ${consent.id}`;
        await appendAudit(tx, holder, "PASSEPORT_DE_VOIX_CREE", { voix: voiceId, echantillon_s: body.duration, controle: check.match, wer: check.wer ?? null }, "CREE", { projectId: project.id });
      });
      return { match: check.match, label: check.label, wer: check.wer ?? null };
    });
    return c.json({ jobId }, 202);
  })

  .post("/public/consents/:token/decision", async (c) => {
    const { accept } = await readBody(c, Decision);
    const sql = db();
    const { consent, project, creator, character } = await consentByToken(sql, c.req.param("token"));
    const status: LivingStatus = accept ? "autorisee" : "refusee";
    const name = character?.name ?? consent.character_key;
    await sql.begin(async (tx) => {
      const [locked] = await tx<ConsentRow[]>`select * from public.consents where id = ${consent.id} for update`;
      if (locked.status !== "en_attente") throw conflict("DEJA_DECIDE", "Ce lien a déjà reçu une réponse.");
      if (accept && !locked.registered) throw conflict("CONFLIT", "Créez d’abord votre Passeport de voix, puis donnez votre réponse.");
      await tx`update public.consents set status = ${status}, decided_at = now(), registered = ${locked.registered || accept} where id = ${consent.id}`;
      await appendAudit(tx, `titulaire (${name})`, accept ? "CONSENTEMENT_ACCORDE" : "CONSENTEMENT_REFUSE", { projet: project.id, personnage: consent.character_key }, accept ? "AUTORISEE" : "REFUSEE", {
        projectId: project.id,
      });
      await notify(tx, {
        accountId: project.account_id,
        space: "creator",
        tone: accept ? "ok" : "red",
        title: accept ? `${name} a donné son consentement` : `${name} a refusé l’utilisation de sa voix`,
        body: accept ? `${project.title} · la voix originale peut être utilisée.` : `${project.title} · la voix originale reste bloquée. Choisissez une voix de remplacement.`,
        link: `/projet/${project.id}/autorisations`,
      });
    });
    if (creator?.email)
      await sendMail(
        decisionMail(creator.email, {
          who: name,
          accepted: accept,
          project: project.title,
          detail: accept ? "consentement donné : la voix originale peut être utilisée" : "consentement refusé : la voix originale reste bloquée",
          url: `${env().appUrl}/projet/${project.id}/autorisations`,
        }),
      );
    return c.json({ status });
  });
