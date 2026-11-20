/**
 * Back-end versions of the living-person consent (Écran 06 and the public consent page):
 * the secure link is given once by the server (kept in this browser for « Copier le lien »);
 * the person answers from any device; the creator's screen refreshes until the answer arrives.
 */
import { useCallback, useEffect, useState } from "react";
import { api, messageOf } from "../../api/client";
import { uploadPublicSample } from "../../api/upload";
import { waitJob } from "../../api/useJob";
import type { Recording } from "../../ui/Recorder";
import type { Project } from "../store";
import type { LivingStatus } from "../workflow";
import { applyServer, refreshProject } from "./projects";
import type { Get, Set } from "./state";

/* ------------------------------------------------------------------ links given once */

const LINKS = "sawti360-consent-links";
const linkKey = (pid: string, key: string) => `${pid}/${key}`;

function readLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LINKS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function consentLinkFor(pid: string, key: string): string {
  return readLinks()[linkKey(pid, key)] ?? "";
}

/* ------------------------------------------------------------------ creator side */

export interface SentConsent {
  url: string;
  mail: boolean;
}

const lastMail = new Map<string, boolean>();

/** Whether the server could e-mail the last link of this character (this session). */
export const consentMailed = (pid: string, key: string) => lastMail.get(linkKey(pid, key));

export async function sendConsent(set: Set, pid: string, key: string, email: string, registered: boolean): Promise<string> {
  const res = await api.post<{ project: Project; consentUrl: string; mail: boolean }>(`/projects/${pid}/characters/${key}/consent`, { email: email.trim(), registered });
  try {
    localStorage.setItem(LINKS, JSON.stringify({ ...readLinks(), [linkKey(pid, key)]: res.consentUrl }));
  } catch {
    /* private mode: the link is shown now, not after a reload */
  }
  lastMail.set(linkKey(pid, key), res.mail);
  applyServer(set, res.project);
  return res.consentUrl.split("/consentement/")[1] ?? "";
}

/** Refreshes the project every `ms` while `active` (the person may answer on another device). */
export function useRefreshWhile(set: Set, pid: string, active: boolean, ms = 8000): void {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refreshProject(set, pid), ms);
    return () => clearInterval(timer);
  }, [set, pid, active, ms]);
}

/* ------------------------------------------------------------------ public consent page */

export interface PublicConsent {
  projectTitle: string;
  creatorName: string;
  characterName: string;
  characterDescription: string;
  status: LivingStatus;
  registered: boolean;
  paragraph: string;
  voiceCreated: boolean;
  sentAt: string;
  decidedAt: string | null;
}

export function usePublicConsent(token: string, enabled: boolean) {
  const [data, setData] = useState<PublicConsent | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const load = useCallback(async () => {
    try {
      setData(await api.get<PublicConsent>(`/public/consents/${token}`, { anonymous: true }));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  /** The person's own Voice Passport: upload of the reading, then the server's check. */
  const createPassport = useCallback(
    async (rec: Recording) => {
      const blob = await (await fetch(rec.url)).blob();
      const sent = await uploadPublicSample(token, blob);
      const { jobId } = await api.post<{ jobId: string }>(`/public/consents/${token}/voice-passport`, { samplePath: sent.path, duration: rec.duration, peak: rec.peak, rms: rec.rms }, { anonymous: true });
      const job = await waitJob(jobId, undefined, { anonymous: true });
      if (job.status === "error") throw new Error(job.error ?? "Échantillon refusé.");
      await load();
    },
    [token, load],
  );

  const respond = useCallback(
    async (accept: boolean) => {
      await api.post<{ status: LivingStatus }>(`/public/consents/${token}/decision`, { accept }, { anonymous: true });
      await load();
    },
    [token, load],
  );

  return { data, error, loading, createPassport, respond };
}

export type { Get };
