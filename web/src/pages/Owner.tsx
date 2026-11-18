import { BellRing, CircleSlash, RotateCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { USES, voiceById } from "../core/catalog";
import { fmt, OWNER_SHARE } from "../core/credits";
import { RED_LINES, THEMES } from "../core/safety";
import type { Theme, Use } from "../core/types";
import { earningsOf, OWNER, OWNER_VOICE, useStore } from "../state/store";
import { frDate, LicenseChip, Orb, toast } from "../ui/kit";
import { shortHash } from "../core/canonical";

const OFFERABLE: Use[] = ["doublage_film", "doublage_video_en_ligne", "bande_annonce", "publicite"];

export function MyVoice() {
  const lic = useStore((s) => s.licenses.find((l) => l.voice_id === OWNER_VOICE))!;
  const update = useStore((s) => s.updateOwnLicense);
  const revoke = useStore((s) => s.revoke);
  const reinstate = useStore((s) => s.reinstate);
  const voice = voiceById(OWNER_VOICE)!;
  const [uses, setUses] = useState<Use[]>(lic.allowed_uses);
  const [themes, setThemes] = useState<Theme[]>(lic.forbidden_themes);
  const [confirm, setConfirm] = useState(false);
  const revoked = lic.status === "revoked";
  const dirty = uses.join() !== lic.allowed_uses.join() || [...themes].sort().join() !== [...lic.forbidden_themes].sort().join();

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = () => {
    update({ allowed_uses: OFFERABLE.filter((u) => uses.includes(u)), forbidden_themes: themes });
    toast("Passeport mis à jour et signé à nouveau", "ok");
  };

  return (
    <div className="page">
      <div className="page-head">
        <Orb hue={voice.hue} size={52} />
        <div>
          <h1>Ma voix, mes règles</h1>
          <p className="lead">
            {OWNER.name} · licence <span className="mono">{lic.license_id}</span> · valide du {frDate(lic.valid_from)} au {frDate(lic.valid_until)}
          </p>
        </div>
        <div className="actions">
          <LicenseChip lic={lic} />
        </div>
      </div>

      <div className="owner">
        <div className="owner-main">
          <section className="panel">
            <div className="panel-head">
              <h2>Ce que ma voix peut faire</h2>
            </div>
            <div className="panel-body">
              <ul className="opt-list">
                {OFFERABLE.map((u) => (
                  <li key={u}>
                    <label className="opt">
                      <span>
                        <b>{USES[u]}</b>
                        <span className="muted">{u === "publicite" ? "Désactivé par défaut : votre voix ne vend rien sans votre accord." : "Les créateurs paient en jetons, vous recevez 70 %."}</span>
                      </span>
                      <span className="switch">
                        <input type="checkbox" role="switch" checked={uses.includes(u)} onChange={() => setUses(toggle(uses, u))} aria-label={USES[u]} disabled={revoked} />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Ce que ma voix ne dira jamais</h2>
            </div>
            <div className="panel-body">
              <fieldset className="themes" disabled={revoked}>
                <legend className="hint">Cochez les thèmes interdits. Toute réplique qui les touche est refusée avant la synthèse, et vous êtes prévenue.</legend>
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <label key={t} className={`theme ${themes.includes(t) ? "on" : ""}`}>
                    <input type="checkbox" checked={themes.includes(t)} onChange={() => setThemes(toggle(themes, t))} />
                    <span>
                      <b>{THEMES[t].label}</b>
                      <span className="muted">{THEMES[t].hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="notice notice-plain">
                <ShieldCheck aria-hidden />
                <span>
                  <b>Toujours refusé, pour toutes les voix :</b> {Object.values(RED_LINES).map((r) => r.label.toLowerCase()).join(", ")}. Ces limites ne dépendent pas de vos réglages.
                </span>
              </div>
            </div>
          </section>

          <div className="save-bar">
            <span className="hint">
              Signature actuelle <span className="mono">{shortHash(lic.signature, 16)}</span>. Chaque modification est signée à nouveau et inscrite au journal.
            </span>
            <button className="btn btn-primary" onClick={save} disabled={!dirty || revoked}>
              Enregistrer et signer
            </button>
          </div>

          <section className="panel danger">
            <div className="panel-head">
              <h2>Retirer mon consentement</h2>
            </div>
            <div className="panel-body">
              {revoked ? (
                <>
                  <p>
                    Licence révoquée le {frDate(lic.revoked_at!, true)}. Toute nouvelle génération avec votre voix est refusée, y compris par le serveur.
                  </p>
                  <div>
                    <button className="btn btn-secondary" onClick={() => (reinstate(lic.license_id), toast("Licence rétablie et signée à nouveau", "ok"))}>
                      <RotateCcw />
                      Rétablir ma licence
                    </button>
                  </div>
                </>
              ) : confirm ? (
                <>
                  <p>
                    <b>Les générations futures seront refusées immédiatement.</b> L’audio déjà livré aux créateurs ne peut pas être retiré, et le Passeport 360° de leurs œuvres le dit.
                  </p>
                  <div className="row-gap">
                    <button className="btn btn-danger-solid" onClick={() => (revoke(lic.license_id), setConfirm(false), toast("Licence révoquée", "red"))}>
                      <CircleSlash />
                      Révoquer maintenant
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
                      Annuler
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">Vous pouvez révoquer à tout moment, sans justification.</p>
                  <div>
                    <button className="btn btn-danger" onClick={() => setConfirm(true)}>
                      Révoquer ma licence…
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
        <OwnerActivity />
      </div>
    </div>
  );
}

function OwnerActivity() {
  const allNotes = useStore((s) => s.notifications);
  const notes = allNotes.filter((n) => n.persona === "owner");
  const earned = useStore((s) => earningsOf(s, OWNER_VOICE));
  return (
    <aside className="owner-side">
      <section className="panel">
        <div className="panel-head">
          <BellRing size={16} aria-hidden />
          <h3>Activité de ma voix</h3>
        </div>
        <div className="panel-body">
          <p>
            <span className="num big">{fmt.format(earned)}</span> jetons reçus ce mois-ci, soit {Math.round(OWNER_SHARE * 100)} % de chaque génération.
          </p>
          <ul className="feed">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id}>
                <span className={`tick tick-${n.tone}`} aria-hidden />
                <div>
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                  <time className="muted">{frDate(n.at, true)}</time>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </aside>
  );
}

export function Earnings() {
  const allUsage = useStore((s) => s.usage);
  const usage = allUsage.filter((u) => u.voice_id === OWNER_VOICE);
  const total = usage.reduce((a, u) => a + u.owner, 0);
  const chars = usage.reduce((a, u) => a + u.chars, 0);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Revenus</h1>
          <p className="lead">
            Votre voix a dit {fmt.format(chars)} caractères ce mois-ci. Vous avez reçu {fmt.format(total)} jetons, {Math.round(OWNER_SHARE * 100)} % de ce que les créateurs ont dépensé.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => toast("Retrait simulé : aucun paiement réel dans la démonstration")}>
            Demander un retrait
          </button>
        </div>
      </div>
      {usage.length === 0 ? (
        <div className="empty">
          <h2 className="h-sm">Pas encore d’utilisation</h2>
          <p>Dès qu’un créateur génère une réplique avec votre voix, la ligne apparaît ici et vous êtes prévenue.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Œuvre</th>
                <th>Créateur</th>
                <th className="r">Caractères</th>
                <th className="r">Jetons dépensés</th>
                <th className="r">Vos 70 %</th>
              </tr>
            </thead>
            <tbody className="num">
              {usage.map((u) => (
                <tr key={u.id}>
                  <td>{frDate(u.at, true)}</td>
                  <td>{u.project}</td>
                  <td>{u.creator}</td>
                  <td className="r">{fmt.format(u.chars)}</td>
                  <td className="r">{fmt.format(u.cost)}</td>
                  <td className="r">
                    <b>+{fmt.format(u.owner)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint foot-note">Jetons et retraits simulés : la démonstration ne déplace aucun argent réel.</p>
    </div>
  );
}
