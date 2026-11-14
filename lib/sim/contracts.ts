import { hashSeed, type Rng } from "./rng";
import { overall } from "./fighter";
import type { Fighter, GameSave, Offer, Promoter } from "./types";

/** Pounds of purse per unit of drawing power. Tuned in the balancing pass so two purses take roughly half of a show's income. */
export const PURSE_PER_DRAW = 18;
/**
 * Bigger names fill bigger, dearer venues, so each unit of their drawing power earns more and they know it.
 * From about £30 a unit for a small-hall fighter to about £200 for a superstar, which is most of what he brings in.
 */
export const pursePerDraw = (popularity: number) => PURSE_PER_DRAW + 182 * Math.pow(popularity / 100, 2);

/** What a fighter wants per fight as a guaranteed purse. */
export function askPurse(f: Fighter, year: number): number {
  const o = overall(f.ratings);
  const age = year - f.born;
  // A fighter is paid for what he draws, plus a star premium at the very top and a small skill floor.
  const drawUnits = Math.pow(f.popularity, 2.6) * 0.1;
  let v = Math.max(3000, pursePerDraw(f.popularity) * drawUnits + Math.pow(Math.max(0, o - 45), 2) * 1.5);
  if (!f.pro) v = 5000 + f.potential * 4000;
  else if (age < 25) v *= 0.7 + 0.15 * f.potential;
  if (age > 35) v *= 0.8;
  return Math.round(v / 1000) * 1000 || 1000;
}
export const askBonus = (f: Fighter, year: number) => Math.round((askPurse(f, year) * 1.5) / 1000) * 1000;
const ambition = (f: Fighter) => 0.94 + (hashSeed(f.id) % 13) / 100; // 0.94-1.06

/** Per-fight take-home value of an offer to the fighter. */
export const offerValue = (o: Offer) => o.purse * (1 - o.cut) + o.bonus / Math.max(1, o.fights);
const askValue = (f: Fighter, year: number) => askPurse(f, year) * 0.82 + askBonus(f, year) / 3;

export interface OfferContext { reputation: number; worldChampions: number }
export const DEFAULT_OFFER = (f: Fighter, year: number): Offer => ({ bonus: askBonus(f, year), fights: 3, purse: askPurse(f, year), cut: 0.2 });

/** How attractive an offer is: 1.0 = exactly what the fighter wants. */
export function ratio(f: Fighter, o: Offer, year: number, ctx: OfferContext): number {
  const repMult = 0.85 + ctx.reputation / 333;
  const stableMult = 1 + 0.05 * Math.min(2, ctx.worldChampions);
  return (offerValue(o) * repMult * stableMult) / (askValue(f, year) * ambition(f));
}

export type Decision =
  | { kind: "accept"; reason: string }
  | { kind: "counter"; reason: string; offer: Offer }
  | { kind: "refuse"; reason: string };

/** The reputation a promoter needs before this fighter will listen. Journeymen sign with anyone; elite fighters and champions do not. */
export function reputationNeeded(f: Fighter): number {
  const o = overall(f.ratings);
  return Math.min(95, Math.max(0, (o - 72) * 5) + (f.titles.length ? 15 : 0));
}

export function evaluateOffer(f: Fighter, o: Offer, year: number, ctx: OfferContext, renewal = false): Decision {
  const need = reputationNeeded(f);
  if (!renewal && ctx.reputation < need) return { kind: "refuse", reason: `He wants an established promoter. Your reputation is ${Math.round(ctx.reputation)}; he would listen at about ${need}.` };
  const r = ratio(f, o, year, ctx);
  if (r >= 1) return { kind: "accept", reason: r > 1.25 ? "Happy to sign. This is more than he expected." : "Terms are fair. He signs." };
  if (r >= 0.78) {
    const needed = (offerValue(o) * 1.02) / r - o.bonus / Math.max(1, o.fights);
    const purse = Math.round(needed / (1 - o.cut) / 1000) * 1000;
    return { kind: "counter", reason: "Close, but he wants more money per fight.", offer: { ...o, purse: Math.max(purse, o.purse + 1000) } };
  }
  const bigName = overall(f.ratings) >= 80 && ctx.reputation < 40;
  return { kind: "refuse", reason: bigName ? "He wants a bigger promoter with a clearer path to world titles." : "The offer is far below his value." };
}

export function offerCommitment(o: Offer): number { return o.bonus + o.purse * o.fights; }

/** Is this fighter likely to attract rival bids? */
export function isHot(f: Fighter, isTop10: boolean, year: number): boolean {
  const age = year - f.born;
  if (f.amateur?.medal) return true;
  if (f.pro && isTop10) return true;
  return f.record.l === 0 && f.record.w >= 4 && age < 25 && f.potential >= 4;
}

/** Rival offers for a new bidding war. Rivals are real promoters or rich small ones, limited by budget. */
export function rivalOffers(f: Fighter, year: number, promoters: Promoter[], rng: Rng): { promoterId: string; offer: Offer }[] {
  const pool = promoters.filter((p) => p.id !== "independent" && p.budget >= 1_000_000);
  const n = rng.int(1, 3);
  const picks: Promoter[] = [];
  while (picks.length < n && picks.length < pool.length) { const p = rng.pick(pool); if (!picks.includes(p)) picks.push(p); }
  return picks.map((p) => {
    const base = askPurse(f, year) * (0.95 + rng.next() * 0.25);
    const purse = Math.min(Math.round(base / 1000) * 1000, Math.round((p.budget * 0.08) / 3 / 1000) * 1000);
    return { promoterId: p.id, offer: { bonus: Math.round((purse * 1.2) / 1000) * 1000, fights: 3, purse, cut: 0.2 } };
  });
}
const rivalRatio = (f: Fighter, p: Promoter | undefined, o: Offer, year: number) =>
  (offerValue(o) * (p && p.real ? 1.08 : 1.0)) / (askValue(f, year) * ambition(f));

export interface Resolution { winner: "player" | string; reason: string }
export function resolveWar(f: Fighter, offer: Offer, rivals: { promoterId: string; offer: Offer }[], year: number, ctx: OfferContext, promoters: Promoter[], canAfford: boolean): Resolution {
  const mine = canAfford ? ratio(f, offer, year, ctx) : 0;
  let best: { id: string; r: number } | null = null;
  for (const rv of rivals) {
    const r = rivalRatio(f, promoters.find((p) => p.id === rv.promoterId), rv.offer, year);
    if (!best || r > best.r) best = { id: rv.promoterId, r };
  }
  const name = (id: string) => promoters.find((p) => p.id === id)?.name ?? id;
  if (!best || (mine >= 0.78 && mine >= best.r)) return { winner: "player", reason: mine > 1.1 ? "Chose you: the best money on the table." : "Chose you: terms and your plans for him won him over." };
  const moreMoney = best.r > mine * 1.05;
  return { winner: best.id, reason: `Chose ${name(best.id)}: ${moreMoney ? "better money" : "a bigger platform and a clearer route to a title"}.` };
}

export function releaseCost(f: Fighter): number { return f.contract ? f.contract.fightsLeft * f.contract.purse : 0; }
export function contractSalePrice(f: Fighter, year: number): number {
  if (!f.contract) return 0;
  return Math.round((askPurse(f, year) * f.contract.fightsLeft * 0.3) / 1000) * 1000;
}

export function signFighter(g: GameSave, fighterId: string, offer: Offer, year: number): GameSave {
  const f = g.world.fighters[fighterId];
  return {
    ...g,
    company: { ...g.company, cash: g.company.cash - offer.bonus, stable: [...g.company.stable.filter((i) => i !== fighterId), fighterId] },
    world: { ...g.world, fighters: { ...g.world.fighters, [fighterId]: { ...f, pro: true, promoter: "player", contract: { promoter: "player", fightsLeft: offer.fights, purse: offer.purse, cut: offer.cut, expiresYear: year + Math.ceil(offer.fights / 2) } } } },
  };
}
export function ctxFor(g: GameSave): OfferContext {
  const worldChampions = g.company.stable.filter((id) => g.world.fighters[id]?.titles.length).length;
  return { reputation: g.company.reputation, worldChampions };
}
