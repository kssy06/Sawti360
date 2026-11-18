import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson, sha256Hex } from "./canonical";
import type { VoiceLicense } from "./types";

ed.hashes.sha512 = sha512;

/**
 * Demo platform key. Derived from a public seed so anyone can reproduce and check it.
 * It proves the mechanism (tampering breaks the signature), not secrecy: in production
 * the private key lives on the server and only the public key is published.
 */
const DEMO_SEED = hexToBytes(sha256Hex("sawti360/demo-platform-key/v1"));
export const PLATFORM_PUBLIC_KEY = bytesToHex(ed.getPublicKey(DEMO_SEED));

export function signText(message: string): string {
  return bytesToHex(ed.sign(utf8ToBytes(message), DEMO_SEED));
}

export function verifyText(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed.verify(hexToBytes(signatureHex), utf8ToBytes(message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** Same coverage as VoiceLicense.signed_payload(): status and revoked_at stay mutable. */
export function licensePayload(lic: VoiceLicense): string {
  const { signature: _s, status: _st, revoked_at: _r, ...rest } = lic;
  return canonicalJson(rest);
}

export function signLicense(lic: VoiceLicense): VoiceLicense {
  return { ...lic, signature: signText(licensePayload(lic)) };
}

export function verifyLicense(lic: VoiceLicense): boolean {
  return Boolean(lic.signature) && verifyText(licensePayload(lic), lic.signature, PLATFORM_PUBLIC_KEY);
}
