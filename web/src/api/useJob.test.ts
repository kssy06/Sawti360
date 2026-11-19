import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "./types";
import { waitJob } from "./useJob";

const reply = (job: Partial<Job>, status = 200) => new Response(JSON.stringify({ id: "j", kind: "analysis", step: 0, status: "running", ...job }), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("A6 · suivi d'une tâche dans le navigateur", () => {
  it("interroge jusqu'à « done » et passe chaque état à l'écran", async () => {
    const states: Partial<Job>[] = [{ status: "queued" }, { step: 1 }, { step: 3, detail: "Traduction…" }, { status: "done", step: 4, result: { ok: 1 } }];
    const fetch = vi.fn(async () => reply(states.shift()!));
    vi.stubGlobal("fetch", fetch);
    const seen: string[] = [];
    const job = await waitJob("j", (j) => seen.push(`${j.status}:${j.step}`), { anonymous: true, interval: 1 });
    expect(job).toMatchObject({ status: "done", result: { ok: 1 } });
    expect(seen).toEqual(["queued:0", "running:1", "running:3", "done:4"]);
    expect(fetch).toHaveBeenCalledWith("/api/public/jobs/j", expect.objectContaining({ method: "GET" }));
  });

  it("une coupure réseau brève est tolérée ; une réponse 404 du serveur ne l'est pas", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n < 3 ? Promise.reject(new TypeError("réseau")) : reply({ status: "error", error: "boom" }))));
    expect(await waitJob("j", undefined, { anonymous: true, interval: 1 })).toMatchObject({ status: "error", error: "boom" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "INTROUVABLE", message: "Tâche introuvable." }), { status: 404, headers: { "content-type": "application/json" } })));
    await expect(waitJob("j", undefined, { anonymous: true, interval: 1 })).rejects.toThrow("Tâche introuvable.");
  });
});
