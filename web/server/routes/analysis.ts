/**
 * POST /api/projects/:id/analysis → 202 { jobId }: the real analysis of the uploaded audio and frames
 * (Whisper → Gemini → LLM 2), in the background; each step is written to projects.pipeline so the
 * analysis screen keeps its progress. The same audio (SHA-256) is never sent to the AI twice.
 * POST /api/projects/:id/analysis/example → Project: last resort, the illustrative example, labelled « Simulé ».
 */
import { Hono } from "hono";
import { z } from "zod";
import { exampleAnalysis } from "../../src/mock/analysisExample.js";
import type { Pipeline } from "../../src/state/store.js";
import { requireAccount } from "../accounts.js";
import { analyse } from "../ai/analysis.js";
import { reviewSegments } from "../ai/review.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import type { ProjectRow } from "../compose.js";
import { db } from "../db.js";
import { ApiError, readBody } from "../errors.js";
import { ensureIdle, startJob } from "../jobs.js";
import { mutateProject, ownedProject, updateProject } from "../projects.js";
import { assertOwnPath, files } from "../storage.js";

/** P0 limit: excerpts of 5 minutes at most (cutting long videos into windows comes after the prototype). */
export const MAX_ANALYSIS_S = 300;

const AnalysisBody = z.object({
  audio: z.object({
    path: z.string().min(1).max(300),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    duration: z.number().min(0.5),
    mime: z.enum(["audio/ogg", "audio/wav"]),
  }),
  frames: z
    .array(z.object({ t: z.number().min(0).max(36_000), path: z.string().min(1).max(300) }))
    .max(60)
    .default([]),
  originalPath: z.string().max(300).optional(),
});

const CACHE_NOTE = "résultat repris : même empreinte audio, l’IA n’a pas été rappelée";

async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

export const analysis = new Hono<AppEnv>()
  .post("/projects/:id/analysis", async (c) => {
    const body = await readBody(c, AnalysisBody);
    if (body.audio.duration > MAX_ANALYSIS_S + 1)
      throw new ApiError(413, "FICHIER_TROP_GROS", "Extrait trop long : 5 minutes au plus pour l’analyse dans ce prototype.");
    const sql = db();
    const user = c.get("user");
    const project = await ownedProject(sql, user, c.req.param("id"));
    const prefix = `${user.id}/${project.id}`;
    assertOwnPath(body.audio.path, prefix);
    for (const f of body.frames) assertOwnPath(f.path, prefix);
    if (body.originalPath) assertOwnPath(body.originalPath, prefix);
    await ensureIdle(sql, project.id, "analysis");
    const me = await requireAccount(sql, user);

    const [cached] = await sql<ProjectRow[]>`
      select * from public.projects
      where account_id = ${user.id} and audio_hash = ${body.audio.sha256} and pipeline->>'status' = 'done'
        and coalesce((pipeline->>'simulated')::boolean, true) = false
      order by updated_at desc limit 1`;

    const jobId = await startJob(sql, { kind: "analysis", accountId: user.id, projectId: project.id }, async (ctx) => {
      const pipeline = (step: number, extra: Partial<Pipeline> = {}): Pipeline => ({ status: "running", step, simulated: false, jobId: ctx.id, ...extra });
      const step = async (n: number, detail?: string) => {
        await ctx.step(n, detail);
        await sql`update public.projects set pipeline = ${sql.json(pipeline(n) as never)} where id = ${project.id}`;
      };
      let current = 0;
      const track = async (n: number, detail?: string) => {
        current = n;
        await step(n, detail);
      };
      const meta = { projectId: project.id, accountId: user.id };
      const video = {
        ...(project.video ?? { name: "", size: 0, type: "", duration: body.audio.duration, width: 0, height: 0, privacy: "inedite" as const }),
        audioPath: body.audio.path,
        // Kept so the family-dossier check can show the model frames where a character speaks.
        framePaths: body.frames,
        ...(body.originalPath ? { originalPath: body.originalPath } : {}),
      };

      try {
        await track(0, "Lecture de l’audio et des images envoyées…");

        if (cached) {
          ctx.providers.cache = CACHE_NOTE;
          Object.assign(ctx.providers, cached.pipeline?.providers ?? {});
          await mutateProject(sql, user, project.id, async (tx) => {
            await updateProject(tx, project.id, {
              segments: cached.segments.map((s) => ({ ...s, validated: false })),
              speakers: cached.speakers,
              characters: cached.characters,
              speaker_voices: {},
              proposals: cached.proposals,
              reviews: cached.reviews,
              pipeline: { status: "done", step: 5, simulated: false, providers: { ...(cached.pipeline?.providers ?? {}), cache: CACHE_NOTE }, jobId: ctx.id },
              audio_hash: body.audio.sha256,
              video: video as never,
            });
            await appendAudit(tx, me.name, "ANALYSE_IA", { projet: project.id, source: cached.id, empreinte_audio: body.audio.sha256 }, "CACHE", meta);
          });
          return { segments: cached.segments.length, cache: cached.id };
        }

        const audioBytes = await files().read("media", body.audio.path);
        const frames = await inBatches(body.frames, 6, async (f) => ({ t: f.t, bytes: await files().read("media", f.path), mime: f.path.endsWith(".webp") ? "image/webp" : "image/jpeg" }));
        const result = await analyse(
          { audio: { bytes: audioBytes, mime: body.audio.mime }, frames, title: project.title, format: project.format, duration: body.audio.duration },
          track,
        );
        Object.assign(ctx.providers, result.providers);

        await track(4, `Relecture de ${result.assembled.segments.length} répliques par le second modèle…`);
        const reviewed = await reviewSegments(result.assembled.segments);
        ctx.providers.llm2 = reviewed.provider;

        const { assembled } = result;
        await mutateProject(sql, user, project.id, async (tx) => {
          await updateProject(tx, project.id, {
            segments: assembled.segments,
            speakers: assembled.speakers,
            characters: assembled.characters,
            speaker_voices: {},
            proposals: assembled.proposals,
            reviews: reviewed.reviews,
            pipeline: { status: "done", step: 5, simulated: false, providers: { ...ctx.providers }, jobId: ctx.id },
            audio_hash: body.audio.sha256,
            video: video as never,
          });
          await appendAudit(
            tx,
            me.name,
            "ANALYSE_IA",
            { projet: project.id, empreinte_audio: body.audio.sha256, repliques: assembled.segments.length, intervenants: Object.keys(assembled.characters).length, modeles: ctx.providers },
            "PROPOSITION",
            meta,
          );
        });
        return { segments: assembled.segments.length, speakers: Object.keys(assembled.characters).length, notes: [...result.notes, ...reviewed.notes] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await sql`update public.projects set pipeline = ${sql.json(pipeline(current, { status: "error", error: message.slice(0, 500) }) as never)} where id = ${project.id}`;
        throw err;
      }
    });
    await sql`update public.projects set pipeline = ${sql.json({ status: "running", step: 0, simulated: false, jobId } as never)} where id = ${project.id}`;
    return c.json({ jobId }, 202);
  })

  .post("/projects/:id/analysis/example", async (c) => {
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const project = await mutateProject(sql, user, c.req.param("id"), async (tx, row) => {
      const ex = exampleAnalysis(row.video?.duration ?? 20);
      await updateProject(tx, row.id, { ...ex, speaker_voices: {}, pipeline: { status: "done", step: 5, simulated: true } });
      await appendAudit(tx, me.name, "ANALYSE_SIMULEE", { projet: row.id, repliques: ex.segments.length }, "SIMULE", { projectId: row.id, accountId: user.id });
    });
    return c.json(project);
  });
