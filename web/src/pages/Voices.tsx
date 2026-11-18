import { ChevronRight, Loader2, Search, ShieldCheck, ShieldX, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { USES, VOICES } from "../core/catalog";
import { costOf, fmt } from "../core/credits";
import { verifyLicense } from "../core/crypto";
import { THEMES } from "../core/safety";
import type { Voice } from "../core/types";
import { useStore, type GenState } from "../state/store";
import { AudioClip, frDate, LicenseChip, licenseState, Orb, Sheet } from "../ui/kit";
import { shortHash } from "../core/canonical";

const LANG = { fr: "Français", ar: "Arabe", en: "Anglais" } as const;

function TryVoice({ voice }: { voice: Voice }) {
  const tryVoice = useStore((s) => s.tryVoice);
  const persona = useStore((s) => s.persona);
  const [text, setText] = useState("Je veux montrer au monde entier ce que nous faisons ici.");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(GenState & { url?: string }) | null>(null);
  if (persona !== "creator") return null;
  const run = async () => {
    setBusy(true);
    setRes(await tryVoice(voice.voice_id, text));
    setBusy(false);
  };
  return (
    <section className="stack">
      <h3 className="h-sm">Essayer cette voix</h3>
      <div className="field">
        <label htmlFor="try-text">Phrase à dire</label>
        <textarea id="try-text" className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} />
        <span className="hint num">
          {costOf(text)} jetons · essayez aussi une phrase politique ou haineuse pour voir le filtre refuser.
        </span>
      </div>
      <div>
        <button className="btn btn-primary" onClick={run} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="spin" /> : <Sparkles />}
          Générer
        </button>
      </div>
      {res?.status === "ok" && res.url && (
        <>
          <AudioClip url={res.url} label={`essai de ${voice.name}`} />
          <div className="notice notice-ok">
            <ShieldCheck aria-hidden />
            <span>
              Autorisé par {res.decision?.license_id} · {res.cost} jetons, dont {res.ownerShare} pour le titulaire
            </span>
          </div>
        </>
      )}
      {res?.status === "refused" && res.decision && (
        <div className="notice notice-red" role="alert">
          <ShieldX aria-hidden />
          <span className="grow">
            <b>Refusé.</b> {res.decision.reason_fr}
            {res.decision.detail ? ` Détecté : ${res.decision.detail}.` : ""}
          </span>
        </div>
      )}
      {res?.status === "error" && <div className="notice notice-warn">{res.message}</div>}
    </section>
  );
}

function PassportSheet({ voice, onClose }: { voice: Voice; onClose: () => void }) {
  const lic = useStore((s) => s.licenses.find((l) => l.voice_id === voice.voice_id));
  const sigOk = lic ? verifyLicense(lic) : false;
  return (
    <Sheet
      title={`Passeport de voix de ${voice.name}`}
      onClose={onClose}
      head={
        <>
          <Orb hue={voice.hue} size={40} neutral={voice.voice_id === "v_neutre"} />
          <div>
            <h2>{voice.name}</h2>
            <p className="muted">{voice.description}</p>
          </div>
        </>
      }
    >
      <div className="row-gap">
        <LicenseChip lic={lic} />
        <span className={`chip ${sigOk ? "chip-ok" : "chip-red"}`}>
          {sigOk ? <ShieldCheck aria-hidden /> : <ShieldX aria-hidden />}
          {sigOk ? "Signature vérifiée" : "Signature invalide"}
        </span>
        {lic?.demo && <span className="chip chip-outline">Profil fictif de démonstration</span>}
      </div>
      {lic && (
        <section className="stack">
          <h3>Passeport de voix</h3>
          <dl className="dl">
            <dt>Licence</dt>
            <dd className="mono">{lic.license_id}</dd>
            <dt>Titulaire</dt>
            <dd>
              {lic.holder_name} · {lic.holder_role}
            </dd>
            <dt>Usages autorisés</dt>
            <dd>{lic.allowed_uses.map((u) => USES[u]).join(", ")}</dd>
            <dt>Usages interdits</dt>
            <dd>{lic.forbidden_uses.map((u) => USES[u]).join(", ") || "aucun"}</dd>
            <dt>Thèmes interdits</dt>
            <dd>{lic.forbidden_themes.map((t) => THEMES[t].label).join(", ") || "aucun"}</dd>
            <dt>Langues</dt>
            <dd>{lic.languages.map((l) => LANG[l]).join(", ")}</dd>
            <dt>Validité</dt>
            <dd>
              du {frDate(lic.valid_from)} au {frDate(lic.valid_until)}
            </dd>
            <dt>Rémunération</dt>
            <dd>{lic.owner_share ? `${Math.round(lic.owner_share * 100)} % des jetons dépensés sur cette voix` : "aucune : voix de synthèse sans titulaire"}</dd>
            <dt>Entraînement d’IA</dt>
            <dd>{lic.no_training ? "Interdit" : "Autorisé"}</dd>
            <dt>Preuve de consentement</dt>
            <dd className="mono" title={lic.consent_evidence_sha256}>
              {lic.consent_evidence_sha256.length === 64 ? `SHA-256 ${shortHash(lic.consent_evidence_sha256, 16)}` : lic.consent_evidence_sha256}
            </dd>
            {lic.revoked_at && (
              <>
                <dt>Révoquée le</dt>
                <dd>{frDate(lic.revoked_at, true)}</dd>
              </>
            )}
            <dt>Signature Ed25519</dt>
            <dd className="mono" title={lic.signature}>
              {shortHash(lic.signature, 24)}
            </dd>
          </dl>
        </section>
      )}
      <TryVoice voice={voice} />
      <p className="hint">Rendu audio : voix de synthèse ElevenLabs, qui n’imite aucune personne réelle. Le titulaire affiché est un profil fictif.</p>
    </Sheet>
  );
}

export default function Voices() {
  const licenses = useStore((s) => s.licenses);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "no">("all");
  const open = VOICES.find((v) => v.voice_id === params.get("v"));
  const rows = useMemo(
    () =>
      VOICES.filter((v) => {
        const lic = licenses.find((l) => l.voice_id === v.voice_id);
        const ok = licenseState(lic).key === "valid";
        const matches = `${v.name} ${v.description} ${lic?.allowed_uses.map((u) => USES[u]).join(" ")}`.toLowerCase().includes(q.toLowerCase());
        return matches && (filter === "all" || (filter === "ok") === ok);
      }),
    [licenses, q, filter],
  );
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Voix</h1>
          <p className="lead">Chaque voix a son Passeport de voix : qui l’a prêtée, pour quels usages, quels thèmes sont interdits. Sans licence valide, rien n’est généré.</p>
        </div>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search aria-hidden />
          <span className="sr-only">Rechercher une voix</span>
          <input className="input" placeholder="Rechercher une voix, un usage…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="seg-ctrl" role="group" aria-label="Filtrer par disponibilité">
          {(
            [
              ["all", "Toutes"],
              ["ok", "Disponibles"],
              ["no", "Indisponibles"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <h2 className="h-sm">Aucune voix ne correspond</h2>
          <p>Essayez un autre mot, ou affichez toutes les voix.</p>
          <button className="btn btn-secondary btn-sm" onClick={() => (setQ(""), setFilter("all"))}>
            Tout afficher
          </button>
        </div>
      ) : (
        <>
          {(
            [
              ["consentie", "Voix de titulaires", "Prêtées par des personnes réelles, sous licence signée. 70 % des jetons dépensés leur reviennent."],
              ["base", "Voix de base Sawti", "Pour tout le monde : voix de synthèse qui n’imitent personne. Les jetons vont à Sawti."],
            ] as const
          ).map(([kind, title, lead]) => {
            const group = rows.filter((v) => v.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind} className="voice-group">
                <div className="group-head">
                  <h2 className="h-sm">{title}</h2>
                  <p className="muted">{lead}</p>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Voix</th>
                        <th>Usages autorisés</th>
                        <th>Jetons</th>
                        <th>Passeport</th>
                        <th aria-label="Ouvrir" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((v) => {
                        const lic = licenses.find((l) => l.voice_id === v.voice_id);
                        return (
                          <tr key={v.voice_id} className="click" tabIndex={0} onClick={() => setParams({ v: v.voice_id })} onKeyDown={(e) => e.key === "Enter" && setParams({ v: v.voice_id })}>
                            <td>
                              <span className="voice-cell">
                                <Orb hue={v.hue} size={34} neutral={v.voice_id === "v_neutre"} />
                                <span>
                                  <b>{v.name}</b>
                                  <span className="muted">{v.description}</span>
                                </span>
                              </span>
                            </td>
                            <td>
                              <span className="chips">
                                {lic?.allowed_uses.map((u) => (
                                  <span key={u} className="chip">
                                    {USES[u].replace(/ \(.*\)/, "")}
                                  </span>
                                ))}
                              </span>
                            </td>
                            <td className="num">{lic?.owner_share ? `${fmt.format(Math.round(lic.owner_share * 100))} % au titulaire` : <span className="muted">100 % Sawti</span>}</td>
                            <td>{v.kind === "base" ? <span className="chip">Synthèse · aucune personne</span> : <LicenseChip lic={lic} />}</td>
                            <td className="r">
                              <ChevronRight size={16} color="var(--ink-3)" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
      {open && <PassportSheet voice={open} onClose={() => setParams({})} />}
    </div>
  );
}
