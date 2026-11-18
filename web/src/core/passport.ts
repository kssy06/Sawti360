import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { headHash, verifyChain } from "./audit";
import { canonicalJson, nowIso, sha256Hex } from "./canonical";
import { PLATFORM_PUBLIC_KEY, signText, verifyText } from "./crypto";
import type { AuditEntry, VoiceLicense } from "./types";

/** Passeport 360°: the signed dossier that travels with every export.
 * Field names follow sawti/passport.py (schema sawti-passeport-360/0.1). */
export interface Passport360 {
  schema: "sawti-passeport-360/0.1";
  donnees_de_demonstration: true;
  identite: { titre: string; version: string; date: string; empreinte_texte_valide: string };
  voix: {
    personnage: string;
    nature: string;
    titulaire: string;
    licence: { license_id: string; usages: string[]; statut: string; valide_jusqu_au: string; entrainement_interdit: boolean } | null;
  }[];
  langues: { source: string; cible: string; qualite: string };
  transparence: { label: string; generique: string[]; repliques_generees: number };
  responsabilite: {
    validateur: string;
    referent_ethique: string;
    journal_empreinte_de_tete: string;
    nombre_entrees: number;
    nombre_refus: number;
  };
  securite: { traitement: string; modele_voix: string };
  durabilite: { caracteres_synthetises: number; energie: string };
  signature?: { algorithme: "Ed25519"; cle_publique: string; valeur: string };
}

export interface PassportInput {
  title: string;
  validator: string;
  referent: string;
  segments: { translation: string; validated: boolean; speaker: string }[];
  speakers: { personnage: string; voice_id: string; voiceName: string; kind: string }[];
  licenses: VoiceLicense[];
  journal: AuditEntry[];
  generated: number;
  charactersSynthesized: number;
}

export function assemblePassport(input: PassportInput, at: Date = new Date()): Passport360 {
  const validatedText = input.segments.filter((s) => s.validated).map((s) => s.translation).join("\n");
  return {
    schema: "sawti-passeport-360/0.1",
    donnees_de_demonstration: true,
    identite: {
      titre: input.title,
      version: "VF-demo-0.1",
      date: nowIso(at),
      empreinte_texte_valide: sha256Hex(validatedText),
    },
    voix: input.speakers.map((sp) => {
      const lic = input.licenses.find((l) => l.voice_id === sp.voice_id);
      return {
        personnage: sp.personnage,
        nature: sp.kind === "neutre" ? "Voix générée par IA · neutre" : "Voix générée par IA · consentie",
        titulaire: sp.kind === "neutre" ? "aucun (voix de synthèse)" : sp.voiceName,
        licence: lic
          ? {
              license_id: lic.license_id,
              usages: lic.allowed_uses,
              statut: lic.status,
              valide_jusqu_au: lic.valid_until,
              entrainement_interdit: lic.no_training,
            }
          : null,
      };
    }),
    langues: { source: "ar-TN (derja)", cible: "fr", qualite: "[à mesurer] : WER publié quand Sawti-Bench sera complet" },
    transparence: {
      label: `Doublé avec IA · voix consenties · validé par ${input.validator}`,
      generique: input.speakers.map((sp) => `${sp.personnage} : ${sp.voiceName} (${sp.kind === "neutre" ? "voix neutre" : "voix consentie, licence vérifiée"})`),
      repliques_generees: input.generated,
    },
    responsabilite: {
      validateur: input.validator,
      referent_ethique: input.referent,
      journal_empreinte_de_tete: headHash(input.journal),
      nombre_entrees: input.journal.length,
      nombre_refus: input.journal.filter((e) => e.action === "GENERATION_REFUSEE").length,
    },
    securite: { traitement: "Texte uniquement envoyé au moteur de voix ; aucun film transmis", modele_voix: "ElevenLabs eleven_multilingual_v2" },
    durabilite: {
      caracteres_synthetises: input.charactersSynthesized,
      energie: "[à mesurer] : le fournisseur ne publie pas la consommation par requête",
    },
  };
}

function unsigned(p: Passport360): Omit<Passport360, "signature"> {
  const { signature: _s, ...rest } = p;
  return rest;
}

export function signPassport(p: Passport360): Passport360 {
  return {
    ...p,
    signature: { algorithme: "Ed25519", cle_publique: PLATFORM_PUBLIC_KEY, valeur: signText(canonicalJson(unsigned(p))) },
  };
}

export type CheckState = "ok" | "fail" | "skip";
export interface PassportCheck {
  id: "signature" | "cle" | "journal";
  label: string;
  state: CheckState;
  detail: string;
}

export function verifyPassport(p: Passport360, journal?: AuditEntry[]): { valid: boolean; checks: PassportCheck[] } {
  const sig = p.signature;
  const sigOk = Boolean(sig) && verifyText(canonicalJson(unsigned(p)), sig!.valeur, sig!.cle_publique);
  const keyOk = sig?.cle_publique === PLATFORM_PUBLIC_KEY;
  const checks: PassportCheck[] = [
    {
      id: "signature",
      label: "Signature Ed25519",
      state: sigOk ? "ok" : "fail",
      detail: sigOk ? "Aucun champ n’a été modifié depuis la signature." : "Le dossier a été modifié après signature, ou la signature manque.",
    },
    {
      id: "cle",
      label: "Clé de la plateforme",
      state: keyOk ? "ok" : "fail",
      detail: keyOk ? "Signé avec la clé publiée par Sawti 360." : "Signé avec une autre clé que celle publiée par Sawti 360.",
    },
  ];
  if (journal) {
    const chain = verifyChain(journal);
    const headOk = headHash(journal) === p.responsabilite.journal_empreinte_de_tete;
    checks.push({
      id: "journal",
      label: "Journal d’audit",
      state: chain.ok && headOk ? "ok" : "fail",
      detail: !chain.ok
        ? `Chaîne rompue à l’entrée ${chain.brokenAt}.`
        : headOk
          ? `${journal.length} entrées, chaîne intacte, empreinte de tête identique.`
          : "Le journal fourni ne correspond pas à celui du passeport.",
    });
  } else {
    checks.push({ id: "journal", label: "Journal d’audit", state: "skip", detail: "Joignez le fichier complet pour vérifier aussi la chaîne du journal." });
  }
  return { valid: checks.every((c) => c.state !== "fail"), checks };
}

/** Compact link payload for the QR code: deflate + base64url, carried in the URL fragment
 * so it is never sent to any server. */
export function encodePassport(p: Passport360): string {
  const bytes = deflateSync(strToU8(JSON.stringify(p)), { level: 9 });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePassport(code: string): Passport360 {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(strFromU8(inflateSync(bytes))) as Passport360;
}

export interface PassportFile {
  passeport: Passport360;
  journal: AuditEntry[];
}
