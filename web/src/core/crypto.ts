import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson, sha256Hex } from "./canonical.js";
import type { VoiceLicense } from "./types.js";

ed.hashes.sha512 = sha512;

/**
 * Demo platform key. Derived from a public seed so anyone can reproduce and check it.
 * It proves the mechanism (tampering breaks the signature), not secrecy: in production
 * the private key lives on the server and only the public key is published.
 */
const DEMO_SEED = hexToBytes(sha256Hex("sawti360/demo-platform-key/v1"));
export const DEMO_PUBLIC_KEY = bytesToHex(ed.getPublicKey(DEMO_SEED));
/** The demo key (simulated mode signs with it). To verify, use platformPublicKey(). */
export const PLATFORM_PUBLIC_KEY = DEMO_PUBLIC_KEY;

let trusted: () => string = () => DEMO_PUBLIC_KEY;

/**
 * The platform key this runtime verifies with: on the server, the key of SAWTI_SIGNING_SEED;
 * in the browser (back-end mode), VITE_SAWTI_PUBLIC_KEY; in simulated mode, the demo key.
 */
export const platformPublicKey = (): string => trusted();

/** Sets the trusted key: hex, a function read at each check, or null / "" for the demo key. */
export function trustPlatformKey(key: string | (() => string) | null): void {
  if (typeof key === "function") trusted = key;
  else if (key && /^[0-9a-f]{64}$/i.test(key)) {
    const k = key.toLowerCase();
    trusted = () => k;
  } else trusted = () => DEMO_PUBLIC_KEY;
}

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
  return Boolean(lic.signature) && verifyText(licensePayload(lic), lic.signature, platformPublicKey());
}
