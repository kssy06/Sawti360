import { useEffect, useState, useSyncExternalStore } from "react";
import { voiceById } from "../../core/catalog";
import { loadVideo, mediaVersion, setRemoteVideo, subscribeMedia, videoUrl } from "../../media/local";
import { profileOf } from "../../mock/registry";
import { slotsOf, type Project, type StepKey } from "../../state/store";
import { originalVoiceState, type LicenseRequest } from "../../state/workflow";

export const STEPS: { key: StepKey; label: string; screen: string }[] = [
  { key: "analyse", label: "Analyse", screen: "Écran 04" },
  { key: "personnages", label: "Personnages", screen: "Écran 05" },
  { key: "autorisations", label: "Autorisations", screen: "Écran 06" },
  { key: "voix", label: "Voix françaises", screen: "Écrans 07–09" },
  { key: "traduction", label: "Traduction", screen: "Écran 10" },
  { key: "timeline", label: "Timeline", screen: "Écran 11" },
  { key: "generation", label: "Génération", screen: "Écran 12" },
  { key: "resultat", label: "Résultat", screen: "Écran 13" },
];

/** What each step asks of the creator, then what it gives them: the line under the stepper. */
export const STEP_GUIDE: Record<StepKey, { does: string; gets: string }> = {
  analyse: { does: "L’IA écoute la vidéo, repère qui parle, transcrit la derja et propose une traduction.", gets: "Vous obtenez les répliques et les personnages, que vous vérifiez ensuite." },
  personnages: { does: "Confirmez qui est qui : l’IA propose, vous décidez.", gets: "Chaque personnage confirmé pourra recevoir une voix française." },
  autorisations: { does: "Dites si chaque voix originale peut servir, et obtenez l’accord de la personne quand il le faut.", gets: "Aucune voix n’est générée sans autorisation valide." },
  voix: { does: "Choisissez une voix française par personnage : une voix licenciée d’une personne réelle, ou une voix générée par IA.", gets: "Une licence demandée doit être acceptée par son titulaire avant la génération." },
  traduction: { does: "Relisez chaque réplique traduite et approuvez-la.", gets: "Seules les répliques approuvées seront doublées." },
  timeline: { does: "Écoutez chaque réplique à sa place dans la vidéo avec « Aperçu audio », et raccourcissez celles qui débordent.", gets: "Étape facultative : vous pouvez passer directement à la génération." },
  generation: { does: "Sawti 360 synthétise les répliques approuvées, les place dans la vidéo et signe le Passeport 360°.", gets: "Quelques secondes par réplique ; vous pouvez quitter la page pendant ce temps." },
  resultat: { does: "Écoutez la version française et téléchargez vos fichiers.", gets: "Sous-titres .srt, vidéo MP4 doublée et Passeport 360° public." },
};

export type StepStatus = "done" | "attn" | "todo" | "locked";

export function stepStates(p: Project, requests: LicenseRequest[]): Record<StepKey, StepStatus> {
  const analysed = !p.pipeline || p.pipeline.status === "done";
  const chars = Object.values(p.characters);
  const charsDone = chars.length > 0 && chars.every((c) => c.confirmed);
  const auths = chars.map(originalVoiceState);
  const authDone = charsDone && auths.every((a) => a === "non_requise" || a === "autorisee");
  const authAttn = auths.some((a) => a === "bloquee" || a === "en_attente" || a === "a_renseigner" || a === "a_obtenir");
  const slots = Object.values(slotsOf({ requests }, p));
  const voicesDone = charsDone && slots.length > 0 && slots.every((s) => s.usable);
  const trDone = p.segments.length > 0 && p.segments.every((s) => s.validated);
  const genDone = p.generation.status === "done";
  const lock = (ok: boolean, st: StepStatus): StepStatus => (ok ? st : "locked");
  return {
    analyse: analysed ? "done" : "todo",
    personnages: lock(analysed, charsDone ? "done" : "todo"),
    autorisations: lock(analysed && charsDone, authDone ? "done" : authAttn ? "attn" : "todo"),
    voix: lock(analysed && charsDone, voicesDone ? "done" : slots.some((s) => s.mode === "licensed" && !s.usable) ? "attn" : "todo"),
    traduction: lock(analysed, trDone ? "done" : "todo"),
    timeline: lock(analysed, trDone ? "done" : "todo"),
    generation: lock(analysed, genDone ? "done" : "todo"),
    resultat: lock(genDone, genDone ? "done" : "todo"),
  };
}

/** The step a project should open on: the first one that is not done. */
export function nextStep(p: Project, requests: LicenseRequest[]): StepKey {
  const st = stepStates(p, requests);
  if (p.generation.status === "done") return "resultat";
  if (p.generation.status === "running") return "generation";
  const order: StepKey[] = ["analyse", "personnages", "autorisations", "voix", "traduction", "generation"];
  return order.find((k) => st[k] !== "done") ?? "generation";
}

export function useMedia() {
  return useSyncExternalStore(subscribeMedia, mediaVersion);
}

/** Loads the project's video from memory, IndexedDB or its remote link; null while missing. */
export function useVideoSrc(p: Project): { src: string | null; loading: boolean } {
  useMedia();
  const [loading, setLoading] = useState(Boolean(p.video) && !videoUrl(p.id));
  useEffect(() => {
    let alive = true;
    if (!p.video) return setLoading(false);
    if (p.video.url && !videoUrl(p.id)) setRemoteVideo(p.id, p.video.url);
    if (videoUrl(p.id)) return setLoading(false);
    setLoading(true);
    loadVideo(p.id).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [p.id, p.video]);
  return { src: videoUrl(p.id), loading };
}

/** How a character's French voice is shown everywhere: mark kind, name and a short label. */
export function voiceInfo(p: Project, key: string): { kind: "licensed" | "ai" | "original" | "none"; name: string; label: string } {
  const c = p.characters[key];
  if (c?.useOriginal) return { kind: "original", name: c.name, label: "Voix originale" };
  const vid = p.speakerVoices[key];
  const v = vid ? voiceById(vid) : undefined;
  if (!v) return { kind: "none", name: "—", label: "Aucune voix attribuée" };
  if (v.kind === "base") return { kind: "ai", name: v.name, label: "Voix générée par IA" };
  return { kind: "licensed", name: profileOf(v.voice_id)?.publicName ?? v.name, label: "Voix licenciée" };
}
