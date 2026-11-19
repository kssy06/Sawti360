/**
 * Platform signing key (Ed25519). The secret seed lives in SAWTI_SIGNING_SEED (server only);
 * the browser receives the public key (VITE_SAWTI_PUBLIC_KEY, and GET /api/health).
 * Without a seed, the public demo key of src/core/crypto.ts is used (simulated mode only).
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { PLATFORM_PUBLIC_KEY } from "../src/core/crypto.js";
import { env } from "./env.js";

ed.hashes.sha512 = sha512;

/** Public key (hex) matching the seed the server signs with. */
export function publicKeyHex(seed: string | undefined = env().SAWTI_SIGNING_SEED): string {
  return seed ? bytesToHex(ed.getPublicKey(hexToBytes(seed))) : PLATFORM_PUBLIC_KEY;
}
