/** Port of sawti/fidelity.py: numbers and negations checked on both sides.
 * An empty list means nothing was detected, not that the translation is faithful. */

export type FidelityAlert = { type: "CHIFFRES" | "NEGATIONS"; message: string; source: string[]; target: string[] };

const NUM = /\d+(?:[.,]\d+)?/g;
const NEG_FR = /(^|[^\p{L}])(?:(ne|pas|jamais|aucun|aucune|rien|sans)(?=$|[^\p{L}])|n['’])/iu;
const NEG_SRC = /(^|[^\p{L}])(ma|mouch|mich|ne|pas|jamais)(?=$|[^\p{L}])|(^|\s)(ما|مش|موش|لا)(?=\s|$|[،.!?])|[؀-ۿ]+ش(\s|$|[،.!?])/iu;

/** Arabic-Indic digits (٣٠٠, ۳۰۰) read as 300. */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

function nums(s: string): string[] {
  return (latinDigits(s).match(NUM) ?? []).sort();
}

export function checkFidelity(source: string, translation: string): FidelityAlert[] {
  const alerts: FidelityAlert[] = [];
  const ns = nums(source);
  const nt = nums(translation);
  // No digit in the derja but one in the French: the number was said in words (« دي سيت » = 17), not changed.
  if (ns.length && ns.join("|") !== nt.join("|")) {
    alerts.push({
      type: "CHIFFRES",
      message: `Chiffres différents : ${ns.join(", ") || "aucun"} dans la source, ${nt.join(", ") || "aucun"} dans la traduction.`,
      source: ns,
      target: nt,
    });
  }
  if (NEG_SRC.test(source) !== NEG_FR.test(translation)) {
    alerts.push({
      type: "NEGATIONS",
      message: "Négation présente d’un seul côté : le sens est peut-être inversé.",
      source: [],
      target: [],
    });
  }
  return alerts;
}
