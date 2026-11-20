import { CircleCheck, CircleX, Hourglass, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { messageOf } from "../api/client";
import { BACKEND } from "../lib/backend";
import { paragraphFor, profileOf } from "../mock/registry";
import { usePublicConsent } from "../state/remote/consents";
import { usePublicLicence } from "../state/remote/licensing";
import { useStore } from "../state/store";
import { EXPIRY_HOURS, hoursLeft, requestStatus } from "../state/workflow";
import { Brand } from "../ui/brand";
import { AnimatedStepper, Step } from "../ui/AnimatedStepper";
import { AudioClip, Callout, KV, Progress, Prov, relTime, Toasts, toast } from "../ui/kit";
import { Recorder, type Recording } from "../ui/Recorder";
import { price } from "./licensing";

/** Pages opened from a secure e-mail link: no account needed. */
function PublicFrame({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Sawti 360`;
  }, [title]);
  return (
    <div className="public">
      <header className="public-top">
        <Brand to="/" />
        <span className="muted">Lien sécurisé · aucune connexion requise</span>
      </header>
      <main className="public-main public-narrow">{children}</main>
      <footer className="public-foot">
        <span>
          <LockKeyhole size={12} aria-hidden style={{ verticalAlign: "-2px" }} /> Votre réponse est inscrite au journal d’audit de Sawti 360.
        </span>
        {BACKEND ? (
          <span>
            Lien sécurisé : une seule réponse possible, depuis n’importe quel appareil. <Prov kind="real">e-mail</Prov>
          </span>
        ) : (
          <span>
            Prototype : ce lien n’est lisible que dans le navigateur qui l’a créé. <Prov kind="sim">e-mail</Prov>
          </span>
        )}
      </footer>
      <Toasts />
    </div>
  );
}

function NotFound() {
  return (
    <Callout tone="warn" title="Lien introuvable">
      Ce lien n’existe pas, ou il a été créé dans un autre navigateur : le prototype conserve les demandes localement.
    </Callout>
  );
}

/* ------------------------------------------------------------------ living person consent */

export function ConsentPage() {
  const { token = "" } = useParams();
  const projects = useStore((s) => s.projects);
  const accounts = useStore((s) => s.accounts);
  const localRespond = useStore((s) => s.respondConsent);
  const [rec, setRec] = useState<Recording | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [creating, setCreating] = useState(false);
  // Back-end mode: the request is read from the server by the link's token (any device, no account).
  const remote = usePublicConsent(token, BACKEND);
  const respond = (_t: string, accept: boolean) => {
    if (!BACKEND) return localRespond(token, accept);
    void remote.respond(accept).catch((err) => toast(messageOf(err), "bad"));
  };
  const local = Object.values(projects)
    .flatMap((p) => Object.values(p.characters).map((c) => ({ p, c })))
    .find(({ c }) => c.living?.token === token);
  const found = BACKEND
    ? remote.data && {
        p: { title: remote.data.projectTitle },
        c: { name: remote.data.characterName, description: remote.data.characterDescription },
        living: { status: remote.data.status, registered: remote.data.registered || remote.data.voiceCreated, sentAt: remote.data.sentAt, decidedAt: remote.data.decidedAt ?? undefined },
        creator: remote.data.creatorName,
        paragraph: remote.data.paragraph,
      }
    : local?.c.living && {
        p: local.p,
        c: local.c,
        living: local.c.living,
        creator: accounts.find((a) => a.id === local.p.accountId)?.name ?? "Un créateur",
        paragraph: paragraphFor(token),
      };

  if (BACKEND && remote.loading) {
    return (
      <PublicFrame title="Demande de consentement">
        <p className="muted">Chargement de la demande…</p>
      </PublicFrame>
    );
  }
  if (!found) {
    return (
      <PublicFrame title="Demande de consentement">
        {BACKEND && remote.error ? (
          <Callout tone="warn" title="Lien introuvable">
            {remote.error}
          </Callout>
        ) : (
          <NotFound />
        )}
      </PublicFrame>
    );
  }
  const { p, c, living, creator } = found;
  const createPassport = async () => {
    if (!rec) return;
    setCreating(true);
    try {
      await remote.createPassport(rec);
      toast("Passeport de voix créé", "ok");
    } catch (err) {
      toast(messageOf(err), "bad");
    } finally {
      setCreating(false);
    }
  };
  const answer = confirm ? (
    <Callout
      tone="info"
      title="Confirmer votre consentement ?"
      action={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
            Annuler
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => respond(token, true)}>
            Je consens
          </button>
        </>
      }
    >
      Votre voix originale pourra être utilisée pour ce projet uniquement.
    </Callout>
  ) : (
    <div className="big-choice">
      <button className="btn btn-primary btn-lg" onClick={() => setConfirm(true)}>
        Accepter
      </button>
      <button className="btn btn-secondary btn-lg" onClick={() => respond(token, false)}>
        Refuser
      </button>
    </div>
  );
  const decided = living.status === "autorisee" || living.status === "refusee";

  return (
    <PublicFrame title="Demande de consentement">
      <div className="stack-lg">
        <div className="stack-sm">
          <h1>{creator} souhaite utiliser votre voix originale</h1>
          <p className="lead muted">Pour doubler en français vos répliques dans un seul projet. Vous restez libre de refuser, sans justification.</p>
        </div>
        <div className="card">
          <div className="card-body-tight">
            <KV
              rows={[
                ["Projet", p.title],
                ["Votre rôle dans la vidéo", `${c.name} · ${c.description}`],
                ["Utilisation", "Doublage en français de vos répliques, avec votre voix"],
                ["Portée", "Ce projet uniquement"],
                ["Transparence", "Votre consentement figurera au Passeport 360° public de la vidéo"],
                ["Demande reçue", living.sentAt ? relTime(living.sentAt) : "—"],
              ]}
            />
          </div>
        </div>

        {decided ? (
          <Callout tone={living.status === "autorisee" ? "ok" : "bad"} icon={living.status === "autorisee" ? CircleCheck : CircleX} title={living.status === "autorisee" ? "Vous avez donné votre consentement" : "Vous avez refusé"}>
            Réponse enregistrée {living.decidedAt ? relTime(living.decidedAt) : ""}. {creator} a été prévenu·e.
          </Callout>
        ) : (
          !living.registered ? (
            <AnimatedStepper width={680} onStepChange={(n) => n === 2 && !BACKEND && toast("Passeport de voix créé", "ok")}>
              <Step
                title="Créez votre Passeport de voix"
                label="Passeport de voix"
                canContinue={BACKEND ? false : Boolean(rec && rec.duration >= 3)}
                hint={BACKEND ? "Enregistrez votre lecture, puis créez votre Passeport de voix." : "Enregistrez au moins 3 secondes de lecture."}
              >
                <p>Vous n’êtes pas encore inscrit·e. Votre Passeport de voix ne peut être créé que par vous. Lisez ce paragraphe à voix haute : il sert à vérifier la correspondance et la qualité de votre voix.</p>
                <p className="read-para">{found.paragraph}</p>
                {rec ? (
                  <div className="recorder">
                    <AudioClip url={rec.url} label="votre enregistrement" />
                    <div className="row-between">
                      <span className="hint">Enregistrement prêt.</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRec(null)}>
                        Recommencer
                      </button>
                    </div>
                  </div>
                ) : (
                  <Recorder onDone={setRec} />
                )}
                {BACKEND && rec && (
                  <div>
                    <button type="button" className="btn btn-primary" disabled={creating || rec.duration < 3} onClick={() => void createPassport()}>
                      {creating ? <Loader2 className="spin" /> : null}
                      Créer mon Passeport de voix
                    </button>
                  </div>
                )}
                <p className="hint">
                  Aucune pièce d’identité n’est demandée.{" "}
                  {BACKEND
                    ? "Le serveur contrôle la durée et le niveau de l’enregistrement et, quand la transcription est disponible, la lecture du texte. Il ne prouve pas votre identité."
                    : "Le contrôle de correspondance est simulé dans ce prototype."}{" "}
                  Vous pouvez aussi{" "}
                  <button type="button" className="btn-link" onClick={() => respond(token, false)}>
                    refuser sans créer de passeport
                  </button>
                  .
                </p>
              </Step>
              <Step title="Votre réponse" label="Réponse" hideFooter>
                <Callout tone="ok">Passeport de voix créé. Vous pouvez maintenant répondre.</Callout>
                {answer}
              </Step>
            </AnimatedStepper>
          ) : (
            <section className="stack">
              <h2 style={{ fontSize: 17 }}>Votre réponse</h2>
              {answer}
            </section>
          )
        )}
      </div>
    </PublicFrame>
  );
}

/* ------------------------------------------------------------------ owner licence response */

export function LicenseResponsePage() {
  const { token = "" } = useParams();
  const local = useStore((s) => s.requests.find((x) => x.token === token));
  const localRespond = useStore((s) => s.respondLicense);
  // Back-end mode: the request is read from the server by the link's token (any device, no account).
  const remote = usePublicLicence(token, BACKEND);
  const r = BACKEND ? remote.request : local;
  const respond = (t: string, accept: boolean) =>
    Promise.resolve(BACKEND ? remote.respond(t, accept) : localRespond(t, accept)).then(
      () => toast(accept ? "Demande acceptée" : "Demande refusée", accept ? "ok" : "plain"),
      (err) => toast(messageOf(err), "bad"),
    );
  if (BACKEND && remote.loading) {
    return (
      <PublicFrame title="Demande de licence">
        <p className="muted">Chargement de la demande…</p>
      </PublicFrame>
    );
  }
  if (!r) {
    return (
      <PublicFrame title="Demande de licence">
        <NotFound />
      </PublicFrame>
    );
  }
  const prof = BACKEND ? { publicName: remote.ownerName } : profileOf(r.voiceId);
  const st = requestStatus(r);
  return (
    <PublicFrame title="Demande de licence">
      <div className="stack-lg">
        <div className="stack-sm">
          <h1>
            {r.creator} souhaite utiliser la voix de {prof?.publicName}
          </h1>
          <p className="lead muted">Licence permanente pour un projet précis. Elle ne couvre aucun autre projet.</p>
        </div>
        <div className="card">
          <div className="card-body-tight">
            <KV
              rows={[
                ["Projet", r.projectTitle],
                ["Personnage", r.characterName],
                ["Message", r.message || "—"],
                ["Votre tarif", <span className="price">{price(r.price)}</span>],
                ["Paiement", r.price > 0 ? "Demandé au créateur après votre acceptation" : "Aucun : licence gratuite"],
                ["Reçue", relTime(r.sentAt)],
              ]}
            />
          </div>
        </div>
        {st === "envoyee" && (
          <>
            <div className="countdown">
              <Progress value={hoursLeft(r) / EXPIRY_HOURS} label="Temps restant" />
              <span className="hint num">
                <Hourglass size={12} aria-hidden style={{ verticalAlign: "-2px" }} /> Sans réponse, la demande expire dans {Math.ceil(hoursLeft(r))} h.
              </span>
            </div>
            <div className="big-choice">
              <button className="btn btn-primary btn-lg" onClick={() => void respond(token, true)}>
                Accepter
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => void respond(token, false)}>
                Refuser
              </button>
            </div>
          </>
        )}
        {st === "acceptee" && (
          <Callout tone="ok" icon={CircleCheck} title="Vous avez accepté cette demande">
            {r.price > 0 ? `Le créateur doit confirmer le paiement de ${price(r.price)} avant d’utiliser votre voix.` : "Licence gratuite : la voix est utilisable pour ce projet."} Référence {r.reference}.
          </Callout>
        )}
        {st === "refusee" && (
          <Callout tone="bad" icon={CircleX} title="Vous avez refusé cette demande">
            Le créateur a été prévenu et peut choisir une autre voix.
          </Callout>
        )}
        {st === "expiree" && (
          <Callout tone="warn" icon={Hourglass} title="Demande expirée">
            Aucune réponse n’a été donnée dans les {EXPIRY_HOURS} heures. Le créateur peut vous envoyer une nouvelle demande.
          </Callout>
        )}
      </div>
    </PublicFrame>
  );
}
