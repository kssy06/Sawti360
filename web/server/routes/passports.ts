/**
 * Passeport 360° signed by the server (A8, ARCHITECTURE.md § 4.10).
 *  POST /api/projects/:id/passport → Passport360, signed with SAWTI_SIGNING_SEED, kept in `passports`,
 *                                    journal PASSEPORT_EXPORTE. Also made at the end of a generation.
 *  GET  /api/public/passports/:id  → { passport, journal }: the chain up to the head the passport cites,
 *                                    so that the browser checks the signature AND the chain (QR → /verifier?id=).
 */
import { Hono } from "hono";
import type { Sql } from "postgres";
import type { Passport360 } from "../../src/core/passport.js";
import { draftPassport } from "../../src/state/passportBuild.js";
import { requireAccount, type AccountOut } from "../accounts.js";
import { appendAudit, readJournal } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { licenseOut, usageOut, type UsageRowDb, type VoiceLicenseRow } from "../compose.js";
import { db } from "../db.js";
import { notFound } from "../errors.js";
import { ownedProject, readProject } from "../projects.js";
import { signPassportServer } from "../sign.js";
import { projectRequests } from "../synthesis.js";

/** Builds the project's passport from the database, signs it, keeps it and writes it to the journal. */
export async function issuePassport(sql: Sql, me: AccountOut, projectId: string, when = new Date()): Promise<Passport360> {
  const project = await readProject(sql, projectId);
  const licenses = (await sql<VoiceLicenseRow[]>`select license_id, voice_id, data, status, revoked_at from public.voice_licenses order by license_id`).map(licenseOut);
  const usage = (await sql<UsageRowDb[]>`select * from public.usage_rows where project_id = ${projectId} order by at desc`).map(usageOut);
  const requests = await projectRequests(sql, projectId);
  // The passport commits to the chain as it is now (PASSEPORT_EXPORTE comes right after, as in the simulated store).
  const journal = await readJournal(sql);
  const signed = signPassportServer(draftPassport({ validator: me.name, usage, licenses, journal, requests }, project, when));
  await sql.begin(async (tx) => {
    await tx`
      insert into public.passports (id, project_id, account_id, data)
      values (${signed.identifiant!}, ${project.id}, ${me.id}, ${tx.json(signed as never)})
      on conflict (id) do update set project_id = excluded.project_id, account_id = excluded.account_id, data = excluded.data, created_at = now()`;
    await appendAudit(tx, me.name, "PASSEPORT_EXPORTE", { projet: project.id, signature: signed.signature?.valeur }, "SIGNE", { projectId: project.id, accountId: me.id });
  });
  return signed;
}

const ID = /^S360-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const passports = new Hono<AppEnv>()
  .post("/projects/:id/passport", async (c) => {
    const sql = db();
    const user = c.get("user");
    const row = await ownedProject(sql, user, c.req.param("id"));
    return c.json(await issuePassport(sql, await requireAccount(sql, user), row.id));
  })

  .get("/public/passports/:id", async (c) => {
    const id = c.req.param("id").trim().toUpperCase();
    if (!ID.test(id)) throw notFound("Passeport introuvable : vérifiez l’identifiant (S360-XXXX-XXXX).");
    const sql = db();
    const [row] = await sql<{ data: Passport360 }[]>`select data from public.passports where id = ${id}`;
    if (!row) throw notFound("Passeport introuvable : vérifiez l’identifiant (S360-XXXX-XXXX).");
    const upto = row.data.responsabilite.nombre_entrees - 1;
    const journal = upto >= 0 ? await readJournal(sql, { uptoIndex: upto }) : [];
    return c.json({ passport: row.data, journal });
  });
