/**
 * Shapes of the /api answers (mirror of docs/backend/API.md § 2).
 * Routes return the front's own types (Project, LicenseRequest, Notice…) so the store keeps them as they are.
 */
import type { PlanId } from "../core/credits";
import type { Passport360 } from "../core/passport";
import type { VoiceLicense } from "../core/types";
import type { VoiceProfile } from "../mock/registry";
import type { Notice, OwnedVoice, Project, UsageRow } from "../state/store";
import type { LicenseRequest } from "../state/workflow";

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

export interface Bootstrap {
  account: Omit<Me, "balance">;
  balance: number;
  projects: Record<string, Project>;
  order: string[];
  requests: LicenseRequest[];
  notifications: Notice[];
  usage: UsageRow[];
  licenses: VoiceLicense[];
  ownedVoices: Record<string, OwnedVoice>;
  profiles: VoiceProfile[];
  passports: Record<string, Passport360>;
  journalHead: { count: number; head: string };
}
