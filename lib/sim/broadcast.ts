import { gameYear } from "./calendar";
import { overall } from "./fighter";
import { inboxPush } from "./matchmaking";
import type { Broadcaster, DealTerms, Fighter, GameSave } from "./types";

const yearOf = (g: GameSave) => gameYear(g.startDate, g.week);
const round = (n: number, to = 1000) => Math.round(n / to) * to;
const stable = (g: GameSave) => g.company.stable.map((id) => g.world.fighters[id]).filter((f): f is Fighter => !!f && !f.retired);
export const trustIn = (g: GameSave, id: string) => g.company.trust[id] ?? 50;

/** How much a broadcaster likes your stable, 0.5 to about 2. Their stated preferences decide. */
export function appeal(g: GameSave, b: Broadcaster): { score: number; reasons: string[] } {
  const fs = stable(g), year = yearOf(g);
  let score = 0.7 + g.company.reputation / 200;
  const reasons: string[] = [];
  const has = (p: string) => b.prefers.includes(p);
  const stars = fs.filter((f) => f.popularity >= 60).length;
  if (has("big-names")) { if (stars) { score += Math.min(0.5, stars * 0.18); reasons.push(`${stars} big name${stars > 1 ? "s" : ""}`); } else reasons.push("wants big names you don't have"); }
  const brits = fs.filter((f) => f.nationality === "GB").length;
  if (has("british")) { if (brits) { score += Math.min(0.4, brits * 0.08); reasons.push(`${brits} British fighter${brits > 1 ? "s" : ""}`); } else { score -= 0.1; reasons.push("wants British fighters"); } }
  const heavies = fs.filter((f) => f.division === "heavyweight" && overall(f.ratings) >= 70).length;
  if (has("heavyweights")) { if (heavies) { score += Math.min(0.4, heavies * 0.15); reasons.push(`${heavies} heavyweight${heavies > 1 ? "s" : ""}`); } else reasons.push("wants heavyweights"); }
  const prospects = fs.filter((f) => year - f.born < 25 && f.potential >= 4).length;
  if (has("prospects")) { if (prospects) { score += Math.min(0.3, prospects * 0.1); reasons.push(`${prospects} top prospect${prospects > 1 ? "s" : ""}`); } else reasons.push("wants prospects"); }
  if (b.market !== "GLOBAL" && b.market !== g.company.country) { score -= 0.15; reasons.push("you are outside their home market"); }
  score *= 0.7 + trustIn(g, b.id) / 166; // trust 50 = neutral
  return { score: Math.max(0.3, score), reasons };
}

/** Drawing power of the cards you can put on: the sum of your four best draws. */
function cardStrength(g: GameSave): number {
  return stable(g).map((f) => Math.pow(f.popularity, 2.6) * 0.1).sort((a, b) => b - a).slice(0, 4).reduce((s, v) => s + v, 0);
}
/** The most this broadcaster will pay per show for a deal of this size. */
export function maxFee(g: GameSave, b: Broadcaster, t: Pick<DealTerms, "showsPerYear" | "exclusive" | "ppvShare">): number {
  const base = 6000 + cardStrength(g) * 55;
  const excl = t.exclusive ? 1.25 : 1;
  const ppv = 1 + (0.7 - t.ppvShare) * 0.8; // giving them more of the PPV buys a bigger fee
  const volume = t.showsPerYear > 8 ? 0.85 : 1;
  return round(Math.min(base * appeal(g, b).score * excl * ppv * volume, b.budget / Math.max(1, t.showsPerYear)));
}

export type DealDecision = { kind: "accept"; reason: string } | { kind: "counter"; reason: string; terms: DealTerms } | { kind: "walk"; reason: string };

export function evaluateDeal(g: GameSave, b: Broadcaster, t: DealTerms): DealDecision {
  if (b.id === "ppv") return { kind: "walk", reason: "Generic PPV is not a partner: just pick PPV when you build a show." };
  if (!stable(g).length) return { kind: "walk", reason: "You have no fighters. Come back with a stable." };
  if (trustIn(g, b.id) < 20) return { kind: "walk", reason: "They don't trust you after the last deal." };
  const top = maxFee(g, b, t);
  if (top < 3000) return { kind: "walk", reason: "Your cards are too small for them right now." };
  if (t.feePerShow <= top) return { kind: "accept", reason: t.feePerShow < top * 0.8 ? "They sign at once. You could have asked for more." : "Deal agreed." };
  if (t.feePerShow <= top * 1.5) return { kind: "counter", reason: "They like the idea but not the price.", terms: { ...t, feePerShow: top } };
  return { kind: "walk", reason: "Your price is far beyond what they will pay." };
}

export function signDeal(g: GameSave, b: Broadcaster, t: DealTerms): GameSave {
  const deal = { broadcasterId: b.id, showsPerYear: t.showsPerYear, feePerShow: t.feePerShow, ppvShare: t.ppvShare, exclusive: t.exclusive, endsYear: yearOf(g) + t.years, showsDone: 0 };
  return inboxPush({ ...g, company: { ...g.company, deal } }, `Broadcast deal signed with ${b.name}`, `${t.showsPerYear} shows a year at £${t.feePerShow.toLocaleString("en-GB")} each until the end of ${deal.endsYear - 1}. Miss your dates and their trust drops.`);
}

const bump = (g: GameSave, id: string, d: number): GameSave => ({ ...g, company: { ...g.company, trust: { ...g.company.trust, [id]: Math.max(0, Math.min(100, trustIn(g, id) + d)) } } });

/** After one of your shows is settled on the deal. A half-empty house is a flop. */
export function dealShowDone(g: GameSave, fill: number): GameSave {
  const d = g.company.deal;
  if (!d) return g;
  const next = bump({ ...g, company: { ...g.company, deal: { ...d, showsDone: d.showsDone + 1 } } }, d.broadcasterId, fill < 0.55 ? -6 : fill > 0.9 ? 3 : 1);
  return fill < 0.55 ? inboxPush(next, "Your broadcaster is unhappy", "The main event flopped: the venue was barely half full. Their trust in you has dropped.") : next;
}

/** January: missed dates cost trust; finished deals expire. */
export function dealSeason(g: GameSave, year: number): GameSave {
  const d = g.company.deal;
  if (!d) return g;
  const name = g.world.broadcasters.find((b) => b.id === d.broadcasterId)?.name ?? "Your broadcaster";
  let cur = g;
  const missed = Math.max(0, d.showsPerYear - d.showsDone);
  if (missed) cur = inboxPush(bump(cur, d.broadcasterId, -8 * missed), `${name}: you missed ${missed} date${missed > 1 ? "s" : ""}`, "You promised more shows than you delivered. Trust is down, and so is the fee they will offer at renewal.");
  else cur = bump(cur, d.broadcasterId, 5);
  if (year >= d.endsYear) return inboxPush({ ...cur, company: { ...cur.company, deal: undefined } }, `${name} deal has ended`, "Negotiate a renewal or a new partner under More. Until then you sell shows one at a time.");
  return { ...cur, company: { ...cur.company, deal: { ...cur.company.deal!, showsDone: 0 } } };
}

/** Making a fight across rival broadcasters costs more. */
export function crossFactor(g: GameSave, a: Fighter, b: Fighter): number {
  const net = (f: Fighter) => (f.promoter === "player" ? g.company.deal?.exclusive ? g.company.deal.broadcasterId : null : g.world.promoters.find((p) => p.id === f.promoter)?.broadcaster ?? null);
  const x = net(a), y = net(b);
  if (a.promoter === b.promoter || b.promoter === "independent" || a.promoter === "independent") return 1;
  return x && y && x !== y ? 1.3 : 1.1;
}
