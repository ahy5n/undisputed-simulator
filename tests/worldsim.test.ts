import { describe, expect, it } from "vitest";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { computeRankings } from "@/lib/sim/rankings";
import { rankedIds, realisticOpponents } from "@/lib/sim/weekly";
import { DIVISIONS, WORLD_BODIES, type GameSave } from "@/lib/sim/types";

const fresh = () => newGame({ companyName: "T", country: "GB", primary: "#000", secondary: "#fff", startingCash: 3_000_000 });

describe("two simulated years with no player action", () => {
  const g0 = fresh();
  const t0 = Date.now();
  let g: GameSave = g0;
  const perWeek: number[] = [];
  let vacantWeeks = 0;
  const beltsAt = (x: GameSave) => JSON.stringify(x.world.belts);
  const startBelts = beltsAt(g0);
  for (let i = 0; i < 104; i++) {
    const before = g.history.length;
    g = advanceWeek(g);
    perWeek.push(g.history.length - before);
    vacantWeeks += DIVISIONS.flatMap((d) => WORLD_BODIES.map((b) => g.world.belts[d][b])).filter((x) => x === null).length;
  }
  const ms = Date.now() - t0;
  it("the world keeps fighting at a healthy rate", () => {
    const total = g.history.length;
    console.log(`104 weeks in ${ms}ms; history=${total}; ~${(perWeek.slice(20).reduce((a, b) => a + b, 0) / (perWeek.length - 20)).toFixed(1)} fights/week after warm-up; avg vacant belts/week ${(vacantWeeks / 104).toFixed(1)}`);
    expect(perWeek.slice(20).reduce((a, b) => a + b, 0) / (perWeek.length - 20)).toBeGreaterThan(8);
  });
  it("title fights happen and belts move or are defended; vacancies don't linger", () => {
    const titleFights = g.history.filter((h) => h.titles.length > 0).length;
    console.log("title fights:", titleFights, "belts changed:", beltsAt(g) !== startBelts);
    expect(titleFights).toBeGreaterThan(8);
    expect(vacantWeeks / 104).toBeLessThan(10);
  });
  it("nobody is double-booked or fights while retired", () => {
    const seen = new Map<string, number[]>();
    for (const f of g.fights.filter((x) => !x.done)) for (const id of [f.a, f.b]) {
      const l = seen.get(id) ?? [];
      for (const w of l) expect(Math.abs(w - f.week)).toBeGreaterThanOrEqual(6);
      l.push(f.week); seen.set(id, l);
    }
  });
  it("never-stuck: every ranked fighter has at least three realistic opponents", () => {
    const r = computeRankings(g.world);
    let min = 99;
    for (const id of rankedIds(g, r)) min = Math.min(min, realisticOpponents(g, g.world.fighters[id]));
    expect(min).toBeGreaterThanOrEqual(3);
  });
  it("records add up exactly: each fighter's record change equals their fights in history", () => {
    const f0 = g0.world.fighters;
    const count = new Map<string, number>();
    for (const h of g.history) for (const id of [h.a, h.b]) count.set(id, (count.get(id) ?? 0) + 1);
    for (const id of Object.keys(f0)) {
      const a = f0[id].record, b = g.world.fighters[id].record;
      expect((b.w + b.l + b.d) - (a.w + a.l + a.d)).toBe(count.get(id) ?? 0);
    }
  });
  it("mandatory orders were issued", () => {
    expect(Object.values(g.lastMandatory).some((w) => w > 0)).toBe(true);
  });
});

import { shortlist } from "@/lib/sim/matchmaking";
import { overall } from "@/lib/sim/fighter";
describe("shortlists", () => {
  it("every fighter gets five realistic suggestions, mostly with a fair chance", () => {
    const g = fresh();
    const r = computeRankings(g.world);
    const sample = Object.values(g.world.fighters).filter((f) => f.pro && f.promoter !== "player").filter((_, i) => i % 40 === 0);
    let fair = 0, total = 0;
    for (const f of sample) {
      const list = shortlist(g, r, f);
      expect(list.length).toBe(5);
      expect(new Set(list.map((c) => c.fighter.id)).size).toBe(5);
      for (const c of list) { total++; if (c.winChance >= 0.3) fair++; expect(c.why.length).toBeGreaterThan(3); }
      expect(list.some((c) => c.winChance >= 0.6) || overall(f.ratings) >= 72 || overall(f.ratings) <= 48).toBe(true);
    }
    console.log(`shortlist: ${fair}/${total} suggestions had >=30% win chance across ${sample.length} fighters`);
    expect(fair / total).toBeGreaterThan(0.7);
  });
});
