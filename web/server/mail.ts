/**
 * E-mails of the secure links (consent, licence request, decisions, render ready), through Gmail SMTP
 * (nodemailer, app password). Sending never decides a route's success: when SMTP is missing or fails,
 * the route succeeds anyway and the link is shown to copy or to send by WhatsApp (`mail: false`).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailSender = (m: Mail) => Promise<boolean>;

let transporter: Transporter | null = null;

function smtp(): Transporter | null {
  const e = env();
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASS) return null;
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 465,
    secure: (e.SMTP_PORT ?? 465) === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

const smtpSender: MailSender = async (m) => {
  const t = smtp();
  if (!t) return false;
  try {
    await t.sendMail({ from: env().MAIL_FROM ?? `Sawti 360 <${env().SMTP_USER}>`, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return true;
  } catch (err) {
    console.error("[e-mail]", err instanceof Error ? err.message : err);
    return false;
  }
};

let sender: MailSender = smtpSender;

/** Returns true when the e-mail left; false when SMTP is not configured or refused it. */
export const sendMail = (m: Mail) => sender(m);

/** Tests only: capture e-mails instead of sending them. */
export function setMailSenderForTests(fn: MailSender | null): void {
  sender = fn ?? smtpSender;
  transporter = null;
}

/* ------------------------------------------------------------------ templates (French) */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }): { text: string; html: string } {
  const text = [title, "", ...paragraphs, ...(action ? ["", `${action.label} : ${action.url}`] : []), "", "Sawti 360 · L’IA propose. L’humain décide. La confiance accompagne chaque export."].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#151515;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("\n")}
${action ? `<p style="margin:20px 0"><a href="${esc(action.url)}" style="background:#ff5a1f;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${esc(action.label)}</a></p><p style="font-size:12px;color:#666;word-break:break-all">${esc(action.url)}</p>` : ""}
<p style="font-size:12px;color:#666;margin-top:24px">Sawti 360 · L’IA propose. L’humain décide. La confiance accompagne chaque export.</p>
</body></html>`;
  return { text, html };
}

export function consentMail(to: string, a: { creator: string; project: string; character: string; url: string }): Mail {
  return {
    to,
    subject: `${a.creator} demande votre accord pour utiliser votre voix`,
    ...layout(
      "Votre voix dans un doublage : votre accord est demandé",
      [
        `${a.creator} prépare la version française de « ${a.project} », où vous apparaissez (${a.character}).`,
        "Rien ne sera fait avec votre voix sans votre accord. Le lien ci-dessous vous permet d’accepter ou de refuser, sans créer de compte.",
      ],
      { label: "Répondre à la demande", url: a.url },
    ),
  };
}

export function licenceRequestMail(to: string, a: { creator: string; project: string; character: string; price: string; url: string; hours: number }): Mail {
  return {
    to,
    subject: `Nouvelle demande de licence de ${a.creator}`,
    ...layout(
      "Demande de licence pour votre voix",
      [
        `${a.creator} souhaite utiliser votre voix pour « ${a.project} » (${a.character}), au tarif que vous avez fixé : ${a.price}.`,
        `Licence permanente pour ce seul projet. Sans réponse sous ${a.hours} heures, la demande expire.`,
      ],
      { label: "Accepter ou refuser", url: a.url },
    ),
  };
}

export function decisionMail(to: string, a: { who: string; accepted: boolean; project: string; detail: string; url: string }): Mail {
  return {
    to,
    subject: a.accepted ? `${a.who} a accepté votre demande` : `${a.who} a refusé votre demande`,
    ...layout(a.accepted ? "Demande acceptée" : "Demande refusée", [`${a.project} · ${a.detail}`], { label: "Ouvrir le projet", url: a.url }),
  };
}

export function renderReadyMail(to: string, a: { project: string; url: string }): Mail {
  return {
    to,
    subject: `Rendu prêt : ${a.project}`,
    ...layout("Votre version française est prête", [`${a.project} : résultat et Passeport 360° disponibles.`], { label: "Voir le résultat", url: a.url }),
  };
}
