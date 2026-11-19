/**
 * Notifications (spec § 8): written by the routes at the moment of the event, for the right
 * account and the right space (creator or voice owner). The browser reads them with the bootstrap
 * and GET /api/notifications.
 */
import type { Sql } from "postgres";
import type { Notice } from "../src/state/store.js";
import type { Db } from "./audit.js";

export interface NoticeInput {
  accountId: string | null | undefined;
  space: "creator" | "owner";
  tone: Notice["tone"];
  title: string;
  body: string;
  link?: string;
}

/** Writes the notification; nothing for a fictional profile without account. */
export async function notify(sql: Db, n: NoticeInput): Promise<void> {
  if (!n.accountId) return;
  await (sql as Sql)`
    insert into public.notifications (account_id, space, tone, title, body, link)
    values (${n.accountId}, ${n.space}, ${n.tone}, ${n.title}, ${n.body}, ${n.link ?? null})`;
}
