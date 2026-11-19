import { CreditCard, ExternalLink, Hourglass, Loader2, Play, Send } from "lucide-react";
import { useId, useState } from "react";
import { voiceById } from "../core/catalog";
import { profileOf, type VoiceProfile } from "../mock/registry";
import { accountOf, sampleUrls, useStore, type Project } from "../state/store";
import { EXPIRY_HOURS, hoursLeft, PAYMENT_LABEL, requestStatus, REQUEST_LABEL, type LicenseRequest, type RequestStatus } from "../state/workflow";
import { AudioClip, Callout, Dialog, KV, Progress, Prov, relTime, Status, toast, type Tone } from "../ui/kit";

export const REQ_TONE: Record<RequestStatus, Tone> = { envoyee: "info", acceptee: "ok", refusee: "bad", expiree: "bad" };
export const price = (n: number) => (n === 0 ? "Gratuit" : `${n} DT`);

/* ------------------------------------------------------------------ sample playback */

const sampleCache = new Map<string, { url?: string; error?: string; mock?: boolean }>();

/**
 * Plays a voice sample. Catalogue voices are rendered on demand by the server function, which
 * re-runs the consent gate (a revoked licence yields no sample). Voices created by demo accounts
 * play the owner's own recording, kept in memory.
 */
export function SamplePlayer({ profile }: { profile: VoiceProfile }) {
  const licenses = useStore((s) => s.licenses);
  const [state, setState] = useState(sampleCache.get(profile.voiceId) ?? null);
  const [busy, setBusy] = useState(false);
  const own = sampleUrls.get(profile.voiceId);
  if (own) return <AudioClip url={own} label={`échantillon de ${profile.publicName}`} compact />;
  if (!voiceById(profile.voiceId)) return <p className="hint">Échantillon enregistré par la personne, non conservé après rechargement.</p>;

  const load = async () => {
    setBusy(true);
    const lic = licenses.find((l) => l.voice_id === profile.voiceId);
    let next: { url?: string; error?: string; mock?: boolean };
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voice_id: profile.voiceId, text: profile.sampleText, use: lic?.allowed_uses[0] ?? "doublage_film", language: "fr", human_validated: true, revoked: licenses.filter((l) => l.status === "revoked").map((l) => l.license_id) }),
      });
      if (res.ok) next = { url: URL.createObjectURL(await res.blob()), mock: res.headers.get("x-sawti-mock") === "1" };
      else {
        const body = await res.json().catch(() => ({}));
        next = { error: res.status === 403 ? `Échantillon refusé par le moteur de règles : ${body.decision?.reason_fr ?? "licence non valide"}` : res.status === 503 ? "Moteur de voix non configuré sur ce déploiement : échantillon indisponible." : (body.message ?? `Erreur ${res.status}`) };
      }
    } catch {
      next = { error: "Serveur injoignable." };
    }
    sampleCache.set(profile.voiceId, next);
    setState(next);
    setBusy(false);
  };

  if (state?.url)
    return (
      <div className="stack-sm">
        <AudioClip url={state.url} label={`échantillon de ${profile.publicName}`} compact />
        {state.mock && <span className="hint">Moteur en mode test : audio silencieux.</span>}
      </div>
    );
  return (
    <div className="sample">
      <button className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>
        {busy ? <Loader2 className="spin" /> : <Play />}
        Écouter l’échantillon
      </button>
      {state?.error && <span className="hint hint-bad">{state.error}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ request dialog (Écran 08) */

export function RequestDialog({ open, onClose, voiceId, project, characterKey, onSent }: { open: boolean; onClose: () => void; voiceId: string; project?: Project; characterKey?: string; onSent?: (r: LicenseRequest) => void }) {
  const account = useStore(accountOf);
  const projects = useStore((s) => s.projects);
  const order = useStore((s) => s.order);
  const requestLicense = useStore((s) => s.requestLicense);
  const prof = profileOf(voiceId);
  const mine = order.map((id) => projects[id]).filter((p) => p && p.accountId === account?.id && p.generation.status !== "done" && Object.keys(p.characters).length);
  const [pid, setPid] = useState(project?.id ?? mine[0]?.id ?? "");
  const p = projects[pid];
  const chars = p ? Object.values(p.characters) : [];
  const [key, setKey] = useState(characterKey ?? chars[0]?.key ?? "");
  const [msg, setMsg] = useState("");
  const ids = { p: useId(), c: useId(), m: useId() };
  if (!prof) return null;
  const valid = Boolean(p && key && p.characters[key]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Demander une licence à ${prof.publicName}`}
      description="Licence permanente pour un projet précis, sans limite de durée d’exploitation. Elle ne couvre pas d’autres projets."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              const r = requestLicense(pid, key, voiceId, msg.trim());
              toast(`Demande envoyée à ${prof.publicName}`, "ok");
              onSent?.(r);
              onClose();
            }}
          >
            <Send />
            Envoyer la demande
          </button>
        </>
      }
    >
      {mine.length === 0 ? (
        <Callout tone="warn">Aucun projet avec des personnages confirmés. Importez une vidéo et confirmez ses personnages avant de demander une licence.</Callout>
      ) : (
        <>
          {!project && (
            <div className="field-row">
              <div className="field">
                <label htmlFor={ids.p}>Projet</label>
                <select
                  id={ids.p}
                  className="select"
                  value={pid}
                  onChange={(e) => {
                    setPid(e.target.value);
                    setKey(Object.keys(projects[e.target.value]?.characters ?? {})[0] ?? "");
                  }}
                >
                  {mine.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={ids.c}>Personnage</label>
                <select id={ids.c} className="select" value={key} onChange={(e) => setKey(e.target.value)}>
                  {chars.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <KV
            rows={[
              ["Voix", `${prof.publicName}${prof.pseudonym ? " (pseudonyme)" : ""}`],
              ["Projet", p ? `${p.title} · ${p.characters[key]?.name ?? ""}` : "—"],
              ["Tarif fixé par le titulaire", <span className="price">{price(prof.price)}</span>],
              ["Conditions", prof.conditions],
              ["Expiration", `${EXPIRY_HOURS} heures sans réponse`],
            ]}
          />
          <div className="field">
            <label htmlFor={ids.m}>Message au titulaire (facultatif)</label>
            <textarea id={ids.m} className="textarea" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Présentez le projet et le rôle." maxLength={500} />
          </div>
          <Callout tone="plain">
            Un e-mail avec un lien sécurisé est envoyé au titulaire, qui accepte ou refuse sans se connecter. <Prov kind="sim">e-mail</Prov>
          </Callout>
        </>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ payment (simulated) */

export function PayDialog({ request, onClose }: { request: LicenseRequest | null; onClose: () => void }) {
  const pay = useStore((s) => s.payLicense);
  const [busy, setBusy] = useState<"ok" | "fail" | null>(null);
  const prof = request ? profileOf(request.voiceId) : undefined;
  const run = async (ok: boolean) => {
    if (!request) return;
    setBusy(ok ? "ok" : "fail");
    await new Promise((r) => setTimeout(r, 900));
    pay(request.id, ok);
    setBusy(null);
    toast(ok ? "Paiement confirmé (simulation)" : "Paiement échoué (simulation)", ok ? "ok" : "bad");
    onClose();
  };
  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      title="Confirmer le paiement de la licence"
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => run(false)} disabled={Boolean(busy)}>
            {busy === "fail" ? <Loader2 className="spin" /> : null}
            Simuler un échec
          </button>
          <button className="btn btn-primary" onClick={() => run(true)} disabled={Boolean(busy)}>
            {busy === "ok" ? <Loader2 className="spin" /> : <CreditCard />}
            Payer {request ? price(request.price) : ""}
          </button>
        </>
      }
    >
      {request && (
        <>
          <KV
            rows={[
              ["Voix", prof?.publicName ?? request.voiceId],
              ["Projet", `${request.projectTitle} · ${request.characterName}`],
              ["Montant", <span className="price">{price(request.price)}</span>],
              ["Licence", "Permanente, pour ce projet uniquement"],
            ]}
          />
          <Callout tone="info" title="Paiement simulé">
            Aucun moyen de paiement n’est demandé ni débité. La voix devient utilisable dès la confirmation.
          </Callout>
        </>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ request status block */

export function RequestBlock({ r, onPay, compact = false }: { r: LicenseRequest; onPay: (r: LicenseRequest) => void; compact?: boolean }) {
  const expire = useStore((s) => s.expireRequest);
  const st = requestStatus(r);
  const prof = profileOf(r.voiceId);
  const link = `${window.location.origin}/licence/${r.token}`;
  return (
    <div className="stack-sm">
      <div className="row">
        <Status tone={REQ_TONE[st]}>Demande {REQUEST_LABEL[st].toLowerCase()}</Status>
        {r.price > 0 && st === "acceptee" && <Status tone={r.payment === "confirme" ? "ok" : r.payment === "echoue" ? "bad" : "warn"}>Paiement {PAYMENT_LABEL[r.payment].toLowerCase()}</Status>}
        <span className="hint">
          {prof?.publicName} · {price(r.price)} · envoyée {relTime(r.sentAt)}
        </span>
      </div>
      {st === "envoyee" && (
        <div className="countdown">
          <Progress value={hoursLeft(r) / EXPIRY_HOURS} label="Temps restant avant expiration" />
          <span className="hint num">
            <Hourglass size={12} aria-hidden style={{ verticalAlign: "-2px" }} /> Expire dans {Math.ceil(hoursLeft(r))} h sans réponse
          </span>
        </div>
      )}
      {!compact && st === "envoyee" && (
        <div className="row">
          <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noreferrer">
            <ExternalLink />
            Ouvrir comme le titulaire (démonstration)
          </a>
          <button className="btn btn-ghost btn-sm" onClick={() => expire(r.id)}>
            Simuler l’expiration de 72 h
          </button>
        </div>
      )}
      {st === "acceptee" && r.price > 0 && r.payment !== "confirme" && (
        <div className="row">
          <button className="btn btn-primary btn-sm" onClick={() => onPay(r)}>
            <CreditCard />
            {r.payment === "echoue" ? "Réessayer le paiement" : `Payer ${price(r.price)}`}
          </button>
          <span className="hint">La voix sera utilisable après confirmation du paiement.</span>
        </div>
      )}
    </div>
  );
}
