/**
 * Characters (Écran 05) and voice assignment (Écran 09). The AI proposes, the creator decides:
 * nothing here is automatic, and each decision is written to the journal.
 */
import { Hono } from "hono";
import { z } from "zod";
import { voiceById } from "../../src/core/catalog.js";
import { requireAccount } from "../accounts.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { badRequest, notFound, readBody } from "../errors.js";
import { mutateProject, updateProject } from "../projects.js";

const CharacterBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    confirmed: z.boolean().optional(),
    useOriginal: z.boolean().optional(),
    lifeStatus: z.enum(["a_renseigner", "vivant", "decede"]).optional(),
  })
  .strict();

const VoiceBody = z.object({ voiceId: z.string().trim().min(1).max(80) });

export const characters = new Hono<AppEnv>()
  .patch("/projects/:id/characters/:key", async (c) => {
    const body = await readBody(c, CharacterBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const ch = row.characters[key];
      if (!ch) throw notFound("Personnage introuvable.");
      const next = { ...ch };
      if (body.name !== undefined) next.name = body.name;
      if (body.description !== undefined) next.description = body.description;
      if (body.useOriginal !== undefined) next.useOriginal = body.useOriginal;
      if (body.lifeStatus !== undefined) next.lifeStatus = body.lifeStatus;
      const confirming = body.confirmed === true;
      if (body.confirmed !== undefined) next.confirmed = body.confirmed;
      const speakers = confirming ? { ...row.speakers, [key]: { ...(row.speakers[key] ?? { gender: "inconnu" as const }), name: next.name } } : undefined;
      await updateProject(tx, row.id, { characters: { ...row.characters, [key]: next }, speakers });
      const meta = { projectId: row.id, accountId: user.id };
      if (confirming) await appendAudit(tx, me.name, "PERSONNAGE_CONFIRME", { projet: row.id, personnage: key, nom: next.name }, "HUMAIN", meta);
      if (body.lifeStatus !== undefined)
        await appendAudit(tx, me.name, "STATUT_DE_VIE_RENSEIGNE", { projet: row.id, personnage: key, statut: body.lifeStatus }, body.lifeStatus.toUpperCase(), meta);
    });
    return c.json(project);
  })

  .post("/projects/:id/characters/:key/voice", async (c) => {
    const { voiceId } = await readBody(c, VoiceBody);
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const key = c.req.param("key");
    const catalogue = voiceById(voiceId);
    if (!catalogue) {
      const [profile] = await sql`select voice_id from public.voice_profiles where voice_id = ${voiceId}`;
      if (!profile) throw badRequest("Voix inconnue de la bibliothèque.");
    }
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const ch = row.characters[key];
      if (!ch) throw notFound("Personnage introuvable.");
      await updateProject(tx, row.id, {
        speaker_voices: { ...row.speaker_voices, [key]: voiceId },
        characters: { ...row.characters, [key]: { ...ch, useOriginal: false } },
      });
      await appendAudit(tx, me.name, "VOIX_ATTRIBUEE", { projet: row.id, personnage: key, voix: voiceId }, catalogue?.kind === "base" ? "IA" : "LICENCE", {
        projectId: row.id,
        accountId: user.id,
      });
    });
    return c.json(project);
  });
