/**
 * Follows a long task (GET /api/jobs/:id every 1.5 s) until it is done or failed.
 * waitJob() for store actions, useJob() for screens.
 */
import { useEffect, useState } from "react";
import { api, ApiCallError } from "./client";
import type { Job } from "./types";

export const POLL_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface WaitOptions {
  /** Task started from a public link (no account): GET /api/public/jobs/:id. */
  anonymous?: boolean;
  interval?: number;
  /** Gives up after this long (the server marks a silent task as failed after 300 s anyway). */
  timeoutMs?: number;
  signal?: { cancelled: boolean };
}

export async function waitJob(id: string, onUpdate?: (job: Job) => void, opts: WaitOptions = {}): Promise<Job> {
  const path = opts.anonymous ? `/public/jobs/${id}` : `/jobs/${id}`;
  const started = Date.now();
  let misses = 0;
  for (;;) {
    if (opts.signal?.cancelled) throw new Error("Suivi de la tâche interrompu.");
    try {
      const job = await api.get<Job>(path, { anonymous: opts.anonymous });
      misses = 0;
      onUpdate?.(job);
      if (job.status === "done" || job.status === "error") return job;
    } catch (err) {
      // A short network cut is tolerated; an answer from the server (404, 403…) is not.
      if (err instanceof ApiCallError && err.status !== 0) throw err;
      if (++misses > 5) throw err;
    }
    if (Date.now() - started > (opts.timeoutMs ?? 330_000)) throw new Error("La tâche ne répond plus : relancez-la.");
    await sleep(opts.interval ?? POLL_MS);
  }
}

/** The task's latest state for a screen (null while unknown). */
export function useJob(id: string | null | undefined, opts: Omit<WaitOptions, "signal"> = {}): Job | null {
  const [job, setJob] = useState<Job | null>(null);
  const { anonymous, interval, timeoutMs } = opts;
  useEffect(() => {
    if (!id) return;
    const signal = { cancelled: false };
    void waitJob(id, (j) => !signal.cancelled && setJob(j), { anonymous, interval, timeoutMs, signal }).catch((err) => {
      if (!signal.cancelled) setJob({ id, kind: "analysis", status: "error", step: 0, error: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      signal.cancelled = true;
    };
  }, [id, anonymous, interval, timeoutMs]);
  return job;
}
