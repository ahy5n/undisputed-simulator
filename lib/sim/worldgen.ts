import realFighters from "@/data/fighters.json";
import promoters from "@/data/promoters.json";
import broadcasters from "@/data/broadcasters.json";
import belts from "@/data/belts.json";
import GB from "@/data/names/GB.json";
import IE from "@/data/names/IE.json";
import US from "@/data/names/US.json";
import MX from "@/data/names/MX.json";
import PR from "@/data/names/PR.json";
import JP from "@/data/names/JP.json";
import PH from "@/data/names/PH.json";
import KZ from "@/data/names/KZ.json";
import UA from "@/data/names/UA.json";
import CU from "@/data/names/CU.json";
import NG from "@/data/names/NG.json";
import GH from "@/data/names/GH.json";
import AU from "@/data/names/AU.json";
import PK from "@/data/names/PK.json";
import IN from "@/data/names/IN.json";
import DE from "@/data/names/DE.json";
import { Rng } from "./rng";
import { overall } from "./fighter";
import {
  DIVISIONS, type Broadcaster, type Division, type Fighter, type Promoter, type Ratings, type Style, type World,
  type WorldBody, WORLD_BODIES,
} from "./types";

const NAMES: Record<string, { first: string[]; last: string[] }> = { GB, IE, US, MX, PR, JP, PH, KZ, UA, CU, NG, GH, AU, PK, IN, DE };
const NATIONS: [string, number][] = [
  ["GB", 14], ["US", 16], ["MX", 14], ["IE", 3], ["PR", 4], ["JP", 6], ["PH", 5], ["KZ", 3], ["UA", 4],
  ["CU", 3], ["NG", 3], ["GH", 3], ["AU", 4], ["PK", 1], ["IN", 1], ["DE", 3],
];
const STYLES: Style[] = ["boxer", "puncher", "swarmer", "counter-puncher", "boxer-puncher", "brawler"];
const STYLE_BIAS: Record<Style, Partial<Ratings>> = {
  boxer: { speed: 4, skill: 6, defence: 4, power: -6 },
  puncher: { power: 8, chin: 2, speed: -2, defence: -4, skill: -2, stamina: -4 },
  swarmer: { stamina: 8, speed: 2, defence: -6, chin: 2, skill: -2 },
  "counter-puncher": { defence: 6, skill: 5, speed: 3, power: -2, stamina: -5 },
  "boxer-puncher": { power: 3, skill: 2 },
  brawler: { power: 5, chin: 5, defence: -8, skill: -6, stamina: 2, speed: -2 },
};
/** Pros per division in the generated pool; filled up to this total (real + generated). */
export const PROS_PER_DIVISION = 120;
export const PROSPECTS = 300;

const clamp = (n: number, lo = 1, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
export const START_YEAR = 2026;

function makeRatings(rng: Rng, ovr: number, style: Style): Ratings {
  const bias = STYLE_BIAS[style];
  const out = {} as Ratings;
  for (const k of ["power", "speed", "defence", "chin", "stamina", "skill"] as const) {
    out[k] = clamp(ovr + (bias[k] ?? 0) + rng.int(-5, 5));
  }
  return out;
}

export function generateName(rng: Rng, nat: string, used: Set<string>): string {
  const n = NAMES[nat] ?? NAMES.GB;
  for (let i = 0; i < 20; i++) {
    const name = `${rng.pick(n.first)} ${rng.pick(n.last)}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  const name = `${rng.pick(n.first)} ${rng.pick(n.last)} Jr`;
  used.add(name);
  return name;
}

interface GenOpts { year: number; prospect: boolean; idPrefix: string; n: number }
export function generateFighter(rng: Rng, division: Division, used: Set<string>, smallPromoters: string[], o: GenOpts): Fighter {
  const nat = rng.weighted(NATIONS);
  const style = rng.pick(STYLES);
  const name = generateName(rng, nat, used);
  const id = `${o.idPrefix}-${o.n}`;
  let age: number, ovr: number, pot: number, pro = true;
  if (o.prospect) {
    age = rng.int(17, 21);
    ovr = clamp(rng.normal(52, 6), 38, 68);
    pot = rng.weighted([[1, 25], [2, 30], [3, 25], [4, 14], [5, 6]]);
    pro = rng.chance(0.35);
  } else {
    age = rng.int(20, 38);
    ovr = clamp(rng.normal(62, 8), 42, 80);
    pot = age < 25 ? rng.weighted([[1, 15], [2, 30], [3, 30], [4, 18], [5, 7]]) : 1;
  }
  const fights = pro ? Math.max(0, Math.round((age - 19) * 2.2 + rng.int(-3, 4) + (ovr - 55) * 0.3)) : 0;
  const winP = Math.min(0.95, Math.max(0.35, 0.5 + (ovr - 58) / 40));
  let w = 0, l = 0, d = 0, ko = 0;
  for (let i = 0; i < fights; i++) {
    if (rng.chance(winP)) { w++; if (rng.chance(style === "puncher" || style === "brawler" ? 0.6 : 0.4)) ko++; }
    else if (rng.chance(0.06)) d++;
    else l++;
  }
  const ratings = makeRatings(rng, ovr, style);
  return {
    id, name, nationality: nat, born: o.year - age, division,
    record: { w, l, d, ko }, titles: [],
    promoter: pro && rng.chance(0.45) ? rng.pick(smallPromoters) : "independent",
    style, ratings, popularity: clamp(overall(ratings) / 3 + rng.int(-4, 6), 1, 40),
    real: false, potential: pot, pro,
    amateur: pro && !o.prospect ? undefined : { w: rng.int(8, 60), l: rng.int(0, 10) },
    morale: rng.int(55, 80), form: [], injuredWeeks: 0,
  };
}

export function createWorld(seed: number): { world: World; rngState: number } {
  const rng = new Rng(seed);
  const fighters: Record<string, Fighter> = {};
  const used = new Set<string>();
  const real = realFighters as unknown as (Omit<Fighter, "born" | "potential" | "pro" | "morale" | "form" | "injuredWeeks"> & { born: string })[];
  for (const r of real) {
    const f: Fighter = {
      ...r, born: Number(r.born), potential: Number(r.born) > START_YEAR - 25 ? rng.int(3, 5) : 1,
      pro: true, morale: rng.int(60, 80), form: [], injuredWeeks: 0,
    } as Fighter;
    fighters[f.id] = f; used.add(f.name);
  }
  const smallPromoters = (promoters as Promoter[]).filter((p) => !p.real && p.id !== "independent").map((p) => p.id);
  let n = 0;
  for (const div of DIVISIONS) {
    const have = Object.values(fighters).filter((f) => f.division === div && f.pro).length;
    for (let i = have; i < PROS_PER_DIVISION; i++) {
      const f = generateFighter(rng, div, used, smallPromoters, { year: START_YEAR, prospect: false, idPrefix: "gen", n: n++ });
      fighters[f.id] = f;
    }
  }
  for (let i = 0; i < PROSPECTS; i++) {
    const div = rng.weighted(DIVISIONS.map((d, k) => [d, k < 4 ? 14 : 8] as [Division, number]));
    const f = generateFighter(rng, div, used, smallPromoters, { year: START_YEAR, prospect: true, idPrefix: "pro", n: i });
    fighters[f.id] = f;
  }
  const beltMap = {} as World["belts"];
  for (const div of DIVISIONS) {
    beltMap[div] = {} as Record<WorldBody, string | null>;
    for (const b of WORLD_BODIES) beltMap[div][b] = (belts.world as Record<string, Record<string, string | null>>)[div]?.[b] ?? null;
  }
  return {
    world: { fighters, promoters: promoters as Promoter[], broadcasters: broadcasters as Broadcaster[], belts: beltMap },
    rngState: rng.state,
  };
}
