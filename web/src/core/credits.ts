/**
 * Credits, modelled on ElevenLabs: a monthly allowance of jetons per plan and
 * 1 jeton per character synthesized. The voice owner receives 70 % of the jetons
 * spent on their voice; Sawti keeps 30 %. Payments are simulated in this prototype.
 */

export type PlanId = "gratuit" | "createur" | "studio";

export const PLANS: Record<PlanId, { name: string; monthly: number; blurb: string }> = {
  gratuit: { name: "Gratuit", monthly: 10_000, blurb: "Pour découvrir le parcours sur un extrait." },
  createur: { name: "Créateur", monthly: 100_000, blurb: "Courts-métrages, vidéos YouTube, podcasts." },
  studio: { name: "Studio", monthly: 500_000, blurb: "Longs-métrages et séries, plusieurs projets." },
};

export const JETONS_PER_CHAR = 1;
export const OWNER_SHARE = 0.7;

export function costOf(text: string): number {
  return Math.max(1, [...text.trim()].length) * JETONS_PER_CHAR;
}

/** Owner share is rounded down; the remainder goes to the platform so totals always add up. */
export function split(cost: number, ownerShare: number): { owner: number; platform: number } {
  const owner = Math.floor(cost * ownerShare);
  return { owner, platform: cost - owner };
}

export const fmt = new Intl.NumberFormat("fr-FR");
