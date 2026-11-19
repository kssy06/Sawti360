/** GET /api/jobs/:id (my tasks) and GET /api/public/jobs/:id (tasks started from a public link). */
import { Hono } from "hono";
import type { AppEnv } from "../auth.js";
import { db } from "../db.js";
import { ownedJob, publicJob } from "../jobs.js";

export const jobs = new Hono<AppEnv>()
  .get("/jobs/:id", async (c) => c.json(await ownedJob(db(), c.get("user").id, c.req.param("id"))))
  .get("/public/jobs/:id", async (c) => c.json(await publicJob(db(), c.req.param("id"))));
