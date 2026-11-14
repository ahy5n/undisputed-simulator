import { computeRankings } from "./rankings";
import { Rng } from "./rng";
import { gameYear } from "./calendar";
import {
  contractSalePrice, ctxFor, evaluateOffer, isHot, releaseCost, resolveWar, rivalOffers, signFighter, offerValue, askPurse,
  type Decision,
} from "./contracts";
import { DIVISIONS, WORLD_BODIES, type GameSave, type Negotiation, type Offer } from "./types";

export type OfferOutcome = { kind: Decision["kind"] | "war" | "unaffordable"; decision?: Decision; message: string };

const yearOf = (g: GameSave) => gameYear(g.startDate, g.week);
const push = (g: GameSave, title: string, body: string): GameSave => ({ ...g, inbox: [{ id: `m-${g.week}-${g.inbox.length}-${title.length}`, week: g.week, title, body }, ...g.inbox].slice(0, 50) });

function inTop10(g: GameSave, id: string): boolean {
  const f = g.world.fighters[id];
  const r = computeRankings(g.world)[f.division];
  return WORLD_BODIES.some((b) => r[b].slice(0, 10).includes(id)) || DIVISIONS.some((d) => WORLD_BODIES.some((b) => g.world.belts[d][b] === id));
}

/** The player offers a contract to a free agent. */
export function makeOffer(g: GameSave, fighterId: string, offer: Offer): { game: GameSave; outcome: OfferOutcome } {
  const f = g.world.fighters[fighterId];
  const year = yearOf(g);
  if (!f || f.promoter !== "independent") return { game: g, outcome: { kind: "refuse", message: "He is under contract elsewhere." } };
  if (g.negotiations.some((n) => n.fighterId === fighterId)) return { game: g, outcome: { kind: "refuse", message: "A negotiation is already open." } };
  if (offer.bonus > g.company.cash) return { game: g, outcome: { kind: "unaffordable", message: "You cannot afford that signing bonus." } };
  const ctx = ctxFor(g);
  const hot = isHot(f, inTop10(g, fighterId), year);
  if (hot) {
    const rng = new Rng(g.rngState);
    const rivals = rivalOffers(f, year, g.world.promoters, rng);
    const neg: Negotiation = {
      id: `neg-${fighterId}-${g.week}`, fighterId, round: 1, offer, rivals, startedWeek: g.week,
      log: [`Week 1: you offer £${offer.purse.toLocaleString("en-GB")} per fight. ${rivals.map((r) => g.world.promoters.find((p) => p.id === r.promoterId)?.name).join(", ")} ${rivals.length > 1 ? "are" : "is"} also bidding.`],
    };
    return { game: { ...g, rngState: rng.state, negotiations: [...g.negotiations, neg] }, outcome: { kind: "war", message: `${f.name} is in demand. A bidding war has started. It runs up to three weeks; raise your offer or give a final answer from the Bids tab.` } };
  }
  const d = evaluateOffer(f, offer, year, ctx);
  if (d.kind === "accept") return { game: noteBooked(push(signFighter(g, fighterId, offer, year), `${f.name} signs`, d.reason), fighterId), outcome: { kind: "accept", decision: d, message: d.reason } };
  return { game: g, outcome: { kind: d.kind, decision: d, message: d.reason } };
}

export function raiseBid(g: GameSave, negId: string, offer: Offer): GameSave {
  return { ...g, negotiations: g.negotiations.map((n) => n.id === negId ? { ...n, offer, log: [...n.log, `Week ${n.round}: you raise to £${offer.purse.toLocaleString("en-GB")} per fight, £${offer.bonus.toLocaleString("en-GB")} bonus.`] } : n) };
}

function resolve(g: GameSave, n: Negotiation): GameSave {
  const f = g.world.fighters[n.fighterId];
  const year = yearOf(g);
  const res = resolveWar(f, n.offer, n.rivals, year, ctxFor(g), g.world.promoters, n.offer.bonus <= g.company.cash);
  let next: GameSave = { ...g, negotiations: g.negotiations.filter((x) => x.id !== n.id) };
  if (res.winner === "player") {
    next = signFighter(next, n.fighterId, n.offer, year);
    return noteBooked(push(next, `Won the bidding war for ${f.name}`, res.reason), f.id);
  }
  const rv = n.rivals.find((r) => r.promoterId === res.winner)!;
  next = { ...next, world: { ...next.world, fighters: { ...next.world.fighters, [f.id]: { ...f, promoter: res.winner, contract: { promoter: res.winner, fightsLeft: rv.offer.fights, purse: rv.offer.purse, cut: rv.offer.cut, expiresYear: year + 2 } } } } };
  return push(next, `Lost the bidding war for ${f.name}`, res.reason);
}
export const finalAnswer = (g: GameSave, negId: string): GameSave => { const n = g.negotiations.find((x) => x.id === negId); return n ? resolve(g, n) : g; };

/** Weekly: rivals raise (within budget); after round 3 the fighter decides. */
export function processNegotiations(g: GameSave): GameSave {
  let cur = g;
  for (const n of g.negotiations) {
    const live = cur.negotiations.find((x) => x.id === n.id);
    if (!live) continue;
    if (live.round >= 3) { cur = resolve(cur, live); continue; }
    const rng = new Rng(cur.rngState);
    const rivals = live.rivals.map((r) => {
      const p = cur.world.promoters.find((x) => x.id === r.promoterId)!;
      const cap = Math.round((p.budget * 0.08) / 3 / 1000) * 1000;
      const purse = Math.min(cap, Math.round((r.offer.purse * (1.04 + rng.next() * 0.06)) / 1000) * 1000);
      return { ...r, offer: { ...r.offer, purse, bonus: Math.round((purse * 1.2) / 1000) * 1000 } };
    });
    cur = {
      ...cur, rngState: rng.state,
      negotiations: cur.negotiations.map((x) => x.id === live.id ? { ...x, round: x.round + 1, rivals, log: [...x.log, `Week ${x.round + 1}: rivals raise to £${Math.max(...rivals.map((r) => r.offer.purse)).toLocaleString("en-GB")} per fight.`] } : x),
    };
  }
  return cur;
}

export function releaseFighter(g: GameSave, id: string): GameSave {
  const f = g.world.fighters[id];
  const cost = releaseCost(f);
  const next: GameSave = {
    ...g,
    company: { ...g.company, cash: g.company.cash - cost, stable: g.company.stable.filter((i) => i !== id) },
    world: { ...g.world, fighters: { ...g.world.fighters, [id]: { ...f, promoter: "independent", contract: undefined } } },
  };
  return push(next, `${f.name} released`, cost ? `You paid out the remaining guarantee: £${cost.toLocaleString("en-GB")}.` : "No guarantee left to pay.");
}

export function sellContract(g: GameSave, id: string): GameSave {
  const f = g.world.fighters[id];
  const year = yearOf(g);
  const price = contractSalePrice(f, year);
  const rng = new Rng(g.rngState);
  const buyers = g.world.promoters.filter((p) => p.id !== "independent" && p.budget >= price * 3);
  if (!buyers.length) return g;
  const buyer = rng.pick(buyers);
  const next: GameSave = {
    ...g, rngState: rng.state,
    company: { ...g.company, cash: g.company.cash + price, stable: g.company.stable.filter((i) => i !== id) },
    world: { ...g.world, fighters: { ...g.world.fighters, [id]: { ...f, promoter: buyer.id, contract: { ...f.contract!, promoter: buyer.id, expiresYear: year + 2 } } } },
  };
  return push(next, `${f.name} sold to ${buyer.name}`, `You received £${price.toLocaleString("en-GB")} for his contract.`);
}
export { askPurse, offerValue, releaseCost, contractSalePrice };

/** New terms for a fighter already in your stable. Happy fighters ask for less; no rival bids. */
export function renewContract(g: GameSave, fighterId: string, offer: Offer): { game: GameSave; outcome: OfferOutcome } {
  const f = g.world.fighters[fighterId];
  const year = yearOf(g);
  if (!f || f.promoter !== "player") return { game: g, outcome: { kind: "refuse", message: "He is not in your stable." } };
  if (offer.bonus > g.company.cash) return { game: g, outcome: { kind: "unaffordable", message: "You cannot afford that signing bonus." } };
  const ctx = ctxFor(g);
  const loyal = { ...ctx, reputation: Math.min(100, ctx.reputation + (f.morale - 50) * 0.6) };
  const d = evaluateOffer(f, offer, year, loyal);
  if (d.kind === "accept") return { game: push(signFighter(g, fighterId, offer, year), `${f.name} re-signs`, d.reason), outcome: { kind: "accept", decision: d, message: d.reason } };
  return { game: g, outcome: { kind: d.kind, decision: d, message: f.morale < 40 && d.kind === "refuse" ? "He is unhappy here and wants out." : d.reason } };
}

/** A free agent can arrive with a fight already made on the independent circuit. Say so at once. */
function noteBooked(g: GameSave, fighterId: string): GameSave {
  const f = g.fights.find((x) => !x.done && (x.a === fighterId || x.b === fighterId));
  if (!f) return g;
  const me = g.world.fighters[fighterId], opp = g.world.fighters[f.a === fighterId ? f.b : f.a];
  const weeks = Math.max(0, f.week - g.week);
  return { ...g, inbox: [{ id: `booked-${fighterId}-${g.week}`, week: g.week, title: `${me.name} already has a fight booked`, body: `He faces ${opp.name} ${weeks === 0 ? "this week" : `in ${weeks} week${weeks === 1 ? "" : "s"}`}. It was made before he signed, so someone else promotes it; you earn your cut of his purse. Set his camp under Fights.`, needsDecision: true }, ...g.inbox].slice(0, 60) };
}
