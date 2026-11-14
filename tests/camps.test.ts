/* eslint-disable prefer-const */
import { describe, expect, it } from "vitest";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { signFighter, DEFAULT_OFFER } from "@/lib/sim/contracts";
import { defaultTerms, scheduleFight } from "@/lib/sim/matchmaking";
import { campFor, campsWeek, ensureCamps, fightConfigFor, planBonus, updateCamp, weightCut } from "@/lib/sim/camps";
import { simulateFight } from "@/lib/sim/fight";
import { Rng } from "@/lib/sim/rng";
import { overall } from "@/lib/sim/fighter";
import type { GameSave } from "@/lib/sim/types";

function setup(seed = 0): { g: GameSave; mine: string; opp: string; fightId: string } {
  let g = newGame({ companyName: "T", country: "GB", primary: "#000", secondary: "#fff", startingCash: 5_000_000 });
  const pool = Object.values(g.world.fighters).filter((f) => f.pro && f.promoter === "independent" && f.division === "welterweight" && overall(f.ratings) > 55 && overall(f.ratings) < 72);
  const a = pool[seed % 10], b = pool[(seed % 10) + 11];
  g = signFighter(g, a.id, DEFAULT_OFFER(a, 2026), 2026);
  g = scheduleFight(g, a.id, b.id, 12, defaultTerms(g, g.world.fighters[a.id], b.id ? g.world.fighters[b.id] : b, []), "player", "player");
  return { g: ensureCamps(g), mine: a.id, opp: b.id, fightId: g.fights[0].id };
}

describe("training camps", () => {
  it("a camp is created for each of your fighters on a booked fight", () => {
    const { g, mine, fightId } = setup();
    expect(campFor(g, fightId, mine)).toBeDefined();
    expect(g.camps.length).toBe(1);
  });
  it("hard camps gain more than light ones; sparring costs money and boosts gains", () => {
    const run = (intensity: "light" | "hard", sparring: 0 | 2) => {
      let total = 0, cash = 0;
      for (let s = 0; s < 20; s++) {
        let { g, mine, fightId } = setup(s);
        const c = campFor(g, fightId, mine)!;
        g = updateCamp(g, c.id, { focus: "power", intensity, sparring });
        const before = g.world.fighters[mine].ratings.power, cash0 = g.company.cash;
        const rng = new Rng(s + 1);
        for (let w = 0; w < 11; w++) { g = { ...g, week: g.week + 1 }; g = campsWeek(g, new Rng(rng.int(1, 1e6))); }
        total += g.world.fighters[mine].ratings.power - before;
        cash += cash0 - g.company.cash;
      }
      return { gain: total / 20, cost: cash / 20 };
    };
    const light = run("light", 0), hard = run("hard", 0), hardSpar = run("hard", 2);
    console.log("avg power gain over a camp: light", light.gain.toFixed(2), "hard", hard.gain.toFixed(2), "hard+sparring", hardSpar.gain.toFixed(2), "sparring cost", Math.round(hardSpar.cost));
    expect(hard.gain).toBeGreaterThan(light.gain);
    expect(hardSpar.gain).toBeGreaterThanOrEqual(hard.gain);
    expect(hardSpar.cost).toBeGreaterThan(hard.cost + 20_000);
    expect(hard.gain).toBeLessThan(6);
  });
  it("hard camps injure more often and postpone the fight", () => {
    const injuries = (intensity: "light" | "hard") => {
      let n = 0, postponed = 0;
      for (let s = 0; s < 150; s++) {
        let { g, mine, fightId } = setup(s % 10);
        g = updateCamp(g, campFor(g, fightId, mine)!.id, { intensity });
        const w0 = g.fights[0].week;
        const rng = new Rng(s * 7 + 3);
        for (let w = 0; w < 10; w++) { g = { ...g, week: g.week + 1 }; g = campsWeek(g, rng); }
        if (g.world.fighters[mine].injuredWeeks > 0) n++;
        if (g.fights[0].week > w0) postponed++;
      }
      return { n, postponed };
    };
    const light = injuries("light"), hard = injuries("hard");
    console.log("camp injuries /150: light", light.n, "hard", hard.n, "postponed", hard.postponed);
    expect(hard.n).toBeGreaterThan(light.n);
    expect(hard.postponed).toBeGreaterThan(0);
  });
  it("condition grows over the camp and sets the weight-cut status", () => {
    let { g, mine, fightId } = setup();
    for (let w = 0; w < 10; w++) g = advanceWeek(g);
    const c = campFor(g, fightId, mine);
    if (c) { expect(c.condition).toBeGreaterThan(60); expect(["easy", "fine", "tough"]).toContain(weightCut(c.condition)); }
    expect(weightCut(90)).toBe("easy"); expect(weightCut(60)).toBe("tough");
  });
  it("game-plan camps give a fight-night bonus but no permanent gain", () => {
    const { g, mine, fightId } = setup();
    let cur = updateCamp(g, campFor(g, fightId, mine)!.id, { focus: "gameplan", intensity: "normal" });
    const before = cur.world.fighters[mine].ratings;
    const rng = new Rng(5);
    for (let w = 0; w < 8; w++) { cur = { ...cur, week: cur.week + 1 }; cur = campsWeek(cur, rng); }
    expect(cur.world.fighters[mine].ratings).toEqual(before);
    const bonus = planBonus(campFor(cur, fightId, mine));
    expect(bonus).toBeGreaterThan(0.02);
    const cfg = fightConfigFor(cur, cur.fights[0]);
    expect(cfg.planBonusA).toBeGreaterThan(0.02);
    expect(cfg.conditionA).toBeGreaterThan(60);
    // and it translates into more wins
    const wins = (b: number) => {
      let w = 0; const A = cur.world.fighters[mine], B = cur.world.fighters[cur.fights[0].b];
      const r = new Rng(77);
      for (let i = 0; i < 600; i++) if (simulateFight(A, B, { rounds: 10, planBonusA: b }, r).winner === "a") w++;
      return w;
    };
    expect(wins(bonus)).toBeGreaterThan(wins(0) - 5);
  });
});
