/**
 * Back-end versions of the licence journey (Écrans 07–08) and of payments (no real money):
 * request (e-mail and notification to the owner), the owner's answer (connected, by request id;
 * or by the link's token, without account), demo expiry, payment confirmed at once, plan change.
 */
import { useCallback, useEffect, useState } from "react";
import { api, messageOf } from "../../api/client";
import { PLANS, type PlanId } from "../../core/credits";
import type { Project } from "../store";
import type { LicenseRequest } from "../workflow";
import { applyServer } from "./projects";
import { report } from "./report";
import type { Get, Set } from "./state";

/* ------------------------------------------------------------------ demo links (fictional owners) */

const LINKS = "sawti360-licence-links";

function readLinks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LINKS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** The licence link of a request to a fictional profile (given once by the server, kept in this browser). */
export function licenceLinkFor(requestId: string): string | null {
  return readLinks()[requestId] ?? null;
}

function rememberLink(requestId: string, url: string): void {
  try {
    localStorage.setItem(LINKS, JSON.stringify({ ...readLinks(), [requestId]: url }));
  } catch {
    /* private mode: the link is lost at reload, the request itself is not */
  }
}

/* ------------------------------------------------------------------ store actions */

function putRequest(set: Set, r: LicenseRequest): void {
  set((s) => ({ requests: s.requests.some((x) => x.id === r.id) ? s.requests.map((x) => (x.id === r.id ? { ...r, token: x.token || r.token } : x)) : [...s.requests, r] }));
}

export async function requestLicense(set: Set, pid: string, key: string, voiceId: string, message: string): Promise<LicenseRequest> {
  const res = await api.post<{ request: LicenseRequest; project: Project; licenceUrl?: string; mail: boolean }>("/license-requests", { projectId: pid, characterKey: key, voiceId, message });
  const request = res.licenceUrl ? { ...res.request, token: res.licenceUrl.split("/licence/")[1] ?? "" } : res.request;
  if (res.licenceUrl) rememberLink(request.id, res.licenceUrl);
  putRequest(set, request);
  applyServer(set, res.project);
  return request;
}

/** The owner's answer: by request id when connected, by the link's token (64 hex) on the public page. */
export async function respondLicense(set: Set, tokenOrId: string, accept: boolean): Promise<LicenseRequest> {
  const byToken = /^[0-9a-f]{64}$/.test(tokenOrId);
  const r = byToken
    ? await api.post<LicenseRequest>(`/public/licences/${tokenOrId}/decision`, { accept }, { anonymous: true })
    : await api.post<LicenseRequest>(`/license-requests/${tokenOrId}/decision`, { accept });
  putRequest(set, r);
  return r;
}

export async function expireRequest(set: Set, id: string): Promise<void> {
  try {
    putRequest(set, await api.post<LicenseRequest>(`/license-requests/${id}/expire`));
  } catch (err) {
    report(err);
  }
}

export async function payLicense(set: Set, get: Get, id: string, success: boolean): Promise<void> {
  const res = await api.post<{ balance: number; request: LicenseRequest }>("/payments", { kind: "licence", requestId: id, simulateFailure: !success });
  putRequest(set, res.request);
  set({ spent: PLANS[get().plan].monthly - res.balance });
}

export async function setPlan(set: Set, get: Get, plan: PlanId): Promise<void> {
  const before = { plan: get().plan, spent: get().spent };
  const balance = PLANS[before.plan].monthly - before.spent;
  // Shown at once (the jetons of the plan are credited on top of the balance), confirmed by the server.
  set({ plan, spent: PLANS[plan].monthly - (balance + PLANS[plan].monthly) });
  try {
    const res = await api.post<{ balance: number; plan: PlanId }>("/payments", { kind: "jetons", plan });
    set({ plan: res.plan, spent: PLANS[res.plan].monthly - res.balance });
  } catch (err) {
    set(before);
    report(err);
  }
}

/* ------------------------------------------------------------------ public licence page */

export interface PublicLicence {
  request: LicenseRequest | null;
  ownerName: string;
  loading: boolean;
  error: string;
  respond: (token: string, accept: boolean) => Promise<void>;
}

/** GET /api/public/licences/:token for the page opened from the e-mail (no account, any device). */
export function usePublicLicence(token: string, enabled: boolean): PublicLicence {
  const [state, setState] = useState<{ request: LicenseRequest | null; ownerName: string; loading: boolean; error: string }>({ request: null, ownerName: "", loading: enabled, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api
      .get<{ request: LicenseRequest; ownerName: string }>(`/public/licences/${token}`, { anonymous: true })
      .then((r) => alive && setState({ request: r.request, ownerName: r.ownerName, loading: false, error: "" }))
      .catch((err) => alive && setState({ request: null, ownerName: "", loading: false, error: messageOf(err) }));
    return () => {
      alive = false;
    };
  }, [token, enabled]);
  const respond = useCallback(async (t: string, accept: boolean) => {
    const r = await api.post<LicenseRequest>(`/public/licences/${t}/decision`, { accept }, { anonymous: true });
    setState((s) => ({ ...s, request: r }));
  }, []);
  return { ...state, respond };
}
