import { describe, expect, it } from "vitest";
import { POST } from "../../server/routes/tts.js";
import { appendEntry, verifyChain } from "./audit.js";
import { SEED_LICENSES, SEED_SEGMENTS } from "./catalog.js";
import { signLicense, verifyLicense } from "./crypto.js";
import { split } from "./credits.js";
import { checkFidelity } from "./fidelity.js";
import { runGate } from "./gate.js";
import { assemblePassport, decodePassport, encodePassport, signPassport, verifyPassport } from "./passport.js";
import { authorize } from "./rules.js";
import { checkText } from "./safety.js";
import type { GenerationRequest } from "./types.js";

const NOW = new Date("2026-11-18T10:00:00Z");
const LICENSES = SEED_LICENSES.map(signLicense);
const req = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
  request_id: "r1",
  voice_id: "v_lina",
  project_id: "le_dernier_car_extrait",
  use: "doublage_film",
  language: "fr",
  requested_by: "test",
  text_hash: "x",
  timestamp: NOW.toISOString(),
  human_validated: true,
  ...over,
});
const code = (over: Partial<GenerationRequest>, lics = LICENSES) =>
  authorize(req(over), lics, NOW, { signatureValid: verifyLicense }).reason_code;

describe("moteur de règles (port de sawti/rules.py)", () => {
  it("autorise une voix consentie, licence valide", () => expect(code({})).toBe("OK"));
  it("refuse une voix sans passeport", () => expect(code({ voice_id: "voix_inconnue" })).toBe("VOIX_NON_ENREGISTREE"));
  it("refuse une licence révoquée", () => expect(code({ voice_id: "v_hedi" })).toBe("LICENCE_REVOQUEE"));
  it("refuse une licence pas encore valide", () => expect(code({ voice_id: "v_maya", use: "doublage_video_en_ligne" })).toBe("LICENCE_PAS_ENCORE_VALIDE"));
  it("refuse une licence expirée", () => {
    const later = new Date("2027-12-01T00:00:00Z");
    expect(authorize(req(), LICENSES, later, { signatureValid: verifyLicense }).reason_code).toBe("LICENCE_EXPIREE");
  });
  it("refuse un usage interdit", () => expect(code({ use: "publicite" })).toBe("USAGE_INTERDIT"));
  it("refuse un usage hors licence", () => expect(code({ voice_id: "v_sami", use: "doublage_video_en_ligne" })).toBe("USAGE_NON_AUTORISE"));
  it("refuse une langue hors licence", () => expect(code({ language: "en" })).toBe("LANGUE_NON_AUTORISEE"));
  it("refuse un projet hors licence", () => {
    const lics = LICENSES.map((l) => (l.voice_id === "v_lina" ? signLicense({ ...l, projects: ["autre_film"] }) : l));
    expect(code({}, lics)).toBe("PROJET_NON_AUTORISE");
  });
  it("refuse une licence modifiée en base (usages élargis)", () => {
    const lics = LICENSES.map((l) => (l.voice_id === "v_lina" ? { ...l, allowed_uses: [...l.allowed_uses, "publicite" as const] } : l));
    expect(code({}, lics)).toBe("SIGNATURE_INVALIDE");
  });
  it("bloque une personnalité publique", () => expect(code({ voice_id: "voice_chef_etat" })).toBe("PERSONNALITE_BLOQUEE"));
  it("exige une validation humaine", () => expect(code({ human_validated: false })).toBe("VALIDATION_HUMAINE_MANQUANTE"));
  it("bascule de révocation : autorisé puis refusé", () => {
    expect(code({})).toBe("OK");
    const revoked = LICENSES.map((l) => (l.voice_id === "v_lina" ? { ...l, status: "revoked" as const } : l));
    expect(code({}, revoked)).toBe("LICENCE_REVOQUEE");
  });
});

describe("filtre de sécurité", () => {
  it("laisse passer une réplique ordinaire", () => expect(checkText("Je t’attends devant la maison.").ok).toBe(true));
  it("refuse toujours la haine, quel que soit le titulaire", () => {
    const r = checkText("Sale noir, rentre chez toi.");
    expect(r.ok === false && r.layer === "red_line" && r.category === "haine").toBe(true);
  });
  it("refuse l’usurpation d’une autorité", () => {
    const r = checkText("Bonjour, je suis le président de la République.");
    expect(r.ok === false && r.category === "usurpation").toBe(true);
  });
  it("refuse les demandes de codes", () => expect(checkText("Envoie-moi ton code de vérification").ok).toBe(false));
  it("applique les thèmes choisis par le titulaire", () => {
    expect(checkText("Votez pour notre parti aux élections !", []).ok).toBe(true);
    const r = checkText("Votez pour notre parti aux élections !", ["politique"]);
    expect(r.ok === false && r.layer === "owner_theme" && r.category === "politique").toBe(true);
  });
  it("comprend l’arabe tunisien", () => expect(checkText("انا الرئيس").ok).toBe(false));
  it("ne confond pas « con » avec « contenu »", () => expect(checkText("Ce contenu est conforme.", ["grossierete"]).ok).toBe(true));
});

describe("vérificateur de fidélité", () => {
  const alerts = Object.fromEntries(SEED_SEGMENTS.map((s) => [s.id, checkFidelity(s.source, s.translation).map((a) => a.type)]));
  it("détecte 300 dinars devenus 30", () => expect(alerts.s3).toEqual(["CHIFFRES"]));
  it("détecte la négation perdue", () => expect(alerts.s5).toEqual(["NEGATIONS"]));
  it("ne signale rien sur les répliques justes", () => {
    for (const id of ["s1", "s2", "s4", "s6"]) expect(alerts[id]).toEqual([]);
  });
  it("un nombre dit en mots dans la derja (« آيفون دي سيت ») n’est pas un chiffre modifié", () =>
    expect(checkFidelity("حبيبي يجيبلي آيفون دي سيت", "mon chéri m’offre l’iPhone 17")).toEqual([]));
  it("les chiffres arabes comptent : ٣٠٠ devenus 30 est signalé, ٣٠٠ devenus 300 non", () => {
    expect(checkFidelity("خلّصت فيه ٣٠٠ دينار", "J’ai payé 30 dinars").map((a) => a.type)).toEqual(["CHIFFRES"]);
    expect(checkFidelity("خلّصت فيه ٣٠٠ دينار", "J’ai payé 300 dinars")).toEqual([]);
  });
});

describe("porte de consentement complète", () => {
  const base = { voice_id: "v_lina", text: "Je t’attends devant la maison.", use: "doublage_film" as const, language: "fr" as const, project_id: "le_dernier_car_extrait", requested_by: "t", human_validated: true };
  it("autorise", () => expect(runGate(base, LICENSES, NOW).decision.reason_code).toBe("OK"));
  it("refuse un thème interdit par la titulaire", () =>
    expect(runGate({ ...base, text: "Priez Dieu chaque matin." }, LICENSES, NOW).decision.reason_code).toBe("THEME_INTERDIT_PAR_TITULAIRE"));
  it("les licences refusent avant le filtre", () =>
    expect(runGate({ ...base, voice_id: "v_hedi", text: "Sale noir" }, LICENSES, NOW).decision.reason_code).toBe("LICENCE_REVOQUEE"));
});

describe("journal d’audit", () => {
  it("détecte une entrée modifiée", () => {
    let j = appendEntry([], "a", "X", { n: 1 });
    j = appendEntry(j, "a", "Y", { n: 2 });
    j = appendEntry(j, "a", "Z", { n: 3 });
    expect(verifyChain(j).ok).toBe(true);
    const tampered = j.map((e) => (e.index === 1 ? { ...e, decision: "OK" } : e));
    expect(verifyChain(tampered)).toEqual({ ok: false, brokenAt: 1 });
  });
});

describe("Passeport 360°", () => {
  const journal = appendEntry([], "test", "GENERATION_AUTORISEE", { a: 1 }, "OK");
  const passport = signPassport(
    assemblePassport(
      {
        title: "Test",
        validator: "V",
        referent: "R",
        segments: [{ translation: "Bonjour", validated: true, speaker: "amel" }],
        speakers: [{ personnage: "Amel", voice_id: "v_lina", voiceName: "Lina M.", kind: "consentie" }],
        licenses: LICENSES,
        journal,
        generated: 1,
        charactersSynthesized: 7,
      },
      NOW,
    ),
  );
  it("est valide tel que signé", () => expect(verifyPassport(passport, journal).valid).toBe(true));
  it("devient invalide si un champ change", () => {
    const edited = { ...passport, identite: { ...passport.identite, titre: "Autre film" } };
    expect(verifyPassport(edited).checks.find((c) => c.id === "signature")?.state).toBe("fail");
  });
  it("survit au lien du QR", () => expect(verifyPassport(decodePassport(encodePassport(passport))).valid).toBe(true));
});

describe("jetons", () => {
  it("70 % au titulaire, le reste à la plateforme", () => {
    expect(split(1000, 0.7)).toEqual({ owner: 700, platform: 300 });
    expect(split(33, 0.7)).toEqual({ owner: 23, platform: 10 });
  });
});

describe("fonction serveur api/tts", () => {
  const call = (body: unknown) => POST(new Request("http://x/api/tts", { method: "POST", body: JSON.stringify(body) }));
  const ok = { voice_id: "v_lina", text: "Je t’attends devant la maison.", use: "doublage_film", language: "fr", human_validated: true };
  it("refuse sans validation humaine, même appelée directement", async () => {
    const r = await call({ ...ok, human_validated: false });
    expect(r.status).toBe(403);
    expect((await r.json()).decision.reason_code).toBe("VALIDATION_HUMAINE_MANQUANTE");
  });
  it("refuse une voix révoquée côté navigateur", async () => {
    const r = await call({ ...ok, revoked: ["VL-2026-0001"] });
    expect((await r.json()).decision.reason_code).toBe("LICENCE_REVOQUEE");
  });
  it("refuse la haine côté serveur", async () => {
    const r = await call({ ...ok, voice_id: "v_neutre", text: "Sale noir" });
    expect((await r.json()).decision.reason_code).toBe("CONTENU_INTERDIT");
  });
  it("sans clé : autorisé mais synthèse non configurée", async () => {
    const r = await call(ok);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("SYNTHESE_NON_CONFIGUREE");
  });
});
