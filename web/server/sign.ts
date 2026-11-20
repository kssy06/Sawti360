/**
 * Platform signing key (Ed25519). The secret seed lives in SAWTI_SIGNING_SEED (server only);
 * the browser receives the public key (VITE_SAWTI_PUBLIC_KEY, and GET /api/health).
 * Without a seed, the public demo key of src/core/crypto.ts is used (simulated mode only).
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { licensePayload, PLATFORM_PUBLIC_KEY, signText } from "../src/core/crypto.js";
import type { VoiceLicense } from "../src/core/types.js";
import { env } from "./env.js";

ed.hashes.sha512 = sha512;

/** Public key (hex) matching the seed the server signs with. */
export function publicKeyHex(seed: string | undefined = env().SAWTI_SIGNING_SEED): string {
  return seed ? bytesToHex(ed.getPublicKey(hexToBytes(seed))) : PLATFORM_PUBLIC_KEY;
}

/** Signs with the server's secret seed; without one, with the public demo key (simulated mode only, A8). */
export function signTextServer(message: string, seed: string | undefined = env().SAWTI_SIGNING_SEED): string {
  return seed ? bytesToHex(ed.sign(utf8ToBytes(message), hexToBytes(seed))) : signText(message);
}

/** A licence signed by the platform (status and revoked_at stay outside the signature, as in crypto.ts). */
export function signLicenseServer(lic: VoiceLicense): VoiceLicense {
  return { ...lic, signature: signTextServer(licensePayload(lic)) };
}
