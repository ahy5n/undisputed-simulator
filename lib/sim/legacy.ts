import { dateForWeek, gameYear } from "./calendar";
import { overall, recordString } from "./fighter";
import { inboxPush } from "./matchmaking";
import type { Rng } from "./rng";
import { DIVISIONS, DIVISION_LABEL, WORLD_BODIES, type Fighter, type GameSave } from "./types";

export const OLYMPICS: Record<number, string> = { 2028: "Los Angeles", 2032: "Brisbane", 2036: "the 2036 Games", 2040: "the 2040 Games", 2044: "the 2044 Games", 2048: "the 2048 Games" };
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));

/** The Games fall in the first week of August of an Olympic year. */
export function olympicsDue(g: GameSave): number | null {
  const year = gameYear(g.startDate, g.week);
  if (year % 4 !== 0 || g.hall.olympics.some((o) => o.year === year)) return null;
  const d = dateForWeek(g.startDate, g.week);
  return d.getUTCMonth() >= 7 ? year : null;
}

export function runOlympics(g: GameSave, year: number, rng: Rng): GameSave {
  const fighters = { ...g.world.fighters };
  const medals: GameSave["hall"]["olympics"][number]["medals"] = [];
  for (const d of DIVISIONS) {
    const field = Object.values(fighters).filter((f) => !f.pro && !f.retired && f.division === d)
      .map((f) => ({ f, score: overall(f.ratings) + f.potential * 2 + rng.normal(0, 3) }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    if (field.length < 3) continue;
    const award = (f: Fighter, medal: string, pop: number, minPot: number) => {
      fighters[f.id] = { ...f, popularity: clamp(Math.max(f.popularity, 20) + pop), potential: Math.max(f.potential, minPot), amateur: { ...(f.amateur ?? { w: 30, l: 3 }), medal: `${medal} ${year}` } };
    };
    award(field[0].f, "Gold", 30, 4); award(field[1].f, "Silver", 18, 3); award(field[2].f, "Bronze", 12, 3);
    medals.push({ division: d, gold: field[0].f.name, silver: field[1].f.name, bronze: field[2].f.name });
  }
  const city = OLYMPICS[year] ?? `the ${year} Games`;
  const next: GameSave = { ...g, world: { ...g.world, fighters }, hall: { ...g.hall, olympics: [...g.hall.olympics, { year, city, medals }] } };
  const golds = medals.slice(0, 3).map((m) => `${m.gold} (${DIVISION_LABEL[m.division].toLowerCase()})`).join(", ");
  return inboxPush(next, `Olympic boxing: ${city} ${year}`, `Gold for ${golds} and more. Medallists are in the prospect pool with a medal by their name. Expect bidding wars when you offer them terms.`, true);
}

const titleWins = (g: GameSave, id: string) => g.history.filter((h) => h.titles.length > 0 && h.winner && (h.winner === "a" ? h.a : h.b) === id).length;

/** Weekly: record anyone who holds all four belts at a weight. */
export function hallWeek(g: GameSave): GameSave {
  let hall = g.hall;
  for (const d of DIVISIONS) {
    const id = g.world.belts[d].WBC;
    if (!id || !WORLD_BODIES.every((b) => g.world.belts[d][b] === id)) continue;
    if (hall.undisputed.some((u) => u.id === id && u.division === d)) continue;
    hall = { ...hall, undisputed: [...hall.undisputed, { id, name: g.world.fighters[id].name, division: d, week: g.week }] };
  }
  return hall === g.hall ? g : { ...g, hall };
}

/** January: retired greats go into the Hall of Fame. */
export function induct(g: GameSave, retiredIds: string[], year: number): GameSave {
  const add: GameSave["hall"]["inductees"] = [];
  for (const id of retiredIds) {
    const f = g.world.fighters[id];
    const tw = titleWins(g, id);
    const great = tw >= 5 || (f.record.w >= 35 && f.popularity >= 85) || g.hall.undisputed.some((u) => u.id === id);
    if (great) add.push({ id, name: f.name, nationality: f.nationality, record: `${recordString(f)} (${f.record.ko} KO)`, titleWins: tw, year });
  }
  return add.length ? { ...g, hall: { ...g.hall, inductees: [...g.hall.inductees, ...add] } } : g;
}

export interface Records {
  promoter: { w: number; l: number; d: number; titleWins: number };
  mostTitleWins: { name: string; n: number }[];
  mostKos: { name: string; n: number }[];
  biggestGates: { label: string; week: number; attendance: number; revenue: number; profit: number }[];
  fastestKo: { name: string; over: string; round: number } | null;
}
export function records(g: GameSave, venueName: (id: string) => string): Records {
  const F = g.world.fighters;
  const p = { w: 0, l: 0, d: 0, titleWins: 0 };
  const tw = new Map<string, number>(), ko = new Map<string, number>();
  let fastest: Records["fastestKo"] = null;
  for (const h of g.history) {
    const side = F[h.a]?.promoter === "player" ? "a" : F[h.b]?.promoter === "player" ? "b" : null;
    if (side) { if (!h.winner) p.d++; else if (h.winner === side) { p.w++; if (h.titles.length) p.titleWins++; } else p.l++; }
    if (!h.winner) continue;
    const wName = h.winner === "a" ? h.aName : h.bName, lName = h.winner === "a" ? h.bName : h.aName;
    if (h.titles.length) tw.set(wName, (tw.get(wName) ?? 0) + 1);
    if (h.method === "KO" || h.method === "TKO") {
      ko.set(wName, (ko.get(wName) ?? 0) + 1);
      if (h.titles.length && (!fastest || h.round < fastest.round)) fastest = { name: wName, over: lName, round: h.round };
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
  const biggestGates = g.shows.filter((s) => s.statement).map((s) => ({ label: venueName(s.venue), week: s.week, attendance: s.statement!.attendance, revenue: s.statement!.revenue, profit: s.statement!.profit }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  return { promoter: p, mostTitleWins: top(tw), mostKos: top(ko), biggestGates, fastestKo: fastest };
}
