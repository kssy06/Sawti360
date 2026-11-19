/**
 * POST /api/payments — the payment journey is kept, without any real money (decision of 19 November):
 *  - { kind: "licence", requestId, simulateFailure? }: confirmed at once (method prototype_gratuit,
 *    0 DT really charged); the licence becomes usable; « simulateFailure » keeps the demo's failure button;
 *  - { kind: "jetons", plan }: the plan changes and its monthly jetons are credited at once.
 */
import { Hono } from "hono";
import { z } from "zod";
import { PLANS } from "../../src/core/credits.js";
import { requireAccount } from "../accounts.js";
import { appendAudit } from "../audit.js";
import type { AppEnv } from "../auth.js";
import { requestOut, type LicenseRequestRow } from "../compose.js";
import { db } from "../db.js";
import { conflict, forbidden, notFound, readBody } from "../errors.js";
import { addEntry, balanceOf } from "../ledger.js";
import { notify } from "../notify.js";
import { settleExpiry } from "./licences.js";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("licence"), requestId: z.string().min(1).max(40), simulateFailure: z.boolean().optional() }),
  z.object({ kind: z.literal("jetons"), plan: z.enum(["gratuit", "createur", "studio"]) }),
]);

interface PaymentRow {
  id: string;
  kind: "licence" | "jetons";
  request_id: string | null;
  plan: string | null;
  amount_dt: string | number;
  tokens: number;
  status: "en_attente" | "confirme" | "echoue";
  method: string;
  created_at: Date;
}

const paymentOut = (p: PaymentRow) => ({
  id: p.id,
  kind: p.kind,
  requestId: p.request_id,
  plan: p.plan,
  amount: Number(p.amount_dt),
  charged: 0,
  tokens: p.tokens,
  status: p.status,
  method: p.method,
  at: new Date(p.created_at).toISOString(),
});

export const payments = new Hono<AppEnv>().post("/payments", async (c) => {
  const body = await readBody(c, Body);
  const sql = db();
  const user = c.get("user");
  const me = await requireAccount(sql, user);

  if (body.kind === "jetons") {
    const plan = PLANS[body.plan];
    const payment = (await sql.begin(async (tx) => {
      await tx`update public.accounts set plan = ${body.plan} where id = ${user.id}`;
      await addEntry(tx, user.id, plan.monthly, "achat_prototype", body.plan);
      const [p] = await tx<PaymentRow[]>`
        insert into public.payments (account_id, kind, plan, amount_dt, tokens, status, method)
        values (${user.id}, 'jetons', ${body.plan}, 0, ${plan.monthly}, 'confirme', 'prototype_gratuit') returning *`;
      await appendAudit(tx, me.name, "PAIEMENT_CONFIRME", { offre: body.plan, jetons: plan.monthly, debite_dt: 0, methode: "prototype_gratuit" }, "CONFIRME", { accountId: user.id });
      await notify(tx, {
        accountId: user.id,
        space: "creator",
        tone: "ok",
        title: `Offre ${plan.name} : ${plan.monthly.toLocaleString("fr-FR")} jetons crédités`,
        body: "Prototype : aucun argent réel, 0 DT débité.",
        link: "/paiements",
      });
      return p;
    })) as PaymentRow;
    return c.json({ payment: paymentOut(payment), balance: await balanceOf(sql, user.id), plan: body.plan });
  }

  const result = (await sql.begin(async (tx) => {
    const [found] = await tx<LicenseRequestRow[]>`select * from public.license_requests where id = ${body.requestId} for update`;
    if (!found) throw notFound("Demande introuvable.");
    if (found.creator_account_id !== user.id) throw forbidden("Cette demande n’a pas été envoyée par votre compte.");
    const row = await settleExpiry(tx, found);
    if (row.status !== "acceptee") throw conflict("CONFLIT", "La licence doit d’abord être acceptée par le titulaire.");
    if (Number(row.price) <= 0) throw conflict("CONFLIT", "Licence gratuite : aucun paiement n’est nécessaire.");
    if (row.payment === "confirme") throw conflict("DEJA_DECIDE", "Cette licence est déjà payée.");
    const ok = !body.simulateFailure;
    const [request] = await tx<LicenseRequestRow[]>`
      update public.license_requests set payment = ${ok ? "confirme" : "echoue"}, payment_at = now() where id = ${row.id} returning *`;
    const [p] = await tx<PaymentRow[]>`
      insert into public.payments (account_id, kind, request_id, amount_dt, tokens, status, method)
      values (${user.id}, 'licence', ${row.id}, ${Number(row.price)}, 0, ${ok ? "confirme" : "echoue"}, 'prototype_gratuit') returning *`;
    await appendAudit(
      tx,
      me.name,
      ok ? "PAIEMENT_CONFIRME" : "PAIEMENT_ECHOUE",
      { demande: row.id, montant: Number(row.price), debite_dt: 0, methode: "prototype_gratuit" },
      ok ? "CONFIRME" : "ECHOUE",
      { projectId: row.project_id, accountId: user.id },
    );
    await notify(tx, {
      accountId: user.id,
      space: "creator",
      tone: ok ? "ok" : "red",
      title: ok ? "Paiement confirmé · 0 DT débité (prototype)" : "Paiement échoué (simulation de la démo)",
      body: `${row.project_title} · ${row.character_name} · ${Number(row.price)} DT`,
      link: "/paiements",
    });
    if (ok)
      await notify(tx, {
        accountId: row.owner_account_id,
        space: "owner",
        tone: "ok",
        title: "Licence payée",
        body: `${row.creator_name} · ${row.project_title} · ${Number(row.price)} DT (prototype : aucun argent réel).`,
        link: "/proprietaire/revenus",
      });
    return { request, payment: p };
  })) as { request: LicenseRequestRow; payment: PaymentRow };
  return c.json({ payment: paymentOut(result.payment), balance: await balanceOf(sql, user.id), request: requestOut(result.request) });
});
