/**
 * What this deployment really has connected (GET /api/health, back-end mode): models, voice engine,
 * e-mail, signing key. Read once per page load; null in simulated mode or if the server does not answer.
 */
import { useEffect, useState } from "react";
import { BACKEND } from "../lib/backend";
import { api } from "./client";
import type { Health } from "./types";

let cached: Promise<Health | null> | null = null;

export function loadHealth(): Promise<Health | null> {
  if (!BACKEND) return Promise.resolve(null);
  cached ??= api.get<Health>("/health", { anonymous: true }).catch(() => {
    cached = null;
    return null;
  });
  return cached;
}

export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    void loadHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);
  return health;
}

/**
 * Sawti-Bench results (IA.md § 8.1), published as web/public/sawti-bench.json:
 * { date, n, extraits, fournisseurs: { nom: { wer, cer, mots } } }. Null while nothing is measured.
 */
export interface BenchResults {
  date: string;
  n: number;
  extraits?: string[] | string;
  fournisseurs: Record<string, { wer: number; cer: number; mots?: number }>;
}

export function useBench(): BenchResults | null {
  const [bench, setBench] = useState<BenchResults | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/sawti-bench.json")
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? (r.json() as Promise<BenchResults>) : null))
      .then((b) => alive && b && b.fournisseurs && setBench(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return bench;
}
