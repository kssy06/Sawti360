import { Search, ShieldCheck, ShieldX } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { USES, VOICES } from "../core/catalog";
import { verifyLicense } from "../core/crypto";
import { THEMES } from "../core/safety";
import type { VoiceProfile } from "../mock/registry";
import { allProfiles, useStore } from "../state/store";
import { Empty, frDate, Hash, KV, licenseState, PageHead, Prov, Segmented, Sheet, Status, VoiceMark } from "../ui/kit";
import { useCrumbs } from "../ui/Shell";
import { price, RequestDialog, SamplePlayer } from "./licensing";

function availability(p: VoiceProfile, licKey: string | undefined): { usable: boolean; label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (p.availability === "indisponible" || licKey === "revoked") return { usable: false, label: licKey === "revoked" ? "Licence révoquée" : "Indisponible", tone: "bad" };
  if (licKey === "future") return { usable: false, label: "Disponible prochainement", tone: "warn" };
  if (!licKey || licKey === "none") return { usable: false, label: "Nouveau profil · synthèse non branchée", tone: "muted" };
  return { usable: true, label: "Disponible", tone: "ok" };
}

function VoiceSheet({ profile, onClose, onRequest }: { profile: VoiceProfile; onClose: () => void; onRequest: () => void }) {
  const lic = useStore((s) => s.licenses.find((l) => l.voice_id === profile.voiceId));
  const st = licenseState(lic);
  const av = availability(profile, lic ? st.key : undefined);
  const sigOk = lic ? verifyLicense(lic) : false;
  return (
    <Sheet
      open
      title={`Profil de ${profile.publicName}`}
      onClose={onClose}
      head={
        <>
          <VoiceMark name={profile.publicName} kind="licensed" size={44} />
          <div>
            <h2 style={{ fontSize: 18 }}>{profile.publicName}</h2>
            <span className="hint">{profile.pseudonym ? "Pseudonyme public" : "Nom public"} · <Prov kind="example">profil fictif</Prov></span>
          </div>
        </>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button className="btn btn-primary" onClick={onRequest} disabled={!av.usable}>
            Demander l’autorisation
          </button>
        </>
      }
    >
      <div className="row">
        <Status tone={av.tone}>{av.label}</Status>
        {lic && (
          <Status tone={sigOk ? "ok" : "bad"} icon={sigOk ? ShieldCheck : ShieldX}>
            {sigOk ? "Passeport de voix signé" : "Signature invalide"}
          </Status>
        )}
      </div>
      <p>{profile.description}</p>
      <section className="stack-sm">
        <span className="label-sm">Échantillon</span>
        <SamplePlayer profile={profile} />
      </section>
      <section className="stack-sm">
        <h3 style={{ fontSize: 14 }}>Licence de projet</h3>
        <KV
          rows={[
            ["Tarif", <span className="price">{price(profile.price)}</span>],
            ["Durée", "Permanente, pour un projet précis"],
            ["Autres projets", "Non couverts : nouvelle demande nécessaire"],
            ["Conditions du titulaire", profile.conditions],
            ["Langues", profile.languages.join(", ")],
            ["Réponse", "Sous 72 heures, sinon la demande expire"],
          ]}
        />
      </section>
      {lic && (
        <section className="stack-sm">
          <h3 style={{ fontSize: 14 }}>Passeport de voix</h3>
          <KV
            rows={[
              ["Licence", <span className="mono">{lic.license_id}</span>],
              ["Usages autorisés", lic.allowed_uses.map((u) => USES[u]).join(", ")],
              ["Usages interdits", lic.forbidden_uses.map((u) => USES[u]).join(", ") || "aucun"],
              ["Thèmes refusés", lic.forbidden_themes.map((t) => THEMES[t].label).join(", ") || "aucun"],
              ["Validité", `du ${frDate(lic.valid_from)} au ${frDate(lic.valid_until)}`],
              ["Entraînement d’IA", lic.no_training ? "Interdit" : "Autorisé"],
              ["Preuve de consentement", lic.consent_evidence_sha256.length === 64 ? <Hash value={lic.consent_evidence_sha256} /> : lic.consent_evidence_sha256],
              ["Signature Ed25519", <Hash value={lic.signature} />],
            ]}
          />
        </section>
      )}
      <p className="hint">Rendu des échantillons : voix de synthèse ElevenLabs prédéfinies, qui n’imitent aucune personne réelle. Les titulaires affichés sont des profils fictifs.</p>
    </Sheet>
  );
}

export default function Library() {
  useCrumbs([{ label: "Bibliothèque de voix" }]);
  const owned = useStore((s) => s.ownedVoices);
  const licenses = useStore((s) => s.licenses);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "free">("all");
  const [asking, setAsking] = useState<string | null>(null);
  const profiles = allProfiles({ ownedVoices: owned });
  const open = profiles.find((p) => p.voiceId === params.get("v"));
  const rows = useMemo(
    () =>
      profiles.filter((p) => {
        const lic = licenses.find((l) => l.voice_id === p.voiceId);
        const av = availability(p, lic ? licenseState(lic).key : undefined);
        const match = `${p.publicName} ${p.description} ${p.languages.join(" ")} ${p.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase());
        return match && (filter === "all" || (filter === "ok" ? av.usable : p.price === 0));
      }),
    [profiles, licenses, q, filter],
  );
  const ai = VOICES.filter((v) => v.kind === "base");

  return (
    <>
      <PageHead
        title="Bibliothèque de voix"
        lead="Des voix prêtées par des personnes, sous licence. Écoutez un échantillon, consultez les conditions et demandez une licence pour un projet précis."
      />
      <div className="lib-toolbar">
        <label className="input-icon">
          <Search aria-hidden />
          <span className="sr-only">Rechercher une voix</span>
          <input className="input" placeholder="Nom, langue, registre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented
          label="Filtrer les voix"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Toutes" },
            { value: "ok", label: "Disponibles" },
            { value: "free", label: "Gratuites" },
          ]}
        />
        <span className="grow" />
        <Prov kind="example">profils et tarifs fictifs</Prov>
      </div>

      {rows.length === 0 ? (
        <Empty title="Aucune voix ne correspond" action={<button className="btn btn-secondary btn-sm" onClick={() => (setQ(""), setFilter("all"))}>Tout afficher</button>}>
          Essayez un autre mot ou retirez le filtre.
        </Empty>
      ) : (
        <div className="voice-grid">
          {rows.map((p) => {
            const lic = licenses.find((l) => l.voice_id === p.voiceId);
            const av = availability(p, lic ? licenseState(lic).key : undefined);
            return (
              <article key={p.voiceId} className="vcard" aria-label={p.publicName}>
                <div className="vcard-head">
                  <VoiceMark name={p.publicName} kind="licensed" size={40} />
                  <span className="cell-main grow">
                    <b>{p.publicName}</b>
                    <span>{p.pseudonym ? "Pseudonyme" : "Nom public"}</span>
                  </span>
                  <Status tone={av.tone}>{av.label}</Status>
                </div>
                <p className="vcard-desc">{p.description}</p>
                <SamplePlayer profile={p} />
                <dl className="vcard-facts">
                  <div>
                    <dt>Langues</dt>
                    <dd>{p.languages.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Tarif par projet</dt>
                    <dd className="price">{price(p.price)}</dd>
                  </div>
                </dl>
                <div className="tags">
                  {p.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="vcard-foot">
                  <button className="btn btn-secondary btn-sm" onClick={() => setParams({ v: p.voiceId })}>
                    Consulter
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={!av.usable} onClick={() => setAsking(p.voiceId)}>
                    Demander l’autorisation
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Voix générées par IA</h2>
          <span className="hint">Voix de synthèse Sawti, sans titulaire. Utilisables immédiatement à l’étape « Voix françaises ». Elles n’imitent personne.</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Voix</th>
                <th>Registre</th>
                <th>Licence</th>
              </tr>
            </thead>
            <tbody>
              {ai.map((v) => (
                <tr key={v.voice_id}>
                  <td>
                    <span className="row" style={{ flexWrap: "nowrap" }}>
                      <VoiceMark name={v.name} kind="ai" size={28} />
                      <b style={{ fontWeight: 500 }}>{v.name}</b>
                    </span>
                  </td>
                  <td className="muted">{v.description}</td>
                  <td>
                    <Status tone="muted">Incluse, sans titulaire</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && <VoiceSheet profile={open} onClose={() => setParams({})} onRequest={() => setAsking(open.voiceId)} />}
      {asking && <RequestDialog open onClose={() => setAsking(null)} voiceId={asking} />}
    </>
  );
}
