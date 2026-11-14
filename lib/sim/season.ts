import { overall } from "./fighter";
import { generateFighter, PROS_PER_DIVISION } from "./worldgen";
import type { Rng } from "./rng";
import { DIVISIONS, WORLD_BODIES, type Division, type Fighter, type Ratings, type World } from "./types";

const KEYS: (keyof Ratings)[] = ["power", "speed", "defence", "chin", "stamina", "skill"];
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
export const NEW_PROSPECTS_PER_YEAR = 90;

/** Mean yearly change in each rating for a given age and potential (1-5 stars). */
export function progressionMean(age: number, potential: number): number {
  if (age <= 24) return 2.4 * (potential / 3);
  if (age <= 28) return 0.7;
  if (age <= 32) return -0.1;
  if (age <= 35) return -1.5;
  return -2.6;
}
/** Soft cap on overall rating by potential stars, so low-potential kids don't become champions. */
const ceiling = (potential: number, real: boolean) => (real ? 98 : 58 + potential * 7);

export interface SeasonReport { year: number; retired: string[]; turnedPro: string[]; intake: number }

export function progressFighter(f: Fighter, age: number, rng: Rng): Fighter {
  const mean = progressionMean(age, f.potential);
  const ratings = { ...f.ratings };
  const cap = ceiling(f.potential, f.real);
  for (const k of KEYS) {
    let delta = rng.normal(mean, 1.4);
    if (age > 33 && (k === "speed" || k === "stamina")) delta -= 0.8;
    if (age > 30 && k === "chin") delta -= (f.koLosses ?? 0) * 0.35;
    if (age > 30 && k === "skill") delta += 0.8;
    if (delta > 0 && overall(ratings) >= cap) delta = 0;
    ratings[k] = clamp(ratings[k] + delta);
  }
  return { ...f, ratings };
}

/** Run the January rollover. Returns a new World; does not mutate the input. */
export function rollSeason(world: World, rng: Rng, year: number, booked: ReadonlySet<string> = new Set(), keep: ReadonlySet<string> = new Set()): { world: World; report: SeasonReport } {
  const fighters: Record<string, Fighter> = {};
  const retired: string[] = [];
  const turnedPro: string[] = [];
  const proCount: Partial<Record<Division, number>> = {};
  for (const f of Object.values(world.fighters)) if (f.pro && !f.retired) proCount[f.division] = (proCount[f.division] ?? 0) + 1;
  for (const f0 of Object.values(world.fighters)) {
    // men who retired a year or more ago leave the database; history keeps their names
    if (f0.retired) { if (keep.has(f0.id)) fighters[f0.id] = f0; continue; }
    const age = year - f0.born;
    let f = progressFighter(f0, age, rng);
    f = { ...f, popularity: Math.max(1, Math.round(f.popularity * 0.93)), injuredWeeks: 0 };
    if (!f.pro) {
      if (f.amateur?.medal || (age >= 19 && (proCount[f.division] ?? 0) < PROS_PER_DIVISION + 20 && rng.chance(0.55 + (age - 19) * 0.15))) {
        f = { ...f, pro: true }; turnedPro.push(f.id); proCount[f.division] = (proCount[f.division] ?? 0) + 1;
      }
      else if (age >= 21) f = { ...f, retired: true };
    } else {
      const p = age >= 40 ? 1 : age >= 35 ? (age - 34) * 0.14 + (overall(f.ratings) < 60 ? 0.15 : 0) : age >= 32 && overall(f.ratings) < 50 ? 0.2 : 0;
      // nobody walks away with a fight signed: he retires after it, at the next rollover
      if (rng.chance(p) && !booked.has(f.id)) { f = { ...f, retired: true }; retired.push(f.id); }
    }
    // AI contracts expire on schedule, sending the fighter to free agency (stars become signable)
    if (f.contract && f.promoter !== "player" && f.contract.expiresYear !== undefined && f.contract.expiresYear <= year && !f.retired) {
      f = { ...f, promoter: "independent", contract: undefined };
    }
    fighters[f.id] = f;
  }
  // vacate belts of retirees
  const belts = structuredClone(world.belts);
  for (const d of DIVISIONS) for (const b of WORLD_BODIES) {
    const id = belts[d][b];
    if (id && fighters[id].retired) { belts[d][b] = null; fighters[id] = { ...fighters[id], titles: fighters[id].titles.filter((t) => t !== b) }; }
  }
  const used = new Set(Object.values(fighters).map((f) => f.name));
  const small = world.promoters.filter((p) => !p.real && p.id !== "independent").map((p) => p.id);
  // refill pro pools so every division stays deep
  let n = Object.keys(fighters).length;
  for (const d of DIVISIONS) {
    const have = Object.values(fighters).filter((f) => f.division === d && f.pro && !f.retired).length;
    for (let i = have; i < PROS_PER_DIVISION; i++) {
      const f = generateFighter(rng, d, used, small, { year, prospect: false, idPrefix: `gen${year}`, n: n++ });
      f.born = year - rng.int(20, 25);
      f.potential = rng.weighted([[1, 15], [2, 30], [3, 30], [4, 18], [5, 7]]);
      fighters[f.id] = f;
    }
  }
  // January prospect intake
  const divs: [Division, number][] = DIVISIONS.map((d, k) => [d, k < 4 ? 14 : 8]);
  for (let i = 0; i < NEW_PROSPECTS_PER_YEAR; i++) {
    const d = rng.weighted(divs);
    const f = generateFighter(rng, d, used, small, { year, prospect: true, idPrefix: `pro${year}`, n: n++ });
    f.pro = false; f.promoter = "independent"; f.born = year - rng.int(17, 18);
    fighters[f.id] = f;
  }
  return { world: { ...world, fighters, belts }, report: { year, retired, turnedPro, intake: NEW_PROSPECTS_PER_YEAR } };
}
