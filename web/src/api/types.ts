/**
 * Shapes of the /api answers (mirror of docs/backend/API.md § 2).
 * Routes return the front's own types (Project, LicenseRequest, Notice…) so the store keeps them as they are.
 */
import type { PlanId } from "../core/credits";

export interface Health {
  ok: true;
  backend: true;
  publicKey: string;
  providers: {
    asr: string | null;
    llm1: string | null;
    llm2: string | null;
    dossier: string | null;
    tts: string | null;
    ttsMock: boolean;
    mail: boolean;
  };
  services: { database: boolean; auth: boolean; storage: boolean; signing: boolean };
}

export interface Me {
  id: string;
  name: string;
  email: string;
  org: string;
  initials: string;
  plan: PlanId;
  isDemo: boolean;
  demoKey: string | null;
  balance: number;
}
