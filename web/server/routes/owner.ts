/**
 * Espace propriétaire vocal (A10, écrans 14 à 16, ARCHITECTURE.md § 4.11). One voice per account.
 *  POST  /api/owner/voice  { profile, samplePath, duration, peak, rms } → 202 { jobId }: task « voice_check »
 *        (8 s at least, level, saturation; transcription + WER when Groq is configured), then public profile
 *        and licence signed by the server. Journal PASSEPORT_DE_VOIX_CREE. No identity document (spec § 5).
 *  PATCH /api/owner/voice/profile  Partial<VoiceProfile> → OwnedVoice. Journal PROFIL_PUBLIC_MIS_A_JOUR.
 *  PATCH /api/owner/voice/rules    { allowed_uses, forbidden_themes } → VoiceLicense signed again. PASSEPORT_MIS_A_JOUR.
 *  POST  /api/owner/licenses/:licenseId/revoke | /reinstate → VoiceLicense. LICENCE_REVOQUEE / LICENCE_RETABLIE;
 *        a revocation warns the creators who use the voice; their next generation is refused.
 */
import { Hono } from "hono";
import type { Sql } from "postgres";
import { z } from "zod";
import { sha256Hex } from "../../src/core/canonical.js";
import { voiceById } from "../../src/core/catalog.js";
import type { Theme, Use, VoiceLicense } from "../../src/core/types.js";
import { paragraphFor } from "../../src/mock/registry.js";
import { requireAccount, type AccountOut } from "../accounts.js";
import { checkSample } from "../ai/voicecheck.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { licenseOut, ownedVoiceOut, type VoiceLicenseRow, type VoiceProfileRow } from "../compose.js";
import { db } from "../db.js";
import { ApiError, conflict, forbidden, notFound, readBody } from "../errors.js";
import { startJob } from "../jobs.js";
import { notify } from "../notify.js";
import { signLicenseServer } from "../sign.js";
import { assertOwnPath, files } from "../storage.js";

export const OWNER_MIN_SECONDS = 8;

/** P0: a premade synthetic voice renders the owner's voice (« voix de démonstration, clonage non activé »). */
const DEMO_RENDER = voiceById("v_neutre")?.eleven_voice_id ?? null;

const USES = ["doublage_film", "doublage_video_en_ligne", "bande_annonce", "publicite", "contenu_politique", "contenu_intime"] as const satisfies readonly Use[];
const THEMES = ["politique", "religion", "publicite", "violence", "grossierete", "intime", "alcool_paris"] as const satisfies readonly Theme[];

const Profile = z.object({
  publicName: z.string().trim().min(1).max(80),
  pseudonym: z.boolean(),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  description: z.string().max(800),
  price: z.number().int().min(0).max(100_000),
  conditions: z.string().max(800),
  availability: z.enum(["disponible", "indisponible"]),
  sampleText: z.string().max(400),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
});
const VoiceBody = z.object({
  profile: Profile,
  samplePath: z.string().min(1).max(300),
  duration: z.number().min(0).max(600),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
});
const RulesBody = z.object({ allowed_uses: z.array(z.enum(USES)).min(1), forbidden_themes: z.array(z.enum(THEMES)) });

const mimeOf = (path: string) => (path.endsWith(".wav") ? "audio/wav" : path.endsWith(".ogg") ? "audio/ogg" : path.endsWith(".m4a") ? "audio/mp4" : path.endsWith(".mp3") ? "audio/mpeg" : "audio/webm");

async function myVoice(sql: Sql, me: AccountOut): Promise<VoiceProfileRow> {
  const [row] = await sql<VoiceProfileRow[]>`select * from public.voice_profiles where account_id = ${me.id}`;
  if (!row) throw notFound("Pas encore de Passeport de voix : créez-le d’abord.");
  return row;
}

async function licencesOf(sql: Sql, voiceId: string): Promise<VoiceLicense[]> {
  return (await sql<VoiceLicenseRow[]>`select license_id, voice_id, data, status, revoked_at from public.voice_licenses where voice_id = ${voiceId} order by license_id`).map(licenseOut);
}

/** The licence, if its voice belongs to this account (403 otherwise). */
async function myLicence(sql: Sql, me: AccountOut, licenseId: string): Promise<VoiceLicenseRow> {
  const [row] = await sql<(VoiceLicenseRow & { account_id: string | null })[]>`
    select l.license_id, l.voice_id, l.data, l.status, l.revoked_at, p.account_id
    from public.voice_licenses l left join public.voice_profiles p on p.voice_id = l.voice_id
    where l.license_id = ${licenseId}`;
  if (!row) throw notFound("Licence introuvable.");
  if (row.account_id !== me.id) throw forbidden("Cette licence ne porte pas sur votre voix.");
  return row;
}

export const owner = new Hono<AppEnv>()
  .post("/owner/voice", async (c) => {
    const body = await readBody(c, VoiceBody);
    const sql = db();
    const me = await requireAccount(sql, c.get("user"));
    assertOwnPath(body.samplePath, me.id);
    const [already] = await sql`select voice_id from public.voice_profiles where account_id = ${me.id}`;
    if (already) throw conflict("CONFLIT", "Votre compte a déjà un Passeport de voix : une seule voix par compte.");
    const jobId = await startJob(sql, { kind: "voice_check", accountId: me.id, projectId: null }, async (ctx) => {
      await ctx.step(0, "Contrôle de l’enregistrement…");
      const bytes = await files().read("samples", body.samplePath);
      const check = await checkSample({ bytes, mime: mimeOf(body.samplePath) }, body, paragraphFor(me.id), OWNER_MIN_SECONDS);
      if (check.provider) ctx.providers.controle = check.provider;
      if (check.match === "non_conforme") throw new Error(check.label);
      await ctx.step(1, "Profil public et licence signée…");
      const voiceId = `v_user_${me.id.replace(/-/g, "").slice(0, 8)}`;
      const today = new Date().toISOString().slice(0, 10);
      const licence = signLicenseServer({
        license_id: `VL-U-${me.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        voice_id: voiceId,
        holder_name: body.profile.publicName,
        holder_role: "titulaire de la voix",
        allowed_uses: ["doublage_film", "doublage_video_en_ligne"],
        forbidden_uses: ["contenu_politique", "contenu_intime"],
        forbidden_themes: ["politique"],
        projects: ["*"],
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
        const [taken] = await tx`select 1 from public.voice_profiles where account_id = ${me.id} for update`;
        if (taken) throw new Error("Votre compte a déjà un Passeport de voix.");
        await tx`
          insert into public.voice_profiles (voice_id, account_id, profile, published, sample, eleven_voice_id, cloned)
          values (${voiceId}, ${me.id}, ${tx.json(body.profile)}, true,
                  ${tx.json({ path: body.samplePath, duration: body.duration, peak: body.peak, rms: body.rms, recordedAt: new Date().toISOString(), transcript: check.transcript ?? null, wer: check.wer ?? null, match: check.match })},
                  ${DEMO_RENDER}, false)`;
        await tx`insert into public.voice_licenses (license_id, voice_id, data, status) values (${licence.license_id}, ${voiceId}, ${tx.json(licence as never)}, 'active')`;
        await appendAudit(tx, me.name, "PASSEPORT_DE_VOIX_CREE", { voix: voiceId, echantillon_s: body.duration, controle: check.match, wer: check.wer ?? null }, "CREE", { accountId: me.id });
      });
      return { voiceId, match: check.match, label: check.label, wer: check.wer ?? null };
    });
    return c.json({ jobId }, 202);
  })

  .patch("/owner/voice/profile", async (c) => {
    const patch = await readBody(c, Profile.partial().strict());
    const sql = db();
    const me = await requireAccount(sql, c.get("user"));
    const row = await myVoice(sql, me);
    const [updated] = await sql<VoiceProfileRow[]>`
      update public.voice_profiles set profile = profile || ${sql.json(patch)} where voice_id = ${row.voice_id} returning *`;
    await appendAudit(sql, me.name, "PROFIL_PUBLIC_MIS_A_JOUR", { voix: row.voice_id, ...patch }, "OK", { accountId: me.id });
    return c.json(ownedVoiceOut(updated, await licencesOf(sql, row.voice_id)));
  })

  .patch("/owner/voice/rules", async (c) => {
    const rules = await readBody(c, RulesBody);
    const sql = db();
    const me = await requireAccount(sql, c.get("user"));
    const voice = await myVoice(sql, me);
    const [current] = await licencesOf(sql, voice.voice_id);
    if (!current) throw notFound("Aucune licence signée pour votre voix.");
    // Never allowed, whatever the owner ticks: political and intimate content stay refused.
    const signed = signLicenseServer({ ...current, allowed_uses: rules.allowed_uses.filter((u) => !current.forbidden_uses.includes(u)), forbidden_themes: [...new Set(rules.forbidden_themes)] });
    if (!signed.allowed_uses.length) throw new ApiError(400, "REQUETE_INVALIDE", "Gardez au moins un usage autorisé, ou révoquez la licence.");
    await sql.begin(async (tx) => {
      await tx`update public.voice_licenses set data = ${tx.json(signed as never)}, updated_at = now() where license_id = ${signed.license_id}`;
      await appendAudit(tx, me.name, "PASSEPORT_MIS_A_JOUR", { license_id: signed.license_id, usages: signed.allowed_uses, themes: signed.forbidden_themes, signature: signed.signature }, "SIGNE", { accountId: me.id });
    });
    return c.json(signed);
  })

  .post("/owner/licenses/:licenseId/revoke", async (c) => {
    const sql = db();
    const me = await requireAccount(sql, c.get("user"));
    const lic = await myLicence(sql, me, c.req.param("licenseId"));
    if (lic.status === "revoked") return c.json(licenseOut(lic));
    const out = await sql.begin(async (tx) => {
      const [row] = await tx<VoiceLicenseRow[]>`
        update public.voice_licenses set status = 'revoked', revoked_at = now(), updated_at = now()
        where license_id = ${lic.license_id} returning license_id, voice_id, data, status, revoked_at`;
      await appendAudit(tx, me.name, "LICENCE_REVOQUEE", { license_id: lic.license_id }, "REVOQUEE", { accountId: me.id });
      // The creators who use this voice: assigned to one of their characters, or a project licence asked for.
      const creators = await tx<{ account_id: string }[]>`
        select distinct account_id from public.projects
        where exists (select 1 from jsonb_each_text(speaker_voices) v where v.value = ${lic.voice_id})
        union
        select distinct creator_account_id from public.license_requests where voice_id = ${lic.voice_id} and creator_account_id is not null`;
      for (const { account_id } of creators.filter((x) => x.account_id !== me.id))
        await notify(tx, {
          accountId: account_id,
          space: "creator",
          tone: "red",
          title: `${lic.data.holder_name} a révoqué sa licence`,
          body: "Les prochaines générations avec cette voix seront refusées. L’audio déjà livré reste tel quel.",
          link: "/bibliotheque",
        });
      return row;
    });
    return c.json(licenseOut(out));
  })

  .post("/owner/licenses/:licenseId/reinstate", async (c) => {
    const sql = db();
    const me = await requireAccount(sql, c.get("user"));
    const lic = await myLicence(sql, me, c.req.param("licenseId"));
    const signed = signLicenseServer({ ...licenseOut(lic), status: "active", revoked_at: null });
    await sql.begin(async (tx) => {
      await tx`update public.voice_licenses set data = ${tx.json(signed as never)}, status = 'active', revoked_at = null, updated_at = now() where license_id = ${lic.license_id}`;
      await appendAudit(tx, me.name, "LICENCE_RETABLIE", { license_id: lic.license_id, signature: signed.signature }, "SIGNE", { accountId: me.id });
    });
    return c.json(signed);
  });
