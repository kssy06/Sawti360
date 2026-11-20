/**
 * Writes the example data of the simulated demo (src/state/seed.ts, unchanged) into the base, for
 * the two demo accounts. Idempotent: running it again resets the demo accounts' content to the same
 * state (projects, requests, usages, notifications, jetons). Accounts created by other people are
 * never touched. The audit journal is append-only: the example journal is written only into an
 * empty journal. Licences and the example passport are signed with the server's key
 * (SAWTI_SIGNING_SEED; the demo key without one): run it again after changing the key.
 */
import type { Sql, TransactionSql } from "postgres";
import { sha256Hex } from "../../src/core/canonical";
import { voiceById } from "../../src/core/catalog";
import { PLANS } from "../../src/core/credits";
import { DEMO_ACCOUNTS, PROFILES, profileOf } from "../../src/mock/registry";
import { seed } from "../../src/state/seed";
import { passportId } from "../../src/state/workflow";
import { journalHead } from "../../server/audit";
import { signLicenseServer, signPassportServer } from "../../server/sign";

export interface DemoIds {
  nour: string;
  lina: string;
}

export interface SeedSummary {
  projects: number;
  requests: number;
  profiles: number;
  licenses: number;
  usage: number;
  notifications: number;
  consents: number;
  dossiers: number;
  passports: number;
  journal: "écrit" | "conservé";
}

const ORGS: Record<keyof DemoIds, { name: string; org: string; initials: string }> = Object.fromEntries(
  DEMO_ACCOUNTS.map((a) => [a.id, { name: a.name, org: a.org, initials: a.initials }]),
) as Record<keyof DemoIds, { name: string; org: string; initials: string }>;

export async function seedDatabase(sql: Sql, ids: DemoIds): Promise<SeedSummary> {
  const data = seed();
  const accountOf = (demoId: string | undefined): string | null => (demoId === "nour" ? ids.nour : demoId === "lina" ? ids.lina : null);
  const creatorAccount = (name: string) => (name === ORGS.nour.name ? ids.nour : name === ORGS.lina.name ? ids.lina : null);
  const both = [ids.nour, ids.lina];

  return (await sql.begin(async (tx: TransactionSql) => {
    /* accounts */
    for (const key of ["nour", "lina"] as const) {
      const o = ORGS[key];
      await tx`update public.accounts set name = ${o.name}, org = ${o.org}, initials = ${o.initials}, plan = 'createur', is_demo = true where id = ${ids[key]}`;
    }

    /* reset the demo accounts' content */
    const requestIds = data.requests.map((r) => r.id);
    const usageIds = data.usage.map((u) => u.id);
    await tx`delete from public.projects where account_id = any(${both}::uuid[])`;
    await tx`delete from public.license_requests where creator_account_id = any(${both}::uuid[]) or owner_account_id = any(${both}::uuid[]) or id = any(${requestIds}::text[])`;
    await tx`delete from public.usage_rows where creator_account_id = any(${both}::uuid[]) or voice_id = 'v_lina' or id = any(${usageIds}::text[])`;
    await tx`delete from public.notifications where account_id = any(${both}::uuid[])`;
    await tx`delete from public.payments where account_id = any(${both}::uuid[])`;
    await tx`delete from public.jobs where account_id = any(${both}::uuid[])`;
    await tx`delete from public.token_ledger where account_id = any(${both}::uuid[])`;
    for (const id of both) {
      await tx`insert into public.token_ledger (account_id, delta, reason, ref) values (${id}, ${PLANS.createur.monthly}, 'allocation_plan', 'createur')`;
    }

    /* voice profiles (Lina → her account; Sami, Maya, Hédi → fictional, no account) */
    const others = await tx<{ voice_id: string }[]>`select voice_id from public.voice_profiles where account_id = any(${both}::uuid[]) and voice_id <> 'v_lina'`;
    if (others.length) {
      const gone = others.map((o) => o.voice_id);
      await tx`delete from public.voice_licenses where voice_id = any(${gone}::text[])`;
      await tx`delete from public.voice_profiles where voice_id = any(${gone}::text[])`;
    }
    for (const p of PROFILES) {
      const { voiceId, accountId, ...profile } = p;
      const owned = accountId === "lina" ? data.ownedVoices.lina : undefined;
      await tx`
        insert into public.voice_profiles (voice_id, account_id, profile, published, sample, eleven_voice_id, cloned, created_at)
        values (${voiceId}, ${accountOf(accountId)}, ${tx.json(profile)}, true, ${owned?.sample ? tx.json(owned.sample) : null},
                ${voiceById(voiceId)?.eleven_voice_id ?? null}, false, ${owned?.createdAt ?? new Date().toISOString()})
        on conflict (voice_id) do update set account_id = excluded.account_id, profile = excluded.profile, published = true,
          sample = excluded.sample, eleven_voice_id = excluded.eleven_voice_id, cloned = false, created_at = excluded.created_at`;
    }

    /* signed licences, with the server's key (the one runGate verifies with) */
    for (const unsigned of data.licenses) {
      const l = signLicenseServer(unsigned);
      await tx`
        insert into public.voice_licenses (license_id, voice_id, data, status, revoked_at)
        values (${l.license_id}, ${l.voice_id}, ${tx.json(l)}, ${l.status}, ${l.revoked_at})
        on conflict (license_id) do update set voice_id = excluded.voice_id, data = excluded.data, status = excluded.status, revoked_at = excluded.revoked_at`;
    }

    /* projects, with their consents and dossiers in their own tables */
    let consents = 0;
    let dossiers = 0;
    for (const pid of data.order) {
      const p = data.projects[pid];
      const characters = Object.fromEntries(
        Object.entries(p.characters).map(([k, c]) => {
          const { living: _l, dossier: _d, ...rest } = c;
          return [k, rest];
        }),
      );
      await tx`
        insert into public.projects (id, account_id, title, subtitle, kind, format, use_case, example, video, pipeline, segments, speakers,
          characters, speaker_voices, proposals, reviews, gens, generation, created_at, updated_at)
        values (${p.id}, ${ids.nour}, ${p.title}, ${p.subtitle}, ${p.kind}, ${p.format}, ${p.use}, ${p.example},
          ${p.video ? tx.json(p.video) : null}, ${p.pipeline ? tx.json(p.pipeline) : null}, ${tx.json(p.segments)}, ${tx.json(p.speakers)},
          ${tx.json(characters)}, ${tx.json(p.speakerVoices)}, ${tx.json(p.proposals)}, ${tx.json(p.reviews)}, ${tx.json(p.gens)},
          ${tx.json(p.generation)}, ${p.createdAt}, ${p.updatedAt})`;
      for (const c of Object.values(p.characters)) {
        if (c.living) {
          consents += 1;
          await tx`
            insert into public.consents (project_id, character_key, email, registered, status, token_hash, sent_at, decided_at)
            values (${p.id}, ${c.key}, ${c.living.email}, ${c.living.registered}, ${c.living.status},
                    ${sha256Hex(c.living.token ?? `${p.id}/${c.key}/${Math.random()}`)}, ${c.living.sentAt ?? new Date().toISOString()}, ${c.living.decidedAt ?? null})`;
        }
        const d = c.dossier;
        if (d && d.status !== "manquant" && d.reference) {
          dossiers += 1;
          await tx`
            insert into public.dossiers (project_id, character_key, status, deceased_name, declared_role, reference, file_path, file_name,
              file_size, file_type, file_hash, received_at, ai_check, validated_at, validated_by, complementary_requested_at)
            values (${p.id}, ${c.key}, ${d.status}, ${d.deceasedName}, ${d.declaredRole}, ${d.reference}, ${`exemple/${d.fileName ?? "document"}`},
              ${d.fileName ?? "document"}, ${d.fileSize ?? 0}, ${d.fileType ?? "application/pdf"}, ${d.fileHash ?? ""},
              ${d.receivedAt ?? new Date().toISOString()}, ${d.check ? tx.json(d.check) : null}, ${d.validatedAt ?? null},
              ${d.validatedBy ?? null}, ${d.complementaryRequestedAt ?? null})`;
        }
      }
    }

    /* licence requests (raw tokens of the example are random and stay unknown: stored hashed) */
    for (const r of data.requests) {
      await tx`
        insert into public.license_requests (id, token_hash, project_id, project_title, character_key, character_name, voice_id,
          creator_account_id, creator_name, owner_account_id, message, price, sent_at, expires_at, status, decided_at, payment,
          payment_at, reference)
        values (${r.id}, ${sha256Hex(r.token)}, ${r.projectId}, ${r.projectTitle}, ${r.characterKey}, ${r.characterName}, ${r.voiceId},
          ${creatorAccount(r.creator)}, ${r.creator}, ${accountOf(profileOf(r.voiceId)?.accountId)}, ${r.message}, ${r.price},
          ${r.sentAt}, ${r.expiresAt}, ${r.status}, ${r.decidedAt ?? null}, ${r.payment}, ${r.paymentAt ?? null}, ${r.reference ?? null})`;
    }

    /* usages, notifications */
    for (const u of data.usage) {
      await tx`
        insert into public.usage_rows (id, at, project_id, project_label, creator_account_id, creator_name, voice_id, chars, cost, owner, platform, ms, bytes)
        values (${u.id}, ${u.at}, null, ${u.project}, ${creatorAccount(u.creator)}, ${u.creator}, ${u.voice_id}, ${u.chars}, ${u.cost},
          ${u.owner}, ${u.platform}, ${u.ms ?? null}, ${u.bytes ?? null})`;
    }
    for (const n of data.notifications) {
      const to = accountOf(n.to);
      if (!to) continue;
      await tx`
        insert into public.notifications (account_id, space, at, tone, title, body, link, read)
        values (${to}, ${n.space}, ${n.at}, ${n.tone}, ${n.title}, ${n.body}, ${n.link ?? null}, ${n.read})`;
    }

    /* the example journal, only into an empty journal (the chain is append-only) */
    const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from public.audit_entries`;
    if (count === 0) {
      for (const e of data.journal) {
        await tx`
          insert into public.audit_entries (idx, ts, actor, action, payload_hash, decision, prev_hash, entry_hash)
          values (${e.index}, ${e.timestamp}, ${e.actor}, ${e.action}, ${e.payload_hash}, ${e.decision}, ${e.prev_hash}, ${e.entry_hash})`;
      }
    }

    /*
     * The completed example's Passeport 360°, signed by the server. It commits to the example journal
     * when that journal is the base's; otherwise (journal kept from earlier runs) to the base's chain as it is now.
     */
    const head = await journalHead(tx);
    for (const [pid, passport] of Object.entries(data.passports)) {
      const r = passport.responsabilite;
      const [cited] = await tx<{ entry_hash: string }[]>`select entry_hash from public.audit_entries where idx = ${r.nombre_entrees - 1}`;
      const [{ refusals }] = await tx<{ refusals: number }[]>`select count(*)::int as refusals from public.audit_entries where action = 'GENERATION_REFUSEE'`;
      const commits = cited?.entry_hash === r.journal_empreinte_de_tete ? passport : { ...passport, responsabilite: { ...r, journal_empreinte_de_tete: head.head, nombre_entrees: head.count, nombre_refus: refusals } };
      const signed = signPassportServer(commits);
      await tx`
        insert into public.passports (id, project_id, account_id, data, created_at)
        values (${signed.identifiant ?? passportId(pid)}, ${pid}, ${ids.nour}, ${tx.json(signed as never)}, ${signed.identite.date})
        on conflict (id) do update set project_id = excluded.project_id, account_id = excluded.account_id, data = excluded.data`;
    }

    return {
      projects: data.order.length,
      requests: data.requests.length,
      profiles: PROFILES.length,
      licenses: data.licenses.length,
      usage: data.usage.length,
      notifications: data.notifications.length,
      consents,
      dossiers,
      passports: Object.keys(data.passports).length,
      journal: count === 0 ? "écrit" : "conservé",
    } satisfies SeedSummary;
  })) as SeedSummary;
}
