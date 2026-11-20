/**
 * Family dossier of a deceased person (spec § 4, Écran 06): the signed document goes to the private
 * « dossiers » bucket, then the consistency check runs in the background (dossier_check task):
 * « Document reçu » → « Analyse en cours » → one of three outcomes. Only « Correspondance détectée »
 * allows the creator's human validation. The document is never public: only its reference, status
 * and the check's outcome reach the Passeport 360°.
 */
import { Hono } from "hono";
import type { Sql } from "postgres";
import { z } from "zod";
import { dossierReference, OUTCOME_LABEL } from "../../src/state/workflow.js";
import { requireAccount } from "../accounts.js";
import { checkDossier } from "../ai/dossier.js";
import { appendAudit } from "../audit.js";
import type { AppEnv, AuthUser } from "../auth.js";
import type { DossierRow, ProjectRow } from "../compose.js";
import { db } from "../db.js";
import { conflict, notFound, readBody } from "../errors.js";
import { startJob } from "../jobs.js";
import { notify } from "../notify.js";
import { mutateProject, ownedProject, readProject } from "../projects.js";
import { assertOwnPath, files } from "../storage.js";

const DossierBody = z.object({
  path: z.string().min(1).max(300),
  deceasedName: z.string().trim().min(1).max(120),
  declaredRole: z.string().trim().min(1).max(300),
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().min(1).max(20 * 1024 * 1024),
  fileType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
});

async function currentDossier(sql: Sql, pid: string, key: string): Promise<DossierRow | undefined> {
  const [row] = await sql<DossierRow[]>`
    select * from public.dossiers where project_id = ${pid} and character_key = ${key} and not superseded
    order by received_at desc limit 1`;
  return row;
}

type FramePath = { t: number; path: string };

/** Up to four analysis frames taken while the target character speaks. */
function targetFrames(project: ProjectRow, key: string): FramePath[] {
  const paths = ((project.video as { framePaths?: FramePath[] } | null)?.framePaths ?? []).filter((f) => typeof f?.path === "string");
  const spans = project.segments.filter((s) => s.speaker === key);
  return paths.filter((f) => spans.some((s) => f.t >= s.start && f.t <= s.end)).slice(0, 4);
}

async function runCheck(sql: Sql, user: AuthUser, project: ProjectRow, key: string, dossierId: string, path: string, fileType: string, name: string, role: string) {
  return startJob(sql, { kind: "dossier_check", accountId: user.id, projectId: project.id, detail: key }, async (ctx) => {
    await ctx.step(0, "Lecture du document et comparaison avec la vidéo…");
    await sql`update public.dossiers set status = 'analyse' where id = ${dossierId} and status = 'recu'`;
    const document = { bytes: await files().read("dossiers", path), mime: fileType };
    const frames = await Promise.all(
      targetFrames(project, key).map(async (f) => ({ t: f.t, bytes: await files().read("media", f.path).catch(() => new Uint8Array()), mime: "image/jpeg" })),
    );
    const characters = Object.values(project.characters).map((c) => {
      const lines = project.segments.filter((s) => s.speaker === c.key);
      return { key: c.key, name: c.name, description: c.description, lines: lines.length, firstLines: lines.slice(0, 3).map((s) => s.translation || s.source) };
    });
    const { check, notes } = await checkDossier({ document, declaredName: name, declaredRole: role, targetKey: key, characters, frames: frames.filter((f) => f.bytes.length) });
    if (check.provider) ctx.providers.dossier = check.provider;
    await sql.begin(async (tx) => {
      const [still] = await tx<DossierRow[]>`select * from public.dossiers where id = ${dossierId} for update`;
      if (!still || still.superseded) return; // replaced meanwhile: the old result is dropped
      await tx`update public.dossiers set status = ${check.outcome}, ai_check = ${tx.json(check as never)} where id = ${dossierId}`;
      await appendAudit(tx, `contrôle IA (${check.provider ?? "inconnu"})`, "CONTROLE_COHERENCE", { projet: project.id, personnage: key, resultat: check.outcome }, check.outcome.toUpperCase(), {
        projectId: project.id,
        accountId: user.id,
      });
      const target = project.characters[key];
      await notify(tx, {
        accountId: project.account_id,
        space: "creator",
        tone: check.outcome === "correspondance" ? "ok" : "warn",
        title: check.outcome === "correspondance" ? "Analyse familiale terminée : correspondance détectée" : `Autorisation non validée : ${OUTCOME_LABEL[check.outcome].toLowerCase()}`,
        body: `${project.title} · ${target?.name ?? key}.`,
        link: `/projet/${project.id}/autorisations`,
      });
    });
    return { outcome: check.outcome, notes };
  });
}

export const dossiers = new Hono<AppEnv>()
  .post("/projects/:id/characters/:key/dossier", async (c) => {
    const body = await readBody(c, DossierBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const pid = c.req.param("id");
    assertOwnPath(body.path, `${user.id}/${pid}/${key}`);
    let dossierId = "";
    const project = await mutateProject(sql, user, pid, async (tx, row) => {
      const ch = row.characters[key];
      if (!ch) throw notFound("Personnage introuvable.");
      await tx`update public.dossiers set superseded = true where project_id = ${row.id} and character_key = ${key} and not superseded`;
      const reference = dossierReference(`${row.id}/${key}/${body.fileHash}`);
      const [d] = await tx<{ id: string }[]>`
        insert into public.dossiers (project_id, character_key, status, deceased_name, declared_role, reference, file_path, file_name, file_size, file_type, file_hash)
        values (${row.id}, ${key}, 'recu', ${body.deceasedName}, ${body.declaredRole}, ${reference}, ${body.path}, ${body.fileName}, ${body.fileSize}, ${body.fileType}, ${body.fileHash})
        returning id`;
      dossierId = d.id;
      await appendAudit(tx, me.name, "DOSSIER_FAMILIAL_RECU", { projet: row.id, personnage: key, empreinte: body.fileHash, reference }, "RECU", { projectId: row.id, accountId: user.id });
      await notify(tx, { accountId: row.account_id, space: "creator", tone: "plain", title: "Document familial reçu", body: `${row.title} · ${ch.name} · contrôle de cohérence lancé.`, link: `/projet/${row.id}/autorisations` });
    });
    const row = await ownedProject(sql, user, pid);
    const jobId = await runCheck(sql, user, row, key, dossierId, body.path, body.fileType, body.deceasedName, body.declaredRole);
    return c.json({ jobId, project }, 202);
  })

  .post("/projects/:id/characters/:key/dossier/validate", async (c) => {
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const d = await currentDossier(tx as unknown as Sql, row.id, key);
      if (!d || d.status !== "correspondance") throw conflict("CONFLIT", "Seule une « Correspondance détectée » peut être validée.");
      await tx`update public.dossiers set status = 'valide', validated_at = now(), validated_by = ${me.name} where id = ${d.id}`;
      await appendAudit(tx, me.name, "DOSSIER_FAMILIAL_VALIDE", { projet: row.id, personnage: key }, "VALIDE", { projectId: row.id, accountId: user.id });
    });
    return c.json(project);
  })

  .post("/projects/:id/characters/:key/dossier/complementary", async (c) => {
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const d = await currentDossier(tx as unknown as Sql, row.id, key);
      if (!d) throw notFound("Aucun dossier pour ce personnage.");
      await tx`update public.dossiers set complementary_requested_at = now() where id = ${d.id}`;
      await appendAudit(tx, me.name, "VERIFICATION_COMPLEMENTAIRE_DEMANDEE", { projet: row.id, personnage: key }, "EN_ATTENTE", { projectId: row.id, accountId: user.id });
    });
    return c.json(project);
  })

  .delete("/projects/:id/characters/:key/dossier", async (c) => {
    const sql = db();
    const user = c.get("user");
    const key = c.req.param("key");
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      await tx`update public.dossiers set superseded = true where project_id = ${row.id} and character_key = ${key} and not superseded`;
    });
    return c.json(project ?? (await readProject(sql, c.req.param("id"))));
  });
