import { describe, expect, it } from "vitest";
import { BACKEND } from "../../lib/backend";
import { DEMO_ACCOUNTS } from "../../mock/registry";
import { useStore } from "../store";
import { authMessage } from "./session";
import { accountsWith, emptyData } from "./state";

const me = { id: "7d1c0f3e-0000-4000-8000-000000000001", name: "Nour Films", email: "equipe+nour@gmail.com", org: "Studio · Tunis", initials: "NF", plan: "createur" as const, isDemo: true, balance: 99_000 };

describe("A2 · session côté navigateur", () => {
  it("sans VITE_BACKEND, l'interface reste entièrement simulée", () => {
    expect(BACKEND).toBe(false);
    expect(useStore.getState().server.status).toBe("off");
    expect(Object.keys(useStore.getState().projects).length).toBeGreaterThan(0);
  });

  it("le compte connecté remplace son bouton de démo, les autres boutons restent", () => {
    const list = accountsWith({ ...me, demoKey: "nour" });
    expect(list.map((a) => a.id)).toEqual([me.id, "lina"]);
    expect(list[0]).toMatchObject({ name: "Nour Films", initials: "NF" });
  });

  it("un compte inscrit hors démo s'ajoute à la liste", () => {
    const list = accountsWith({ ...me, id: "x", demoKey: null, isDemo: false });
    expect(list.map((a) => a.id)).toEqual([...DEMO_ACCOUNTS.map((a) => a.id), "x"]);
  });

  it("le mode back-end démarre vide : aucune donnée simulée affichée", () => {
    const d = emptyData();
    expect(d.session).toBeNull();
    expect(d.projects).toEqual({});
    expect(d.journal).toEqual([]);
  });

  it("les erreurs de Supabase Auth sont dites en français", () => {
    expect(authMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("Adresse e-mail ou mot de passe incorrect.");
    expect(authMessage({ message: "User already registered" })).toBe("Un compte existe déjà avec cette adresse.");
    expect(authMessage({ code: "inconnu", message: "boom" })).toContain("boom");
  });
});
