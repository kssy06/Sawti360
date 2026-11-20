/**
 * The bell (A9, spec § 8). The routes write the notifications at the moment of the event (server/notify.ts);
 * the browser reads them here every 15 s, on every device of the account.
 *  GET  /api/notifications?since=<iso> → Notice[] (both spaces of the account, newest first, 50 at most)
 *  POST /api/notifications/read { space } → 204: « tout lu » for that space
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../auth.js";
import { noticeOut, type NoticeRow } from "../compose.js";
import { db } from "../db.js";
import { readBody, readQuery } from "../errors.js";

const Since = z.object({ since: z.iso.datetime({ offset: true }).optional() });
const Read = z.object({ space: z.enum(["creator", "owner"]) });

export const notifications = new Hono<AppEnv>()
  .get("/notifications", async (c) => {
    const { since } = readQuery(c, Since);
    const rows = await db()<NoticeRow[]>`
      select * from public.notifications
      where account_id = ${c.get("user").id} and (${since ?? null}::timestamptz is null or at > ${since ?? null}::timestamptz)
      order by at desc limit 50`;
    return c.json(rows.map(noticeOut));
  })

  .post("/notifications/read", async (c) => {
    const { space } = await readBody(c, Read);
    await db()`update public.notifications set read = true where account_id = ${c.get("user").id} and space = ${space} and not read`;
    return c.body(null, 204);
  });
