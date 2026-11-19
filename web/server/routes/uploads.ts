/**
 * POST /api/uploads → UploadTicket (signed upload URL) after checking type, size and ownership.
 * POST /api/public/uploads → the same for a person invited by a consent link (sample only).
 */
import { Hono } from "hono";
import { z } from "zod";
import { sha256Hex } from "../../src/core/canonical.js";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { badRequest, conflict, notFound, readBody } from "../errors.js";
import { ownedProject } from "../projects.js";
import { files, planUpload, RULES, type UploadKind } from "../storage.js";

const Kind = z.enum(["audio", "frame", "original", "dossier", "sample"]);

const UploadBody = z.object({
  kind: Kind,
  bucket: z.enum(["media", "dossiers", "samples"]).optional(),
  projectId: z.string().max(80).optional(),
  characterKey: z.string().max(80).optional(),
  contentType: z.string().min(1).max(120),
  size: z.number().int().min(0),
  name: z.string().max(300).optional(),
  t: z.number().int().min(0).optional(),
  sha256: z.string().max(64).optional(),
});

const PublicBody = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  contentType: z.string().min(1).max(120),
  size: z.number().int().min(0),
});

export const uploads = new Hono<AppEnv>()
  .post("/uploads", async (c) => {
    const body = await readBody(c, UploadBody);
    const kind: UploadKind = body.kind;
    if (body.bucket && body.bucket !== RULES[kind].bucket) throw badRequest(`Un fichier « ${kind} » va dans le bucket « ${RULES[kind].bucket} ».`);
    const user = c.get("user");
    const plan = planUpload({ ...body, kind, accountId: user.id });
    if (kind !== "sample") {
      const project = await ownedProject(db(), user, body.projectId ?? "");
      if (kind === "dossier" && !project.characters[body.characterKey ?? ""]) throw notFound("Personnage introuvable dans ce projet.");
    }
    const ticket = await files().signUpload(plan.bucket, plan.path);
    return c.json({ bucket: plan.bucket, path: plan.path, contentType: plan.contentType, ...ticket });
  })

  .post("/public/uploads", async (c) => {
    const body = await readBody(c, PublicBody);
    const [consent] = await db()<{ id: string; status: string; superseded: boolean }[]>`
      select id, status, superseded from public.consents where token_hash = ${sha256Hex(body.token)}`;
    if (!consent || consent.superseded) throw notFound("Lien de consentement inconnu ou remplacé par un lien plus récent.");
    if (consent.status !== "en_attente") throw conflict("DEJA_DECIDE", "Ce lien a déjà reçu une réponse.");
    const plan = planUpload({ kind: "sample", accountId: "public", consentId: consent.id, contentType: body.contentType, size: body.size });
    const ticket = await files().signUpload(plan.bucket, plan.path);
    return c.json({ bucket: plan.bucket, path: plan.path, contentType: plan.contentType, ...ticket });
  });
