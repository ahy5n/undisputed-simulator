import { Rng } from "./rng";
import { overall } from "./fighter";
import { CAMP_MIN, inboxPush, newId } from "./matchmaking";
import { dealShowDone } from "./broadcast";
import type { Fighter, GameSave, ScheduledFight, Show, Statement, StatementLine } from "./types";

export interface Venue { id: string; name: string; capacity: number; hire: number; avgTicket: number; needsStar?: number }
export const VENUES: Venue[] = [
  { id: "hall", name: "Small hall", capacity: 1200, hire: 8_000, avgTicket: 35 },
  { id: "town", name: "Town hall", capacity: 2500, hire: 15_000, avgTicket: 45 },
  { id: "arena-s", name: "Regional arena", capacity: 5000, hire: 40_000, avgTicket: 60 },
  { id: "arena-m", name: "City arena", capacity: 10_000, hire: 90_000, avgTicket: 75 },
  { id: "arena-l", name: "Major arena", capacity: 20_000, hire: 220_000, avgTicket: 95 },
  { id: "stadium-s", name: "Stadium", capacity: 40_000, hire: 500_000, avgTicket: 110 },
  { id: "stadium-l", name: "National stadium", capacity: 90_000, hire: 1_100_000, avgTicket: 130 },
];
export const venueById = (id: string) => VENUES.find((v) => v.id === id)!;
const PRICE_MULT = { low: 0.75, standard: 1, premium: 1.3 } as const;
const DEMAND_MULT = { low: 1.25, standard: 1, premium: 0.78 } as const;

/** Ticket-selling power of one fighter. */
export const draw = (f: Fighter, home: string) => Math.pow(f.popularity, 2.6) * 0.1 * (f.nationality === home ? 1.8 : 1);

export function cardDraw(fs: ScheduledFight[], F: Record<string, Fighter>, home: string, rivalries: Record<string, number> = {}): { total: number; main: number } {
  const rows = fs.map((x) => {
    const d = draw(F[x.a], home) + draw(F[x.b], home);
    const grudge = rivalries[x.a < x.b ? `${x.a}|${x.b}` : `${x.b}|${x.a}`] ? 1.3 : 1;
    return d * (x.titles.length ? 1.5 : 1) * (x.hype ?? 1) * grudge;
  }).sort((a, b) => b - a);
  const total = (rows[0] ?? 0) + rows.slice(1).reduce((s, v) => s + v * 0.25, 0);
  return { total, main: rows[0] ?? 0 };
}

export interface Projection extends Statement { demand: number }

/** Expected numbers for a show. `rng` adds real-world noise for the post-show statement. */
export function project(g: GameSave, venueId: string, fights: ScheduledFight[], price: Show["price"], dist: Show["dist"], rng?: Rng): Projection {
  const F = g.world.fighters, v = venueById(venueId);
  const { total } = cardDraw(fights, F, g.company.country, g.rivalries);
  const noise = (sd: number) => (rng ? Math.max(0.6, rng.normal(1, sd)) : 1);
  const demand = (400 + total * DEMAND_MULT[price]) * noise(0.08);
  const attendance = Math.round(Math.min(v.capacity, demand));
  const gate = Math.round(attendance * v.avgTicket * PRICE_MULT[price]);
  const lines: StatementLine[] = [{ label: `Gate (${attendance.toLocaleString("en-GB")} of ${v.capacity.toLocaleString("en-GB")} seats)`, amount: gate }];
  let ppvBuys = 0;
  const deal = g.company.deal;
  const bName = deal ? g.world.broadcasters.find((b) => b.id === deal.broadcasterId)?.name ?? "Broadcaster" : "";
  if ((dist === "deal" || dist === "deal-ppv") && deal) {
    lines.push({ label: `${bName} fee (deal)`, amount: deal.feePerShow });
    if (dist === "deal-ppv") {
      ppvBuys = Math.round(total * 9 * noise(0.25));
      lines.push({ label: `PPV on ${bName} (${ppvBuys.toLocaleString("en-GB")} buys at £20, your ${Math.round(deal.ppvShare * 100)}%)`, amount: Math.round(ppvBuys * 20 * deal.ppvShare) });
    }
  } else if (dist === "ppv" || dist === "deal-ppv") {
    ppvBuys = Math.round(total * 8 * noise(0.28));
    lines.push({ label: `PPV (${ppvBuys.toLocaleString("en-GB")} buys at £20, after platform cut)`, amount: Math.round(ppvBuys * 20 * 0.65) });
  } else {
    lines.push({ label: "Broadcaster fee (one-off sale)", amount: Math.round((total * 35 + 3000) * noise(0.05)) });
  }
  const sponsor = Math.round((gate * 0.08 + 25_000) * noise(0.1));
  lines.push({ label: "Sponsorship", amount: sponsor });
  if (v.capacity >= 10_000) lines.push({ label: "Host-city fee", amount: Math.round(attendance * 12) });
  const revenue = lines.reduce((s, l) => s + l.amount, 0);
  const costs: StatementLine[] = [];
  const purses = fights.reduce((s, f) => s + f.purseA + f.purseB, 0);
  costs.push({ label: `Fighter purses (${fights.length} fight${fights.length === 1 ? "" : "s"})`, amount: -purses });
  costs.push({ label: `Venue hire: ${v.name}`, amount: -v.hire });
  costs.push({ label: "Production", amount: -(5_000 + v.capacity * 3 + fights.length * 3_000) });
  const titleFights = fights.reduce((s, f) => s + f.titles.length, 0);
  costs.push({ label: "Sanctioning fees", amount: -Math.round(titleFights * 25_000 + purses * 0.03) });
  const foreign = new Set<string>();
  for (const f of fights) for (const id of [f.a, f.b]) if (F[id].nationality !== g.company.country) foreign.add(id);
  costs.push({ label: `Travel (${foreign.size} overseas fighter${foreign.size === 1 ? "" : "s"})`, amount: -foreign.size * 8_000 });
  const cost = costs.reduce((s, l) => s + l.amount, 0);
  return { lines: [...lines, ...costs], revenue, costs: -cost, profit: revenue + cost, attendance, capacity: v.capacity, ppvBuys, demand };
}

export const promotedUnassigned = (g: GameSave, week: number) => g.fights.filter((f) => !f.done && f.promoter === "player" && !f.showId && f.week === week);
export const showFights = (g: GameSave, s: Show) => s.fights.map((id) => g.fights.find((f) => f.id === id)).filter((f): f is ScheduledFight => !!f);

export function bookShow(g: GameSave, draft: { week: number; venue: string; fights: string[]; price: Show["price"]; dist: Show["dist"] }): GameSave {
  if (!draft.fights.length || draft.fights.length > 8 || draft.week < g.week) return g;
  const id = newId("show", g);
  return {
    ...g,
    shows: [...g.shows, { id, ...draft }],
    fights: g.fights.map((f) => (draft.fights.includes(f.id) ? { ...f, showId: id } : f)),
  };
}
export function cancelShow(g: GameSave, id: string): GameSave {
  const s = g.shows.find((x) => x.id === id);
  if (!s || s.statement || s.week - g.week < 1) return g;
  return { ...g, shows: g.shows.filter((x) => x.id !== id), fights: g.fights.map((f) => (f.showId === id ? { ...f, showId: undefined } : f)) };
}

/** Player-promoted fights that reach their date with no show get a default small-hall show so nothing breaks. */
export function autoShows(g: GameSave): GameSave {
  let cur = g;
  for (const f of g.fights.filter((x) => !x.done && x.promoter === "player" && !x.showId && x.week <= g.week + 0)) {
    const live = cur.fights.find((x) => x.id === f.id);
    if (!live || live.showId) continue;
    const same = promotedUnassigned(cur, f.week).slice(0, 8);
    const big = same.reduce((s, x) => s + draw(cur.world.fighters[x.a], cur.company.country) + draw(cur.world.fighters[x.b], cur.company.country), 0);
    const venue = VENUES.find((v) => v.capacity >= Math.min(big + 400, 90_000))?.id ?? "stadium-l";
    cur = bookShow(cur, { week: f.week, venue, fights: same.map((x) => x.id), price: "standard", dist: cur.company.deal ? "deal" : "sale" });
    cur = { ...cur, shows: cur.shows.map((s) => (s.fights.includes(f.id) ? { ...s, auto: true } : s)) };
    cur = inboxPush(cur, "Show booked automatically", `A fight reached its date with no show, so a default show was booked at ${venueById(cur.shows[cur.shows.length - 1].venue).name}.`);
  }
  return cur;
}

/** Settle a show once every fight on it has been fought. Returns the game with cash updated and the statement stored. */
export function settleIfComplete(g: GameSave, showId: string | undefined, rng: Rng): GameSave {
  if (!showId) return g;
  const s = g.shows.find((x) => x.id === showId);
  if (!s || s.statement) return g;
  const fs = showFights(g, s);
  if (!fs.length || fs.some((f) => !f.done)) return g;
  const p = project(g, s.venue, fs, s.price, s.dist, rng);
  const statement: Statement = { lines: p.lines, revenue: p.revenue, costs: p.costs, profit: p.profit, attendance: p.attendance, capacity: p.capacity, ppvBuys: p.ppvBuys };
  let next: GameSave = { ...g, shows: g.shows.map((x) => (x.id === showId ? { ...x, statement } : x)), company: { ...g.company, cash: g.company.cash + p.profit } };
  if (s.dist === "deal" || s.dist === "deal-ppv") next = dealShowDone(next, p.attendance / p.capacity);
  return inboxPush(next, `Show settled: ${p.profit >= 0 ? "profit" : "loss"} £${Math.abs(p.profit).toLocaleString("en-GB")}`, `Attendance ${p.attendance.toLocaleString("en-GB")} of ${p.capacity.toLocaleString("en-GB")}. Revenue £${p.revenue.toLocaleString("en-GB")}, costs £${p.costs.toLocaleString("en-GB")}. See Shows for the statement.`);
}
export const earliestShowWeek = (g: GameSave) => g.week + CAMP_MIN;
export { overall };
