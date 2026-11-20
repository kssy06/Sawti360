/**
 * Platform signing key (Ed25519). The secret seed lives in SAWTI_SIGNING_SEED (server only, made by
 * scripts/keys.ts); the browser receives the public key (VITE_SAWTI_PUBLIC_KEY, and GET /api/health).
 * Without a seed, the public demo key of src/core/crypto.ts is used (development and simulated mode).
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { DEMO_PUBLIC_KEY, licensePayload, signText, trustPlatformKey } from "../src/core/crypto.js";
import { passportPayload, type Passport360 } from "../src/core/passport.js";
import type { VoiceLicense } from "../src/core/types.js";
import { env } from "./env.js";

ed.hashes.sha512 = sha512;

const publicKeys = new Map<string, string>();

/** Public key (hex) matching the seed the server signs with. */
export function publicKeyHex(seed: string | undefined = env().SAWTI_SIGNING_SEED): string {
  if (!seed) return DEMO_PUBLIC_KEY;
  let key = publicKeys.get(seed);
  if (!key) publicKeys.set(seed, (key = bytesToHex(ed.getPublicKey(hexToBytes(seed)))));
  return key;
}

/** The server verifies licences and passports with its own key (read at each check: tests change the env). */
export function trustServerKey(): void {
  trustPlatformKey(() => publicKeyHex());
}

/** Signs with the server's secret seed; without one, with the public demo key. */
export function signTextServer(message: string, seed: string | undefined = env().SAWTI_SIGNING_SEED): string {
  return seed ? bytesToHex(ed.sign(utf8ToBytes(message), hexToBytes(seed))) : signText(message);
}

/** A licence signed by the platform (status and revoked_at stay outside the signature, as in crypto.ts). */
export function signLicenseServer(lic: VoiceLicense): VoiceLicense {
  return { ...lic, signature: signTextServer(licensePayload(lic)) };
}

/** A Passeport 360° signed by the platform: every field but the signature is covered. */
export function signPassportServer(p: Passport360): Passport360 {
  return { ...p, signature: { algorithme: "Ed25519", cle_publique: publicKeyHex(), valeur: signTextServer(passportPayload(p)) } };
}
