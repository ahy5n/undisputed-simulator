import { describe, expect, it } from "vitest";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { defaultTerms, scheduleFight } from "@/lib/sim/matchmaking";
import { bookShow, cancelShow, project, showFights, VENUES } from "@/lib/sim/shows";
import { quickSimFight } from "@/lib/sim/weekly";
import { overall } from "@/lib/sim/fighter";
import type { Fighter, GameSave, ScheduledFight } from "@/lib/sim/types";

const fresh = () => newGame({ companyName: "T", country: "GB", primary: "#000", secondary: "#fff", startingCash: 3_000_000 });
const fights = (g: GameSave, pairs: [Fighter, Fighter][], week = 10, titles: ("WBC" | "WBA" | "IBF" | "WBO")[] = []) => {
  let cur = g;
  pairs.forEach(([a, b], i) => { cur = scheduleFight(cur, a.id, b.id, week, defaultTerms(cur, a, b, i === 0 ? titles : []), "player", "player"); });
  return cur;
};
const byPop = (g: GameSave, lo: number, hi: number, div?: string) =>
  Object.values(g.world.fighters).filter((f) => f.pro && f.promoter === "independent" && f.popularity >= lo && f.popularity <= hi && (!div || f.division === div));

describe("show economics", () => {
  it("a small card of low-draw fighters roughly breaks even in a small hall", () => {
    const g = fresh();
    const pool = byPop(g, 12, 30, "welterweight").slice(0, 12);
    const pairs: [Fighter, Fighter][] = [0, 2, 4, 6, 8, 10].map((i) => [pool[i], pool[i + 1]]);
    const gg = fights(g, pairs);
    const p = project(gg, "hall", gg.fights.slice(0, 6), "standard", "sale");
    console.log("small card:", Math.round(p.revenue), Math.round(p.costs), Math.round(p.profit), "att", p.attendance);
    expect(p.profit / p.revenue).toBeGreaterThan(-0.6);
    expect(p.profit / p.revenue).toBeLessThan(0.7);
  });
  it("a card with a 60-popularity main event is profitable in an arena", () => {
    const g = fresh();
    const stars = byPop(g, 50, 75, "middleweight").slice(0, 2);
    const under = byPop(g, 15, 35, "middleweight").slice(0, 6);
    const gg = fights(g, [[stars[0], stars[1]], [under[0], under[1]], [under[2], under[3]], [under[4], under[5]]]);
    const p = project(gg, "arena-m", gg.fights, "standard", "sale");
    console.log("arena card:", Math.round(p.revenue), Math.round(p.costs), Math.round(p.profit), "att", p.attendance);
    expect(p.profit).toBeGreaterThan(0);
  });
  it("a mega-fight in a national stadium clears £10m revenue", () => {
    const g = fresh();
    const a = g.world.fighters["tyson-fury"], b = g.world.fighters["oleksandr-usyk"];
    const gg = fights(g, [[a, b]], 10, ["WBC"]);
    const p = project(gg, "stadium-l", gg.fights, "standard", "sale");
    console.log("mega:", Math.round(p.revenue), Math.round(p.costs), Math.round(p.profit), "att", p.attendance, p.lines.map((l) => l.label.slice(0, 12) + " " + Math.round(l.amount / 1000) + "k").join(" | "));
    expect(p.revenue).toBeGreaterThan(10_000_000);
    expect(p.profit).toBeGreaterThan(1_000_000);
  });
  it("oversized venues lose money: a small draw in a stadium is a disaster", () => {
    const g = fresh();
    const pool = byPop(g, 12, 30, "welterweight");
    const gg = fights(g, [[pool[0], pool[1]]]);
    expect(project(gg, "stadium-s", gg.fights, "standard", "sale").profit).toBeLessThan(-250_000);
  });
  it("higher prices sell fewer tickets; PPV has bigger upside than a one-off sale for a star card", () => {
    const g = fresh();
    const gg = fights(g, [[g.world.fighters["tyson-fury"], g.world.fighters["oleksandr-usyk"]]], 10, ["WBC"]);
    const lo = project(gg, "arena-l", gg.fights, "low", "sale"), hi = project(gg, "arena-l", gg.fights, "premium", "sale");
    expect(lo.attendance).toBeGreaterThanOrEqual(hi.attendance);
    const sale = project(gg, "arena-l", gg.fights, "standard", "sale"), ppv = project(gg, "arena-l", gg.fights, "standard", "ppv");
    expect(ppv.revenue).toBeGreaterThan(sale.revenue);
    expect(VENUES.length).toBe(7);
  });
});

describe("booking and settling", () => {
  it("books, cancels, and settles after the fights; promoter keeps the rest win or lose", () => {
    const g0 = fresh();
    const pool = byPop(g0, 20, 40, "lightweight").slice(0, 4);
    let g = fights(g0, [[pool[0], pool[1]], [pool[2], pool[3]]], 8);
    const ids = g.fights.map((f) => f.id);
    g = bookShow(g, { week: 8, venue: "town", fights: ids, price: "standard", dist: "sale" });
    expect(g.shows.length).toBe(1);
    expect(g.fights.every((f) => f.showId === g.shows[0].id)).toBe(true);
    const cancelled = cancelShow(g, g.shows[0].id);
    expect(cancelled.shows.length).toBe(0);
    expect(cancelled.fights.every((f) => !f.showId)).toBe(true);
    // settle: cash moves by exactly the statement profit, only once both fights are done
    const before = g.company.cash;
    g = quickSimFight(g, ids[0]);
    expect(g.shows[0].statement).toBeUndefined();
    g = quickSimFight(g, ids[1]);
    const st = g.shows[0].statement!;
    expect(st).toBeDefined();
    expect(g.company.cash).toBe(before + st.profit);
    expect(st.revenue - st.costs).toBe(st.profit);
    expect(showFights(g, g.shows[0]).every((f) => f.done)).toBe(true);
  });
  it("a promoted fight reaching its date with no show gets an automatic one", () => {
    const g0 = fresh();
    const pool = byPop(g0, 20, 40, "featherweight").slice(0, 2);
    let g = fights(g0, [[pool[0], pool[1]]], 7);
    for (let i = 0; i < 8; i++) g = advanceWeek(g);
    expect(g.shows.some((s) => s.auto)).toBe(true);
    expect(overall(pool[0].ratings)).toBeGreaterThan(0);
    const f: ScheduledFight = g.fights.find((x) => x.promoter === "player")!;
    expect(f.showId).toBeDefined();
  });
});
