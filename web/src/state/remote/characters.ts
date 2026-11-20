/**
 * Back-end versions of the character actions (Écran 05) and of voice assignment (Écran 09).
 * Applied locally at once; the server's answer (with its journal entries) then replaces the project.
 */
import { api } from "../../api/client";
import type { Project } from "../store";
import type { Character, LifeStatus } from "../workflow";
import { applyServer, patchLocal, refreshProject } from "./projects";
import { report } from "./report";
import type { Get, Set } from "./state";

type CharacterPatch = Partial<Pick<Character, "name" | "description" | "confirmed" | "useOriginal" | "lifeStatus">>;

function patchChar(set: Set, pid: string, key: string, fn: (c: Character) => Partial<Character>): void {
  patchLocal(set, pid, (p) => (p.characters[key] ? { characters: { ...p.characters, [key]: { ...p.characters[key], ...fn(p.characters[key]) } } } : {}));
}

async function sendCharacter(set: Set, pid: string, key: string, body: CharacterPatch): Promise<void> {
  try {
    applyServer(set, await api.patch<Project>(`/projects/${pid}/characters/${key}`, body));
  } catch (err) {
    report(err);
    await refreshProject(set, pid);
  }
}

export function updateCharacter(set: Set, pid: string, key: string, patch: Partial<Character>): Promise<void> {
  patchChar(set, pid, key, () => patch);
  const body: CharacterPatch = {};
  for (const f of ["name", "description", "confirmed", "useOriginal", "lifeStatus"] as const) {
    if (patch[f] !== undefined) (body as Record<string, unknown>)[f] = patch[f];
  }
  return Object.keys(body).length ? sendCharacter(set, pid, key, body) : Promise.resolve();
}

export function confirmCharacter(set: Set, pid: string, key: string, name: string, description: string): Promise<void> {
  patchChar(set, pid, key, () => ({ name: name.trim(), description: description.trim(), confirmed: true }));
  patchLocal(set, pid, (p) => ({ speakers: { ...p.speakers, [key]: { ...(p.speakers[key] ?? { gender: "inconnu" }), name: name.trim() } } }));
  return sendCharacter(set, pid, key, { name: name.trim(), description: description.trim(), confirmed: true });
}

export function setUseOriginal(set: Set, pid: string, key: string, v: boolean): Promise<void> {
  patchChar(set, pid, key, () => ({ useOriginal: v }));
  return sendCharacter(set, pid, key, { useOriginal: v });
}

export function setLifeStatus(set: Set, pid: string, key: string, st: LifeStatus): Promise<void> {
  patchChar(set, pid, key, (c) => ({
    lifeStatus: st,
    living: st === "vivant" ? (c.living ?? { status: "a_obtenir", email: "", registered: false }) : c.living,
    dossier: st === "decede" ? (c.dossier ?? { status: "manquant", deceasedName: "", declaredRole: "" }) : c.dossier,
  }));
  return sendCharacter(set, pid, key, { lifeStatus: st });
}

export async function assignVoice(set: Set, pid: string, key: string, voiceId: string): Promise<void> {
  patchLocal(set, pid, (p) => ({ speakerVoices: { ...p.speakerVoices, [key]: voiceId }, characters: { ...p.characters, [key]: { ...p.characters[key], useOriginal: false } } }));
  try {
    applyServer(set, await api.post<Project>(`/projects/${pid}/characters/${key}/voice`, { voiceId }));
  } catch (err) {
    report(err);
    await refreshProject(set, pid);
  }
}

export function setSpeakerVoice(set: Set, get: Get, speaker: string, voiceId: string): Promise<void> {
  return assignVoice(set, get().currentId, speaker, voiceId);
}

/** A speaker the analysis missed (two voices heard as one). The server picks the key and the name. */
export async function addCharacter(set: Set, pid: string): Promise<void> {
  try {
    applyServer(set, await api.post<Project>(`/projects/${pid}/characters`, {}));
  } catch (err) {
    report(err);
  }
}

/** One person the analysis split in two: `key`'s lines go to `into`, then `key` is removed. */
export async function mergeCharacter(set: Set, pid: string, key: string, into: string): Promise<void> {
  patchLocal(set, pid, (p) => {
    const { [key]: _c, ...characters } = p.characters;
    return { characters, segments: p.segments.map((s) => (s.speaker === key ? { ...s, speaker: into } : s)) };
  });
  try {
    applyServer(set, await api.post<Project>(`/projects/${pid}/characters/${key}/merge`, { into }));
  } catch (err) {
    report(err);
    await refreshProject(set, pid);
  }
}
