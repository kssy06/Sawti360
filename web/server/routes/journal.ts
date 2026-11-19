/**
 * GET /api/journal?projectId= → the platform's chain (or the entries of one of my projects).
 * POST /api/journal/export { kind, detail } → the EXPORT entry (SRT, JSON, MP4…), as logExport did.
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAccount } from "../accounts.js";
import { appendAudit, readJournal } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { badRequest, readBody, readQuery } from "../errors.js";
import { ownedProject } from "../projects.js";

const Query = z.object({ projectId: z.string().min(1).max(80).optional() });

const ExportBody = z.object({
  kind: z.string().regex(/^[A-Z0-9_]{2,40}$/),
  detail: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).default({}),
});

export const journal = new Hono<AppEnv>()
  .get("/journal", async (c) => {
    const { projectId } = readQuery(c, Query);
    const sql = db();
    if (projectId) await ownedProject(sql, c.get("user"), projectId);
    return c.json(await readJournal(sql, { projectId }));
  })
  .post("/journal/export", async (c) => {
    const { kind, detail } = await readBody(c, ExportBody);
    if (Object.keys(detail).length > 12) throw badRequest("Détail trop long.");
    const sql = db();
    const user = c.get("user");
    const me = await requireAccount(sql, user);
    const projectId = typeof detail.projet === "string" ? detail.projet : null;
    if (projectId) await ownedProject(sql, user, projectId);
    const entry = await appendAudit(sql, me.name, "EXPORT", { type: kind, ...detail }, "OK", { projectId, accountId: user.id });
    return c.json(entry, 201);
  });
