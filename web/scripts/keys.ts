/**
 * npm run keys → a new platform key pair (Ed25519) for Sawti 360, printed here and written nowhere.
 *
 *   SAWTI_SIGNING_SEED     secret: Vercel (server variables only) and web/.env.local. Never in the repository.
 *   VITE_SAWTI_PUBLIC_KEY  public: same value in Vercel and web/.env.local; every browser verifies with it.
 *
 * After changing the key, run `npm run seed` again: the example licences and passport are re-signed.
 * Passports signed with an older key stay readable but show « autre clé » on /verifier.
 */
import { randomBytes } from "node:crypto";
import { publicKeyHex } from "../server/sign";

const seed = randomBytes(32).toString("hex");

console.log(`# Sawti 360 · clé de signature de la plateforme (générée le ${new Date().toISOString().slice(0, 10)})
# Secrète : variables serveur de Vercel et web/.env.local uniquement, jamais dans le dépôt.
SAWTI_SIGNING_SEED=${seed}
# Publique : même valeur dans Vercel et web/.env.local.
VITE_SAWTI_PUBLIC_KEY=${publicKeyHex(seed)}`);
