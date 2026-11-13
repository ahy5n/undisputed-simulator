import { describe, expect, it } from "vitest";
import { Rng } from "@/lib/sim/rng";
import { createWorld } from "@/lib/sim/worldgen";
import { describeResult, initFight, playRound, simulateFight } from "@/lib/sim/fight";
import { overall } from "@/lib/sim/fighter";
import { fmt, run, sampleDivision } from "./calibrate";

describe("fight engine: 1,000 test fights", () => {
  const matched = run(sampleDivision(1, 500, 4, 60), 11);
  const mixed = run(sampleDivision(2, 500, 40, 45), 12);
  console.log("matched :", fmt(matched));
  console.log("mixed   :", fmt(mixed));
  const pct = (x: number, s = matched) => (100 * x) / s.n;

  it("evenly matched contenders: sensible KO, draw and split rates", () => {
    expect(pct(matched.ko + matched.tko)).toBeGreaterThan(30);
    expect(pct(matched.ko + matched.tko)).toBeLessThan(55);
    expect(pct(matched.draw)).toBeLessThan(6);
    expect(pct(matched.split + matched.majority)).toBeGreaterThan(3);
    expect(pct(matched.kdFights)).toBeGreaterThan(25);
    expect(pct(matched.kdFights)).toBeLessThan(60);
    expect(matched.avgThrown).toBeGreaterThan(300);
    expect(matched.avgThrown).toBeLessThan(800);
    expect(matched.avgLandedPct).toBeGreaterThan(0.22);
    expect(matched.avgLandedPct).toBeLessThan(0.42);
  });
  it("mixed fights: stoppages higher but not absurd", () => {
    expect(pct(mixed.ko + mixed.tko, mixed)).toBeLessThan(80);
    expect(pct(mixed.ko + mixed.tko, mixed)).toBeGreaterThan(40);
  });
  it("favourites win more as the rating gap grows; upsets still happen", () => {
    const winRate = (lo: number, hi: number, seed: number) => {
      const all = sampleDivision(seed, 3000, 60, 40).filter(([a, b]) => { const d = Math.abs(overall(a.ratings) - overall(b.ratings)); return d >= lo && d <= hi; }).slice(0, 250);
      const s = run(all, seed);
      return { rate: s.favWin / (s.favWin + s.upset), n: s.n };
    };
    const small = winRate(0, 3, 21), mid = winRate(8, 12, 22), big = winRate(20, 40, 23);
    console.log("fav win rate gap0-3:", small.rate.toFixed(2), "gap8-12:", mid.rate.toFixed(2), "gap20+:", big.rate.toFixed(2));
    expect(small.rate).toBeLessThan(0.66);
    expect(mid.rate).toBeGreaterThan(0.68);
    expect(mid.rate).toBeLessThan(0.93);
    expect(big.rate).toBeGreaterThan(0.9);
    expect(big.rate).toBeLessThan(0.995);
  });
  it("controversial verdicts are occasional", () => {
    expect(pct(matched.controversial)).toBeGreaterThan(0.5);
    expect(pct(matched.controversial)).toBeLessThan(15);
  });
});

describe("fight engine mechanics", () => {
  const { world } = createWorld(5);
  const [x, y] = Object.values(world.fighters).filter((f) => f.division === "welterweight" && f.pro);
  it("is deterministic for a seed", () => {
    const a = simulateFight(x, y, { rounds: 12 }, new Rng(7)), b = simulateFight(x, y, { rounds: 12 }, new Rng(7));
    expect(describeResult(x, y, a)).toBe(describeResult(x, y, b));
    expect(a.stats).toEqual(b.stats);
  });
  it("scorecards sum to scheduled rounds when it goes the distance", () => {
    for (let s = 0; s < 40; s++) {
      const r = simulateFight(x, y, { rounds: 10 }, new Rng(s));
      if (r.method === "UD" || r.method === "SD" || r.method === "MD" || r.method === "Draw") {
        expect(r.round).toBe(10);
        for (const c of r.scorecards) { expect(c.a).toBeLessThanOrEqual(100); expect(c.a).toBeGreaterThanOrEqual(85); }
      } else { expect(r.round).toBeLessThanOrEqual(10); expect(r.winner).not.toBeNull(); }
    }
  });
  it("stepping round by round matches the shape of a full fight and tactics matter", () => {
    const st = initFight(x, y, { rounds: 12 }, new Rng(3));
    const rng = new Rng(4);
    let rounds = 0;
    while (!st.over) { playRound(st, { tactic: "go-for-ko", shouts: ["hands"] }, { tactic: "clinch" }, rng); rounds++; }
    expect(st.result).toBeDefined();
    expect(rounds).toBe(st.result!.round);
  });
  it("pressure and ko tactics raise stoppage odds versus clinching", () => {
    const koRate = (ta: "go-for-ko" | "clinch") => {
      let k = 0;
      for (let s = 0; s < 150; s++) {
        const st = initFight(x, y, { rounds: 12 }, new Rng(s));
        const rng = new Rng(1000 + s);
        while (!st.over) playRound(st, { tactic: ta }, { tactic: "balanced" }, rng);
        if (st.result!.winner === "b" && (st.result!.method === "KO" || st.result!.method === "TKO")) k++;
      }
      return k;
    };
    // when A clinches the opponent stops A less than when A goes for the KO and gets caught
    expect(koRate("clinch")).toBeLessThanOrEqual(koRate("go-for-ko") + 3);
  });
});
