import { ArrowRight, Info, Pause, Pencil, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { accountOf, useStore, type Project } from "../../state/store";
import type { Character } from "../../state/workflow";
import { Callout, plural, Proposal, Prov, Status, timecode, toast, VoiceMark } from "../../ui/kit";
import { useVideoSrc } from "./shared";
import { StepFoot } from "./Workspace";

/** Plays a slice of the project's own video: the real audio excerpt of a speaker. */
function useExcerpt(src: string | null) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stopAt = useRef(0);
  useEffect(() => {
    if (!src) return;
    const v = document.createElement("video");
    v.src = src;
    v.preload = "auto";
    v.playsInline = true;
    const onTime = () => {
      if (v.currentTime >= stopAt.current) {
        v.pause();
        setPlaying(null);
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", () => setPlaying(null));
    ref.current = v;
    return () => {
      v.pause();
      v.removeEventListener("timeupdate", onTime);
      ref.current = null;
    };
  }, [src]);
  const toggle = (id: string, start: number, end: number) => {
    const v = ref.current;
    if (!v) return;
    if (playing === id) {
      v.pause();
      return;
    }
    stopAt.current = end;
    v.currentTime = start;
    void v.play().then(() => setPlaying(id)).catch(() => toast("Lecture impossible dans ce navigateur", "bad"));
  };
  return { available: Boolean(src), playing, toggle };
}

function CharacterCard({ p, c, excerpt }: { p: Project; c: Character; excerpt: ReturnType<typeof useExcerpt> }) {
  const confirm = useStore((s) => s.confirmCharacter);
  const update = useStore((s) => s.updateCharacter);
  const me = useStore(accountOf);
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description);
  const [editing, setEditing] = useState(!c.confirmed);
  const ids = { name: useId(), desc: useId() };
  const lines = p.segments.filter((s) => s.speaker === c.key);
  const total = lines.reduce((a, s) => a + (s.end - s.start), 0);
  const first = lines[0];

  return (
    <article className="char" aria-label={`Personnage ${c.name}`}>
      <div>
        <div className="char-head">
          <VoiceMark name={c.confirmed ? c.name : c.proposedName} kind="original" size={36} />
          <div className="grow">
            <h3>{c.confirmed ? c.name : c.proposedName}</h3>
            <span className="hint num">
              {plural(lines.length, "prise de parole", "prises de parole")} · {total.toFixed(1).replace(".", ",")} s au total
            </span>
          </div>
          {c.confirmed ? <Status tone="ok">Confirmé</Status> : <Status tone="info">À confirmer</Status>}
        </div>

        {editing ? (
          <Proposal className="stack">
            <p className="hint">
              Identifiant proposé : <b>{c.proposedName}</b> · {c.proposedDescription}
            </p>
            <div className="field">
              <label htmlFor={ids.name}>Nom du personnage</label>
              <input id={ids.name} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Amel" />
            </div>
            <div className="field">
              <label htmlFor={ids.desc}>Description</label>
              <textarea id={ids.desc} className="textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={!name.trim()}
                onClick={() => {
                  confirm(p.id, c.key, name, desc);
                  setEditing(false);
                  toast(`Personnage « ${name.trim()} » confirmé`, "ok");
                }}
              >
                Confirmer ce personnage
              </button>
              {c.confirmed && (
                <button className="btn btn-ghost" onClick={() => (setEditing(false), setName(c.name), setDesc(c.description))}>
                  Annuler
                </button>
              )}
            </div>
          </Proposal>
        ) : (
          <Proposal decided by={me?.name}>
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div className="stack-sm">
                <b>{c.name}</b>
                <p className="muted" style={{ fontSize: 13 }}>
                  {c.description || "Sans description."}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(true);
                  update(p.id, c.key, { confirmed: false });
                }}
              >
                <Pencil />
                Modifier
              </button>
            </div>
          </Proposal>
        )}
      </div>

      <div className="stack">
        <div className="row-between">
          <span className="label-sm">Extrait audio</span>
          {excerpt.available ? <Prov kind="real">votre vidéo</Prov> : <Prov kind="example" />}
        </div>
        {excerpt.available && first ? (
          <button className="btn btn-secondary" onClick={() => excerpt.toggle(`${c.key}-all`, first.start, first.end)}>
            {excerpt.playing === `${c.key}-all` ? <Pause /> : <Play />}
            Écouter la première intervention
          </button>
        ) : (
          <p className="hint">Projet d’exemple sans fichier vidéo : l’extrait n’est pas disponible. Les répliques transcrites sont listées ci-dessous.</p>
        )}
        <span className="label-sm">Positions des interventions</span>
        <div className="char-lines">
          {lines.map((s) => (
            <button key={s.id} className="char-line" aria-pressed={excerpt.playing === s.id} onClick={() => excerpt.available && excerpt.toggle(s.id, s.start, s.end)} disabled={!excerpt.available} aria-label={`Écouter ${timecode(s.start)}`}>
              <span className="mono">
                {timecode(s.start)}–{timecode(s.end).slice(3)}
              </span>
              <span className="ar" lang="ar-TN">
                {s.source}
              </span>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function Characters({ p }: { p: Project }) {
  const { src } = useVideoSrc(p);
  const excerpt = useExcerpt(src);
  const chars = Object.values(p.characters);
  const left = chars.filter((c) => !c.confirmed).length;
  return (
    <>
      <div className="stack-lg">
        <Callout tone="plain" icon={Info} title="La détection d’une voix ne prouve pas l’identité réelle d’une personne.">
          Les noms et descriptions ci-dessous sont des propositions de l’IA, encadrées en pointillés. Corrigez-les puis confirmez : un trait plein indique une décision humaine.
        </Callout>
        <div className="chars">
          {chars.map((c) => (
            <CharacterCard key={c.key} p={p} c={c} excerpt={excerpt} />
          ))}
        </div>
      </div>
      <StepFoot hint={left ? `${plural(left, "personnage reste", "personnages restent")} à confirmer.` : "Tous les personnages sont confirmés."}>
        <Link to={`/projet/${p.id}/autorisations`} className="btn btn-primary" aria-disabled={left > 0} onClick={(e) => left > 0 && e.preventDefault()}>
          Continuer vers les autorisations
          <ArrowRight />
        </Link>
      </StepFoot>
    </>
  );
}
