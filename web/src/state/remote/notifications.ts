/**
 * The bell in back-end mode (A9): new notifications are fetched every 15 s while the tab is visible,
 * so an answer given on another device (a licence accepted, a consent given…) shows up here.
 * A new notification also reloads the account's data, since something changed elsewhere.
 */
import { useEffect } from "react";
import { api } from "../../api/client";
import { BACKEND } from "../../lib/backend";
import type { Notice } from "../store";
import { bootstrap } from "./bootstrap";
import { report } from "./report";
import type { Get, Set } from "./state";

export const POLL_NOTICES_MS = 15_000;

let polling: Promise<void> | null = null;

export function pollNotifications(set: Set, get: Get): Promise<void> {
  if (polling || !get().session) return polling ?? Promise.resolve();
  const known = get().notifications;
  // A minute of overlap: a notice written in a longer transaction can carry an earlier time.
  const newest = known.reduce((a, n) => (n.at > a ? n.at : a), "");
  const since = newest ? new Date(Date.parse(newest) - 60_000).toISOString() : "";
  polling = api
    .get<Notice[]>(`/notifications${since ? `?since=${encodeURIComponent(since)}` : ""}`)
    .then(async (fresh) => {
      const ids = new Set(known.map((n) => n.id));
      if (fresh.some((n) => !ids.has(n.id))) await bootstrap(set, get);
    })
    .catch(() => undefined) // a missed poll is retried 15 s later
    .finally(() => {
      polling = null;
    });
  return polling;
}

/** Polls while the screen is visible (back-end mode only). */
export function useNotificationPolling(set: Set, get: Get): void {
  useEffect(() => {
    if (!BACKEND) return;
    const tick = () => document.visibilityState === "visible" && void pollNotifications(set, get);
    const timer = setInterval(tick, POLL_NOTICES_MS);
    return () => clearInterval(timer);
  }, [set, get]);
}

/** « Tout lu » for the current space: at once here, then on the server (all devices). */
export async function markRead(set: Set, get: Get): Promise<void> {
  const me = get().session?.accountId;
  const space = get().persona;
  set((s) => ({ notifications: s.notifications.map((n) => (n.to === me && n.space === space ? { ...n, read: true } : n)) }));
  await api.post<void>("/notifications/read", { space }).catch(report);
}
