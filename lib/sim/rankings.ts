import { hashSeed } from "./rng";
import { overall } from "./fighter";
import { DIVISIONS, WORLD_BODIES, type Division, type Fighter, type World, type WorldBody } from "./types";

export type Rankings = Record<Division, Record<WorldBody, string[]>>;
export const RANK_SIZE = 15;

/** Each body weighs things a little differently so the four lists are not identical. */
function bodyJitter(id: string, body: WorldBody): number {
  return (hashSeed(id + body) % 7) / 2 - 1.5; // -1.5 .. +1.5
}
export function rankScore(f: Fighter, body: WorldBody, heldBelts: number): number {
  const fights = f.record.w + f.record.l + f.record.d;
  const koRate = f.record.w ? f.record.ko / f.record.w : 0;
  const winPct = fights ? f.record.w / fights : 0;
  const formBonus = f.form.slice(-5).reduce((a, r) => a + (r === "W" ? 1 : r === "L" ? -2 : 0), 0) * 0.6;
  const activity = Math.min(fights, 25) * 0.08;
  return overall(f.ratings) + winPct * 6 + koRate * 3 + activity + formBonus + heldBelts * 3 + bodyJitter(f.id, body) + f.popularity * 0.03;
}

/** Top-15 per body per division. The body's own champion is not listed. */
export function computeRankings(world: World): Rankings {
  const held = new Map<string, number>();
  for (const d of DIVISIONS) for (const b of WORLD_BODIES) {
    const id = world.belts[d][b];
    if (id) held.set(id, (held.get(id) ?? 0) + 1);
  }
  const out = {} as Rankings;
  for (const d of DIVISIONS) {
    out[d] = {} as Record<WorldBody, string[]>;
    const pool = Object.values(world.fighters).filter((f) => f.division === d && f.pro && !f.retired && f.record.w + f.record.l + f.record.d >= 3);
    for (const b of WORLD_BODIES) {
      const champ = world.belts[d][b];
      out[d][b] = pool
        .filter((f) => f.id !== champ)
        .map((f) => [f.id, rankScore(f, b, held.get(f.id) ?? 0)] as const)
        .sort((x, y) => y[1] - x[1])
        .slice(0, RANK_SIZE)
        .map(([id]) => id);
    }
  }
  return out;
}
export function rankOf(r: Rankings, d: Division, b: WorldBody, id: string): number | null {
  const i = r[d][b].indexOf(id);
  return i < 0 ? null : i + 1;
}
