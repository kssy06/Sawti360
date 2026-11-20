/**
 * Projects and segments (API.md « Projets »). Every change writes the same journal entries as the
 * simulated store (VIDEO_IMPORTEE, TEXTE_VALIDE, VALIDATION_RETIREE).
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { sha256Hex } from "../../src/core/canonical.js";
import { EMOTION_KEYS } from "../../src/core/emotion.js";
import type { Segment } from "../../src/core/types.js";
import type { Project } from "../../src/state/store.js";
import { FORMAT_LABEL } from "../../src/state/workflow.js";
import { requireAccount } from "../accounts.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { ApiError, badRequest, notFound, readBody } from "../errors.js";
import { mutateProject, ownedProject, readProject, updateProject } from "../projects.js";

const POSTER_MAX = 150 * 1024;

export const Format = z.enum(["film", "podcast", "reel"]);
export const UseCase = z.enum(["doublage_film", "doublage_video_en_ligne", "bande_annonce", "publicite", "contenu_politique", "contenu_intime"]);

const VideoMeta = z.object({
  name: z.string().trim().min(1).max(300),
  size: z.number().min(0),
  type: z.string().max(120),
  duration: z.number().min(0).max(6 * 3600),
  width: z.number().min(0),
  height: z.number().min(0),
  privacy: z.enum(["publique", "inedite"]),
  poster: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  url: z.url().max(2000).optional(),
});

const CreateBody = z.object({
  title: z.string().max(200).default(""),
  format: Format,
  privacy: z.enum(["publique", "inedite"]).optional(),
  video: VideoMeta,
});

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().max(300).optional(),
    use: UseCase.optional(),
    format: Format.optional(),
  })
  .strict();

const SegmentBody = z
  .object({
    translation: z.string().max(2000).optional(),
    validated: z.boolean().optional(),
    source: z.string().max(2000).optional(),
    speaker: z.string().min(1).max(64).optional(),
    emotion: z.enum(EMOTION_KEYS).optional(),
    start: z.number().min(0).optional(),
    end: z.number().min(0).optional(),
  })
  .strict();

export const newProjectId = () => `v_${BigInt(`0x${randomBytes(6).toString("hex")}`).toString(36).padStart(8, "0").slice(-8)}`;

/** Default title, as the simulated store derives it from the file name. */
export const titleFrom = (title: string, fileName: string) =>
  title.trim() || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Vidéo";

export const projects = new Hono<AppEnv>()
  .post("/projects", async (c) => {
    const body = await readBody(c, CreateBody);
    if ((body.video.poster?.length ?? 0) > POSTER_MAX) throw new ApiError(413, "FICHIER_TROP_GROS", "Vignette trop lourde : 150 Ko au plus.");
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const id = newProjectId();
    const meta = { ...body.video, privacy: body.privacy ?? body.video.privacy };
    const project = (await sql.begin(async (tx) => {
      await tx`
        insert into public.projects (id, account_id, title, subtitle, kind, format, use_case, example, video, pipeline)
        values (${id}, ${user.id}, ${titleFrom(body.title, meta.name)},
                ${`${FORMAT_LABEL[body.format]} · ${meta.privacy === "publique" ? "déjà publique" : "inédite"}`},
                'video', ${body.format}, ${body.format === "film" ? "doublage_film" : "doublage_video_en_ligne"}, false,
                ${tx.json(meta)}, ${tx.json({ status: "running", step: 0, simulated: true })})`;
      await appendAudit(
        tx,
        me.name,
        "VIDEO_IMPORTEE",
        { nom: meta.name, taille: meta.size, duree: meta.duration, empreinte: meta.sha256 ?? null, confidentialite: meta.privacy },
        meta.privacy === "publique" ? "PUBLIQUE" : "INEDITE",
        { projectId: id, accountId: user.id },
      );
      return readProject(tx, id);
    })) as Project;
    return c.json(project, 201);
  })

  .get("/projects/:id", async (c) => {
    const sql = db();
    await ownedProject(sql, c.get("user"), c.req.param("id"));
    return c.json(await readProject(sql, c.req.param("id")));
  })

  .patch("/projects/:id", async (c) => {
    const body = await readBody(c, PatchBody);
    const project = await mutateProject(db(), c.get("user"), c.req.param("id"), async (tx) => {
      await updateProject(tx, c.req.param("id"), { title: body.title, subtitle: body.subtitle, use_case: body.use, format: body.format });
    });
    return c.json(project);
  })

  .delete("/projects/:id", async (c) => {
    const sql = db();
    const row = await ownedProject(sql, c.get("user"), c.req.param("id"));
    if (row.example) throw new ApiError(403, "INTERDIT", "Les projets d’exemple ne peuvent pas être supprimés.");
    await sql`delete from public.projects where id = ${row.id}`;
    return c.body(null, 204);
  })

  .patch("/projects/:id/segments/:segId", async (c) => {
    const body = await readBody(c, SegmentBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const segId = c.req.param("segId");
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const seg = row.segments.find((s) => s.id === segId);
      if (!seg) throw notFound("Réplique introuvable.");
      const next: Segment = { ...seg };
      if (body.translation !== undefined && body.translation !== seg.translation) {
        next.translation = body.translation;
        next.validated = false;
      }
      if (body.source !== undefined) next.source = body.source;
      if (body.speaker !== undefined) {
        if (!row.characters[body.speaker] && !row.speakers[body.speaker]) throw badRequest("Intervenant inconnu dans ce projet.");
        next.speaker = body.speaker;
      }
      if (body.emotion !== undefined) next.emotion = body.emotion === "neutre" ? undefined : body.emotion;
      if (body.start !== undefined) next.start = body.start;
      if (body.end !== undefined) next.end = body.end;
      if (next.end - next.start < 0.3) throw badRequest("La réplique doit durer au moins 0,3 s.");
      const validationChanged = body.validated !== undefined && body.validated !== next.validated;
      if (body.validated !== undefined) {
        if (body.validated && !next.translation.trim()) throw badRequest("Une réplique vide ne peut pas être approuvée.");
        next.validated = body.validated;
      }
      // A line given to another speaker, or to be said with another feeling: its old audio no longer applies.
      const gens = (next.speaker !== seg.speaker || next.emotion !== seg.emotion) && row.gens?.[segId] ? Object.fromEntries(Object.entries(row.gens).filter(([id]) => id !== segId)) : undefined;
      await updateProject(tx, row.id, { segments: row.segments.map((s) => (s.id === segId ? next : s)), gens });
      if (validationChanged) {
        await appendAudit(
          tx,
          me.name,
          next.validated ? "TEXTE_VALIDE" : "VALIDATION_RETIREE",
          { segment: segId, text_hash: sha256Hex(next.translation) },
          next.validated ? "VALIDE" : "",
          { projectId: row.id, accountId: user.id },
        );
      }
    });
    return c.json(project);
  });
