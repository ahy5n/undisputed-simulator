// Shared calibration harness. Used by tests and by `npx tsx`-style ad hoc runs.
import { Rng } from "@/lib/sim/rng";
import { createWorld } from "@/lib/sim/worldgen";
import { simulateFight } from "@/lib/sim/fight";
import { overall } from "@/lib/sim/fighter";
import type { Fighter } from "@/lib/sim/types";

export interface Stats { n: number; ko: number; tko: number; decision: number; draw: number; split: number; majority: number; favWin: number; upset: number; kdFights: number; avgRounds: number; controversial: number; avgThrown: number; avgLandedPct: number }

export function run(pairs: [Fighter, Fighter][], seed: number, rounds = 12): Stats {
  const rng = new Rng(seed);
  const s: Stats = { n: 0, ko: 0, tko: 0, decision: 0, draw: 0, split: 0, majority: 0, favWin: 0, upset: 0, kdFights: 0, avgRounds: 0, controversial: 0, avgThrown: 0, avgLandedPct: 0 };
  let thrown = 0, landed = 0, decided = 0;
  for (const [a, b] of pairs) {
    const r = simulateFight(a, b, { rounds: rounds }, rng);
    s.n++; s.avgRounds += r.round;
    if (r.method === "KO") s.ko++; else if (r.method === "TKO") s.tko++;
    else if (r.method === "Draw") s.draw++; else { s.decision++; if (r.method === "SD") s.split++; if (r.method === "MD") s.majority++; }
    if (r.knockdowns.a + r.knockdowns.b > 0) s.kdFights++;
    if (r.controversial) s.controversial++;
    thrown += r.stats.a.thrown + r.stats.b.thrown; landed += r.stats.a.landed + r.stats.b.landed;
    const fav = overall(a.ratings) >= overall(b.ratings) ? "a" : "b";
    if (r.winner) { decided++; if (r.winner === fav) s.favWin++; else s.upset++; }
  }
  s.avgRounds /= s.n; s.avgThrown = thrown / s.n / 2; s.avgLandedPct = landed / thrown;
  (s as Stats & { decided: number }).decided = decided;
  return s;
}
export function sampleDivision(seed: number, pairsN: number, maxDiff: number, minOvr = 0) {
  const { world } = createWorld(seed);
  const rng = new Rng(seed + 1);
  const pros = Object.values(world.fighters).filter((f) => f.pro && f.ratings && overall(f.ratings) >= minOvr);
  const pairs: [Fighter, Fighter][] = [];
  let guard = 0;
  while (pairs.length < pairsN && guard++ < 100000) {
    const a = rng.pick(pros), b = rng.pick(pros);
    if (a.id !== b.id && a.division === b.division && Math.abs(overall(a.ratings) - overall(b.ratings)) <= maxDiff && Math.abs(overall(a.ratings) - overall(b.ratings)) >= (maxDiff > 5 ? 0 : 0)) pairs.push([a, b]);
  }
  return pairs;
}
export function fmt(s: Stats) {
  const pct = (x: number) => ((100 * x) / s.n).toFixed(1) + "%";
  return `n=${s.n} KO/TKO=${pct(s.ko + s.tko)} (KO ${pct(s.ko)}) dec=${pct(s.decision)} draw=${pct(s.draw)} SD=${pct(s.split)} MD=${pct(s.majority)} KDfights=${pct(s.kdFights)} avgRd=${s.avgRounds.toFixed(1)} fav=${(100 * s.favWin / (s.favWin + s.upset)).toFixed(1)}% thrown/fighter=${s.avgThrown.toFixed(0)} landed%=${(100 * s.avgLandedPct).toFixed(1)} contro=${pct(s.controversial)}`;
}
