/** GET /api/me and PATCH /api/me { name?, org? } → the connected account and its jetons. */
import { Hono } from "hono";
import { z } from "zod";
import { initialsOf, requireAccount } from "../accounts.js";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { readBody } from "../errors.js";

const Patch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    org: z.string().trim().max(120).optional(),
  })
  .strict();

export const me = new Hono<AppEnv>()
  .get("/me", async (c) => c.json(await requireAccount(db(), c.get("user"))))
  .patch("/me", async (c) => {
    const body = await readBody(c, Patch);
    const sql = db();
    const user = c.get("user");
    await requireAccount(sql, user);
    if (body.name !== undefined) await sql`update public.accounts set name = ${body.name}, initials = ${initialsOf(body.name)} where id = ${user.id}`;
    if (body.org !== undefined) await sql`update public.accounts set org = ${body.org} where id = ${user.id}`;
    return c.json(await requireAccount(sql, user));
  });
