/**
 * Back-end versions of the family-dossier actions (Écran 06, deceased person): the document goes to
 * the private bucket, the consistency check runs on the server (Gemini → Claude → « vérification »),
 * the creator validates only after « Correspondance détectée ».
 */
import { api } from "../../api/client";
import { uploadFile } from "../../api/upload";
import { waitJob } from "../../api/useJob";
import type { Project } from "../store";
import type { FamilyDossier } from "../workflow";
import { applyServer, patchLocal, refreshProject } from "./projects";
import { report } from "./report";
import type { Set } from "./state";

type DossierInput = Pick<FamilyDossier, "deceasedName" | "declaredRole" | "fileName" | "fileSize" | "fileType" | "fileHash"> & { file?: File };

export async function uploadDossier(set: Set, pid: string, key: string, d: DossierInput): Promise<void> {
  try {
    if (!d.file) throw new Error("Document manquant : choisissez le fichier signé.");
    patchLocal(set, pid, (p) => ({
      characters: { ...p.characters, [key]: { ...p.characters[key], dossier: { ...(p.characters[key].dossier ?? { status: "manquant", deceasedName: "", declaredRole: "" }), status: "recu", deceasedName: d.deceasedName, declaredRole: d.declaredRole, fileName: d.fileName, fileSize: d.fileSize, fileType: d.fileType, fileHash: d.fileHash, check: undefined } } },
    }));
    const sent = await uploadFile("dossier", d.file, { projectId: pid, characterKey: key, sha256: d.fileHash });
    const res = await api.post<{ jobId: string; project: Project }>(`/projects/${pid}/characters/${key}/dossier`, {
      path: sent.path,
      deceasedName: d.deceasedName,
      declaredRole: d.declaredRole,
      fileName: d.fileName,
      fileSize: d.fileSize,
      fileType: d.fileType,
      fileHash: d.fileHash,
    });
    applyServer(set, res.project);
    patchLocal(set, pid, (p) => ({ characters: { ...p.characters, [key]: { ...p.characters[key], dossier: { ...p.characters[key].dossier!, status: "analyse" } } } }));
    const job = await waitJob(res.jobId);
    if (job.status === "error") throw new Error(job.error ?? "Le contrôle du dossier a échoué.");
  } catch (err) {
    report(err);
  } finally {
    await refreshProject(set, pid);
  }
}

async function send(set: Set, pid: string, call: () => Promise<Project>): Promise<void> {
  try {
    applyServer(set, await call());
  } catch (err) {
    report(err);
    await refreshProject(set, pid);
  }
}

export const validateDossier = (set: Set, pid: string, key: string) => send(set, pid, () => api.post<Project>(`/projects/${pid}/characters/${key}/dossier/validate`));
export const requestComplementary = (set: Set, pid: string, key: string) => send(set, pid, () => api.post<Project>(`/projects/${pid}/characters/${key}/dossier/complementary`));
export const resetDossier = (set: Set, pid: string, key: string) => send(set, pid, () => api.del<Project>(`/projects/${pid}/characters/${key}/dossier`));
