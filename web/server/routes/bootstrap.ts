/**
 * GET /api/bootstrap: everything the store needs for the connected account, in the exact
 * shapes of API.md § 2 (Bootstrap). Called after sign-in, when the tab comes back, and when a
 * new notification arrives.
 */
import { Hono } from "hono";
import type { Sql } from "postgres";
import type { Passport360 } from "../../src/core/passport.js";
import { requireAccount } from "../accounts.js";
import { journalHead, type Db } from "../audit.js";
import type { AppEnv, AuthUser } from "../auth.js";
import {
  licenseOut,
  noticeOut,
  ownedVoiceOut,
  profileOut,
  requestOut,
  usageOut,
  type LicenseRequestRow,
  type NoticeRow,
  type UsageRowDb,
  type VoiceLicenseRow,
  type VoiceProfileRow,
} from "../compose.js";
import { db } from "../db.js";
import { projectsOf } from "../projects.js";

export async function loadBootstrap(sql: Db, user: AuthUser) {
  const q = sql as Sql;
  const account = await requireAccount(q, user);
  const [projects, licenseRows, profileRows, requestRows, noticeRows, passportRows, head] = await Promise.all([
    projectsOf(q, user.id),
    q<VoiceLicenseRow[]>`select license_id, voice_id, data, status, revoked_at from public.voice_licenses order by license_id`,
    q<VoiceProfileRow[]>`select * from public.voice_profiles order by created_at, voice_id`,
    q<LicenseRequestRow[]>`
      select * from public.license_requests
      where creator_account_id = ${user.id} or owner_account_id = ${user.id}
      order by sent_at, id`,
    q<NoticeRow[]>`select * from public.notifications where account_id = ${user.id} order by at desc limit 50`,
    q<{ project_id: string; data: Passport360 }[]>`
      select distinct on (p.project_id) p.project_id, p.data
      from public.passports p join public.projects pr on pr.id = p.project_id
      where pr.account_id = ${user.id}
      order by p.project_id, p.created_at desc`,
    journalHead(q),
  ]);
  const licenses = licenseRows.map(licenseOut);
  const mine = profileRows.find((p) => p.account_id === user.id);
  const usageRows = await q<UsageRowDb[]>`
    select * from public.usage_rows
    where creator_account_id = ${user.id} or voice_id = ${mine?.voice_id ?? ""}
    order by at desc limit 500`;
  return {
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      org: account.org,
      initials: account.initials,
      plan: account.plan,
      isDemo: account.isDemo,
      demoKey: account.demoKey,
    },
    balance: account.balance,
    projects: Object.fromEntries(projects.map((p) => [p.id, p])),
    order: projects.map((p) => p.id),
    requests: requestRows.map(requestOut),
    notifications: noticeRows.map(noticeOut),
    usage: usageRows.map(usageOut),
    licenses,
    ownedVoices: mine ? { [user.id]: ownedVoiceOut(mine, licenses) } : {},
    profiles: profileRows.filter((p) => p.published).map((p) => profileOut(p, licenses)),
    passports: Object.fromEntries(passportRows.map((r) => [r.project_id, r.data])),
    journalHead: head,
  };
}

export type Bootstrap = Awaited<ReturnType<typeof loadBootstrap>>;

export const bootstrap = new Hono<AppEnv>().get("/bootstrap", async (c) => c.json(await loadBootstrap(db(), c.get("user"))));
