import { ArrowRight, Info } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { VOICES } from "../../core/catalog";
import { allProfiles, requestFor, slotsOf, useStore, type Project } from "../../state/store";
import { originalVoiceState, requestStatus, type LicenseRequest } from "../../state/workflow";
import { Callout, licenseState, Status, toast, VoiceMark } from "../../ui/kit";
import { PayDialog, price, RequestBlock, RequestDialog } from "../licensing";
import { voiceInfo } from "./shared";
import { StepFoot } from "./Workspace";

const AI_VOICES = VOICES.filter((v) => v.kind === "base");

/** Écran 09 — Attribution: one French voice per character, licensed or AI-generated. */
export default function VoicesStep({ p }: { p: Project }) {
  const requests = useStore((s) => s.requests);
  const licenses = useStore((s) => s.licenses);
  const owned = useStore((s) => s.ownedVoices);
  const assign = useStore((s) => s.assignVoice);
  const [ask, setAsk] = useState<{ key: string; voiceId: string } | null>(null);
  const [paying, setPaying] = useState<LicenseRequest | null>(null);
  const slots = slotsOf({ requests }, p);
  const serverProfiles = useStore((s) => s.profiles);
  const profiles = allProfiles({ ownedVoices: owned, profiles: serverProfiles });
  const chars = Object.values(p.characters);
  const notReady = chars.filter((c) => !slots[c.key]?.usable).length;

  return (
    <>
      <div className="stack-lg">
        <div className="row-between">
          <div className="legend" aria-label="Légende des voix">
            <span>
              <VoiceMark name="Lina" kind="licensed" size={22} /> Voix licenciée d’une personne
            </span>
            <span>
              <VoiceMark name="IA" kind="ai" size={22} /> Voix générée par IA, n’imite personne
            </span>
            <span>
              <VoiceMark name="VO" kind="original" size={22} /> Voix originale autorisée
            </span>
          </div>
          <Link to="/bibliotheque" className="link" style={{ fontSize: 13 }}>
            Parcourir la bibliothèque
          </Link>
        </div>
        <Callout tone="plain" icon={Info}>
          Une voix générée par IA ne doit jamais être présentée comme une imitation de la voix originale sans autorisation spécifique. Plusieurs personnages peuvent recevoir des voix différentes.
        </Callout>

        <div className="assign">
          {chars.map((c) => {
            const slot = slots[c.key];
            const info = voiceInfo(p, c.key);
            const current = p.speakerVoices[c.key];
            const req = current ? requestFor({ requests }, p.id, c.key, current) : undefined;
            return (
              <article key={c.key} className="assign-row" aria-label={`Voix de ${c.name}`}>
                <div className="assign-who">
                  <h3>{c.name}</h3>
                  <span className="hint">{c.description}</span>
                  <div className="row" style={{ marginTop: 6 }}>
                    <VoiceMark name={info.name} kind={info.kind} size={28} />
                    <span className="cell-main">
                      <b>{info.name}</b>
                      <span>{info.label}</span>
                    </span>
                  </div>
                  <Status tone={slot?.usable ? "ok" : slot?.mode === "none" ? "muted" : "warn"}>{slot?.reason}</Status>
                </div>

                {c.useOriginal ? (
                  <div className="stack">
                    <Callout tone={originalVoiceState(c) === "autorisee" ? "ok" : "warn"} title={originalVoiceState(c) === "autorisee" ? "Voix originale autorisée" : "Voix originale en attente d’autorisation"}>
                      {originalVoiceState(c) === "autorisee" ? "Le parcours d’autorisation est validé pour ce projet." : "Elle reste bloquée tant que le consentement ou le dossier familial n’est pas validé."}
                    </Callout>
                    <div className="row">
                      <Link to={`/projet/${p.id}/autorisations`} className="btn btn-secondary btn-sm">
                        Voir l’autorisation
                      </Link>
                      {originalVoiceState(c) !== "autorisee" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => assign(p.id, c.key, AI_VOICES[0].voice_id)} disabled={Boolean((c.living && c.living.status !== "a_obtenir" && c.living.status !== "refusee") || (c.dossier && ["recu", "analyse"].includes(c.dossier.status)))}>
                          Passer à une voix de remplacement
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="stack">
                    {req && <RequestBlock r={req} onPay={setPaying} />}
                    <div className="stack-sm">
                      <span className="label-sm">Voix licenciées</span>
                      <div className="voice-opts">
                        {profiles.map((pr) => {
                          const lic = licenses.find((l) => l.voice_id === pr.voiceId);
                          const st = licenseState(lic);
                          const usable = pr.availability === "disponible" && (lic ? st.key === "valid" : false);
                          const r = requestFor({ requests }, p.id, c.key, pr.voiceId);
                          const rs = r ? requestStatus(r) : null;
                          return (
                            <button
                              key={pr.voiceId}
                              type="button"
                              className="vopt"
                              aria-pressed={current === pr.voiceId}
                              disabled={!usable}
                              title={!usable ? (lic ? st.label : "Synthèse non disponible pour cette voix dans le prototype") : undefined}
                              onClick={() => {
                                if (r && (rs === "acceptee" || rs === "envoyee")) {
                                  assign(p.id, c.key, pr.voiceId);
                                  return;
                                }
                                setAsk({ key: c.key, voiceId: pr.voiceId });
                              }}
                            >
                              <VoiceMark name={pr.publicName} kind="licensed" size={28} />
                              <b>{pr.publicName}</b>
                              <span className="sub">{usable ? `${price(pr.price)} · ${rs ? `demande ${rs === "envoyee" ? "envoyée" : rs === "acceptee" ? "acceptée" : rs === "refusee" ? "refusée" : "expirée"}` : "licence à demander"}` : lic ? st.label : "Non synthétisable"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="stack-sm">
                      <span className="label-sm">Voix générées par IA · sans titulaire, utilisables immédiatement</span>
                      <div className="voice-opts">
                        {AI_VOICES.map((v) => (
                          <button
                            key={v.voice_id}
                            type="button"
                            className="vopt"
                            aria-pressed={current === v.voice_id}
                            onClick={() => {
                              assign(p.id, c.key, v.voice_id);
                              toast(`${c.name} : voix IA « ${v.name} »`, "ok");
                            }}
                          >
                            <VoiceMark name={v.name} kind="ai" size={28} />
                            <b>{v.name}</b>
                            <span className="sub">{v.description.split(".")[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <StepFoot hint={notReady ? `${notReady} personnage${notReady > 1 ? "s" : ""} sans voix utilisable pour l’instant.` : "Chaque personnage a une voix utilisable."}>
        <Link to={`/projet/${p.id}/traduction`} className="btn btn-primary">
          Continuer vers la traduction
          <ArrowRight />
        </Link>
      </StepFoot>
      {ask && <RequestDialog open onClose={() => setAsk(null)} voiceId={ask.voiceId} project={p} characterKey={ask.key} />}
      <PayDialog request={paying} onClose={() => setPaying(null)} />
    </>
  );
}
