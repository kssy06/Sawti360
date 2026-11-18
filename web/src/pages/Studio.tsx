import { ArrowRight, CircleAlert, FileBadge2, Loader2, ShieldCheck, ShieldX, Sparkles, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { PROJECT, SPEAKERS, USES, VOICES, voiceById } from "../core/catalog";
import { costOf, fmt, split } from "../core/credits";
import { checkFidelity } from "../core/fidelity";
import type { Segment, Use } from "../core/types";
import { audioUrls, balanceOf, useStore } from "../state/store";
import { AudioClip, LicenseChip, Orb, timecode, toast } from "../ui/kit";

const TEST_VOICES = [
  { id: "voix_inconnue", label: "Voix importée sans passeport (test)" },
  { id: "voice_personnalite_publique", label: "Voix d’une personnalité publique (test)" },
];

function SegmentRow({ seg }: { seg: Segment }) {
  const gen = useStore((s) => s.gens[seg.id]);
  const voiceId = useStore((s) => s.speakerVoices[seg.speaker]);
  const lic = useStore((s) => s.licenses.find((l) => l.voice_id === voiceId));
  const edit = useStore((s) => s.editTranslation);
  const setValidated = useStore((s) => s.setValidated);
  const generate = useStore((s) => s.generate);
  const voice = voiceById(voiceId);
  const alerts = checkFidelity(seg.source, seg.translation);
  const fieldId = useId();
  const url = audioUrls.get(seg.id);
  const cost = costOf(seg.translation);
  const lowConf = seg.confidence < 0.8;

  const fixNumbers = (src: string[], tgt: string[]) => {
    let t = seg.translation;
    tgt.forEach((n, i) => (t = t.replace(new RegExp(`(?<![\\d])${n}(?![\\d])`), src[i])));
    edit(seg.id, t);
  };

  return (
    <article className={`seg ${seg.validated ? "is-valid" : ""} ${gen?.status === "refused" ? "is-refused" : ""}`} aria-label={`Réplique ${seg.id.slice(1)}`}>
      <div className="seg-meta">
        <span className="mono tc">
          {timecode(seg.start)} – {timecode(seg.end)}
        </span>
        <span className="speaker">
          {voice ? <Orb hue={voice.hue} size={18} neutral={voice.kind === "neutre"} /> : <span className="orb-missing" aria-hidden />}
          <b>{SPEAKERS[seg.speaker].name}</b>
          <span className="muted">· {voice?.name ?? "voix sans passeport"}</span>
        </span>
        {lowConf ? (
          <span className="chip chip-warn" title="Score de confiance de la transcription">
            <TriangleAlert aria-hidden />
            Transcription incertaine · {Math.round(seg.confidence * 100)} %
          </span>
        ) : (
          <span className="chip" title="Score de confiance de la transcription">
            Transcription · {Math.round(seg.confidence * 100)} %
          </span>
        )}
      </div>

      <div className="seg-grid">
        <div className="seg-src">
          <span className="label">Derja · transcription</span>
          <p className="ar" lang="ar-TN">
            {seg.source}
          </p>
        </div>
        <div className="seg-tgt">
          <label className="label" htmlFor={fieldId}>
            Français · proposé par l’IA, à valider
          </label>
          <textarea id={fieldId} className="textarea" rows={2} value={seg.translation} onChange={(e) => edit(seg.id, e.target.value)} lang="fr" />
        </div>
      </div>

      {alerts.map((a) => (
        <div key={a.type} className="notice notice-warn">
          <CircleAlert aria-hidden />
          <span className="grow">
            <b>{a.type === "CHIFFRES" ? "Chiffre modifié." : "Négation perdue."}</b> {a.message}
          </span>
          {a.type === "CHIFFRES" && a.source.length === a.target.length && a.source.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => fixNumbers(a.source, a.target)}>
              Remettre {a.source.join(", ")}
            </button>
          )}
        </div>
      ))}

      <footer className="seg-foot">
        <label className="check">
          <input type="checkbox" checked={seg.validated} onChange={(e) => setValidated(seg.id, e.target.checked)} />
          Texte validé
        </label>
        <span className="muted num seg-cost">
          {cost} caractères · {cost} jetons
        </span>
        <span className="grow" />
        {gen?.status === "ok" && url ? <AudioClip url={url} label={`réplique ${seg.id.slice(1)}`} /> : null}
        <button className="btn btn-secondary btn-sm" onClick={() => generate(seg.id)} disabled={gen?.status === "pending"}>
          {gen?.status === "pending" ? <Loader2 className="spin" /> : <Sparkles />}
          {gen?.status === "ok" ? "Régénérer" : "Générer"}
        </button>
      </footer>

      {gen?.status === "pending" && (
        <div className="notice notice-plain">
          <Loader2 className="spin" aria-hidden />
          <span>Vérification du Passeport de voix, puis synthèse…</span>
        </div>
      )}
      {gen?.status === "refused" && gen.decision && (
        <div className="notice notice-red" role="alert">
          <ShieldX aria-hidden />
          <span className="grow">
            <b>Refusé, rien n’a été généré.</b> {gen.decision.reason_fr}
            {gen.decision.detail ? <> Détecté : {gen.decision.detail}.</> : null} Aucun jeton débité.
          </span>
          <span className="chip chip-red mono">{gen.decision.reason_code}</span>
        </div>
      )}
      {gen?.status === "ok" && (
        <p className="seg-ok">
          <ShieldCheck aria-hidden />
          <span>
            Autorisé par la licence <span className="mono">{gen.decision?.license_id}</span> · {gen.cost} jetons, dont {gen.ownerShare} pour {lic?.holder_name ?? "la titulaire"}
            {gen.mock ? " · audio de test (moteur en mode test)" : ""}
          </span>
        </p>
      )}
      {gen?.status === "error" && (
        <div className="notice notice-warn">
          <CircleAlert aria-hidden />
          <span className="grow">{gen.message}</span>
        </div>
      )}
    </article>
  );
}

function Inspector() {
  const segments = useStore((s) => s.segments);
  const speakerVoices = useStore((s) => s.speakerVoices);
  const licenses = useStore((s) => s.licenses);
  const use = useStore((s) => s.use);
  const setUse = useStore((s) => s.setUse);
  const setSpeakerVoice = useStore((s) => s.setSpeakerVoice);
  const generate = useStore((s) => s.generate);
  const gens = useStore((s) => s.gens);
  const balance = useStore(balanceOf);
  const [running, setRunning] = useState(false);

  const todo = segments.filter((s) => s.validated && gens[s.id]?.status !== "ok");
  const chars = todo.reduce((a, s) => a + costOf(s.translation), 0);
  const owners = todo.reduce((a, s) => {
    const lic = licenses.find((l) => l.voice_id === speakerVoices[s.speaker]);
    return a + (lic ? split(costOf(s.translation), lic.owner_share).owner : 0);
  }, 0);
  const validated = segments.filter((s) => s.validated).length;

  const runAll = async () => {
    setRunning(true);
    for (const s of todo) await generate(s.id);
    setRunning(false);
    const st = useStore.getState();
    const refused = todo.filter((s) => st.gens[s.id]?.status === "refused").length;
    toast(refused ? `${todo.length - refused} générée(s), ${refused} refusée(s)` : `${todo.length} réplique(s) traitée(s)`, refused ? "red" : "ok");
  };

  return (
    <aside className="inspector">
      <section className="insp-block">
        <h2 className="h-sm">Voix des personnages</h2>
        {Object.entries(SPEAKERS).map(([key, sp]) => {
          const vid = speakerVoices[key];
          const lic = licenses.find((l) => l.voice_id === vid);
          return (
            <div key={key} className="field">
              <label htmlFor={`voice-${key}`}>{sp.name}</label>
              <select id={`voice-${key}`} className="select" value={vid} onChange={(e) => setSpeakerVoice(key, e.target.value)}>
                <optgroup label="Voix avec Passeport">
                  {VOICES.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tester un refus">
                  {TEST_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="insp-lic">
                <LicenseChip lic={lic} />
                {lic && (
                  <Link to={`/voix?v=${lic.voice_id}`} className="hint">
                    Voir le passeport
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="insp-block">
        <div className="field">
          <label htmlFor="use">Usage de la version doublée</label>
          <select id="use" className="select" value={use} onChange={(e) => setUse(e.target.value as Use)}>
            {(Object.keys(USES) as Use[]).map((u) => (
              <option key={u} value={u}>
                {USES[u]}
              </option>
            ))}
          </select>
          <span className="hint">Chaque titulaire choisit les usages qu’il accepte.</span>
        </div>
      </section>

      <section className="insp-block">
        <h2 className="h-sm">Générer</h2>
        <dl className="sum num">
          <dt>Répliques validées</dt>
          <dd>
            {validated} / {segments.length}
          </dd>
          <dt>À générer</dt>
          <dd>{fmt.format(chars)} caractères</dd>
          <dt>Coût</dt>
          <dd>{fmt.format(chars)} jetons</dd>
          <dt>Dont versé aux titulaires</dt>
          <dd>{fmt.format(owners)} jetons</dd>
          <dt>Solde ensuite</dt>
          <dd>{fmt.format(Math.max(0, balance - chars))} jetons</dd>
        </dl>
        <button className="btn btn-primary" onClick={runAll} disabled={running || todo.length === 0}>
          {running ? <Loader2 className="spin" /> : <Sparkles />}
          {todo.length ? `Générer ${todo.length} réplique${todo.length > 1 ? "s" : ""} validée${todo.length > 1 ? "s" : ""}` : "Générer les répliques validées"}
        </button>
        {todo.length === 0 && <p className="hint">{validated ? "Toutes les répliques validées sont générées." : "Validez au moins une réplique : l’IA propose, l’humain décide."}</p>}
        <p className="hint">Avant chaque réplique : Passeport de voix vérifié dans le navigateur, puis à nouveau par le serveur, et filtre de contenu.</p>
      </section>
    </aside>
  );
}

export default function Studio() {
  const segments = useStore((s) => s.segments);
  const gens = useStore((s) => s.gens);
  const validated = segments.filter((s) => s.validated).length;
  const done = Object.values(gens).filter((g) => g.status === "ok").length;
  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{PROJECT.title}</h1>
          <p className="lead">
            {PROJECT.subtitle} · {PROJECT.sourceLang} → {PROJECT.targetLang} · {validated} réplique{validated > 1 ? "s" : ""} validée{validated > 1 ? "s" : ""} sur {segments.length}
          </p>
        </div>
        <div className="actions">
          <Link className="btn btn-secondary" to="/passeport">
            <FileBadge2 />
            {done ? "Exporter avec le Passeport 360°" : "Passeport 360°"}
            <ArrowRight />
          </Link>
        </div>
      </div>
      <div className="studio">
        <div className="segs">
          {segments.map((s) => (
            <SegmentRow key={s.id} seg={s} />
          ))}
        </div>
        <Inspector />
      </div>
    </div>
  );
}
