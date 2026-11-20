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
import type { Character } from "../../src/state/workflow.js";
import { ApiError, badRequest, notFound, readBody } from "../errors.js";
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
const MergeBody = z.object({ into: z.string().trim().min(1).max(64) }).strict();
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_CHARACTERS = 12;

export const characters = new Hono<AppEnv>()
  // The analysis heard one voice where there are two: the creator adds a speaker, then gives it its lines.
  .post("/projects/:id/characters", async (c) => {
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const count = Object.keys(row.characters).length;
      if (count >= MAX_CHARACTERS) throw badRequest(`${MAX_CHARACTERS} intervenants au plus par projet.`);
      const taken = new Set([...Object.keys(row.characters), ...Object.keys(row.speakers)]);
      let n = 1;
      while (taken.has(`p${n}`)) n += 1;
      const key = `p${n}`;
      const names = new Set(Object.values(row.characters).map((x) => x.name));
      let i = count;
      while (names.has(`Intervenant ${LETTERS[i] ?? i + 1}`)) i += 1;
      const name = `Intervenant ${LETTERS[i] ?? i + 1}`;
      const ch: Character = { key, proposedName: name, proposedDescription: "Ajouté par le créateur : une voix que l’analyse n’avait pas séparée.", name, description: "", confirmed: false, useOriginal: false, lifeStatus: "a_renseigner" };
      await updateProject(tx, row.id, { characters: { ...row.characters, [key]: ch }, speakers: { ...row.speakers, [key]: { name, gender: "inconnu" } } });
      await appendAudit(tx, me.name, "PERSONNAGE_AJOUTE", { projet: row.id, personnage: key, nom: name }, "HUMAIN", { projectId: row.id, accountId: user.id });
    });
    return c.json(project, 201);
  })

  // The analysis split one person into two: every line of `key` goes to `into`, and `key` disappears.
  .post("/projects/:id/characters/:key/merge", async (c) => {
    const { into } = await readBody(c, MergeBody);
    const key = c.req.param("key");
    if (into === key) throw badRequest("Choisissez un autre personnage.");
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      if (!row.characters[key] || !row.characters[into]) throw notFound("Personnage introuvable.");
      const [busy] = await tx<{ n: number }[]>`
        select (select count(*) from public.consents where project_id = ${row.id} and character_key = ${key})
             + (select count(*) from public.dossiers where project_id = ${row.id} and character_key = ${key})
             + (select count(*) from public.license_requests where project_id = ${row.id} and character_key = ${key}) as n`;
      if (Number(busy?.n ?? 0) > 0)
        throw new ApiError(409, "PERSONNAGE_ENGAGE", "Ce personnage a déjà une demande d’autorisation, un dossier ou une licence : il ne peut plus être fusionné.");
      const moved = new Set(row.segments.filter((s) => s.speaker === key).map((s) => s.id));
      const { [key]: _c, ...chars } = row.characters;
      const { [key]: _s, ...speakers } = row.speakers;
      const { [key]: _v, ...voices } = row.speaker_voices ?? {};
      // The moved lines will speak with another voice: their old audio no longer applies.
      const gens = Object.fromEntries(Object.entries(row.gens ?? {}).filter(([id]) => !moved.has(id)));
      await updateProject(tx, row.id, {
        segments: row.segments.map((s) => (s.speaker === key ? { ...s, speaker: into } : s)),
        characters: chars,
        speakers,
        speaker_voices: voices,
        gens,
      });
      await appendAudit(tx, me.name, "PERSONNAGES_FUSIONNES", { projet: row.id, personnage: key, dans: into, repliques: moved.size }, "HUMAIN", { projectId: row.id, accountId: user.id });
    });
    return c.json(project);
  })

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
