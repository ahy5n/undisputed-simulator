import { gameYear } from "./calendar";
import { inboxPush, newId } from "./matchmaking";
import { Rng } from "./rng";
import type { Camp, CampFocus, Fighter, GameSave, Ratings, ScheduledFight } from "./types";
import type { FightConfig } from "./fight";

export const CAMP_WEEKS = 8;
const GAIN = { light: 0.2, normal: 0.35, hard: 0.6 } as const;
const INJURY = { light: 0.003, normal: 0.01, hard: 0.04 } as const;
const COND = { light: 5, normal: 4, hard: 3 } as const;
export const SPARRING_COST = [0, 5_000, 15_000] as const;
const SPARRING_GAIN = [1, 1.25, 1.5] as const;
const SPARRING_INJURY = [0, 0.004, 0.008] as const;
const KEYS: (keyof Ratings)[] = ["power", "speed", "defence", "chin", "stamina", "skill"];

export const isMine = (g: GameSave, id: string) => g.world.fighters[id]?.promoter === "player";
export const campFor = (g: GameSave, fightId: string, fighterId: string) => g.camps.find((c) => c.fightId === fightId && c.fighterId === fighterId);

export function weightCut(condition: number): "easy" | "fine" | "tough" { return condition >= 85 ? "easy" : condition >= 70 ? "fine" : "tough"; }

/** Fight-night accuracy bonus from a game-plan camp (0 to 0.05) and sparring. */
export function planBonus(c: Camp | undefined): number {
  if (!c) return 0;
  const plan = c.focus === "gameplan" ? 0.04 * Math.min(1, c.weeksDone / 6) : 0;
  return plan + c.sparring * 0.005;
}

export function defaultCamp(g: GameSave, fight: ScheduledFight, fighterId: string): Camp {
  const f = g.world.fighters[fighterId];
  // default focus: the weakest rating that matters for his style
  const weakest = KEYS.reduce((a, k) => (f.ratings[k] < f.ratings[a] ? k : a), "power" as keyof Ratings);
  return { id: newId("camp", g), fightId: fight.id, fighterId, focus: weakest, intensity: "normal", sparring: 0, start: Math.max(g.week, fight.week - CAMP_WEEKS), condition: 60, weeksDone: 0, progress: 0, gained: 0, spent: 0 };
}

/** Make sure every player fighter on a scheduled fight has a camp. */
export function ensureCamps(g: GameSave): GameSave {
  let camps = g.camps;
  for (const fight of g.fights) {
    if (fight.done) continue;
    for (const id of [fight.a, fight.b]) {
      if (isMine(g, id) && !camps.some((c) => c.fightId === fight.id && c.fighterId === id)) camps = [...camps, defaultCamp({ ...g, camps }, fight, id)];
    }
  }
  const live = new Set(g.fights.filter((f) => !f.done).map((f) => f.id));
  camps = camps.filter((c) => live.has(c.fightId));
  return camps === g.camps ? g : { ...g, camps };
}

export function updateCamp(g: GameSave, campId: string, patch: Partial<Pick<Camp, "focus" | "intensity" | "sparring">>): GameSave {
  return { ...g, camps: g.camps.map((c) => (c.id === campId ? { ...c, ...patch } : c)) };
}

/** Weekly camp tick: gains, condition, sparring costs, injuries. */
export function campsWeek(g0: GameSave, rng: Rng): GameSave {
  let g = ensureCamps(g0);
  const year = gameYear(g.startDate, g.week);
  for (const c of [...g.camps]) {
    const fight = g.fights.find((f) => f.id === c.fightId);
    if (!fight || fight.done || g.week < c.start || c.injured) continue;
    const f = g.world.fighters[c.fighterId];
    if (f.retired) continue;
    const age = year - f.born;
    const next: Camp = { ...c, weeksDone: c.weeksDone + 1 };
    let gain = c.focus === "gameplan" ? 0 : GAIN[c.intensity] * SPARRING_GAIN[c.sparring];
    if (gain) {
      const cur = f.ratings[c.focus as keyof Ratings];
      gain *= (1 - cur / 130) * (age < 25 ? 1 + f.potential * 0.06 : age > 31 ? 0.5 : 1);
      next.progress += gain;
    }
    next.condition = Math.min(100, c.condition + COND[c.intensity] + (f.morale > 70 ? 1 : 0));
    const cost = SPARRING_COST[c.sparring];
    next.spent += cost;
    const comp = g.company.cash - cost;
    let fighters = g.world.fighters;
    const whole = Math.floor(next.progress);
    if (whole >= 1 && c.focus !== "gameplan") {
      next.progress -= whole; next.gained += whole;
      const k = c.focus as keyof Ratings;
      fighters = { ...fighters, [f.id]: { ...f, ratings: { ...f.ratings, [k]: Math.min(100, f.ratings[k] + whole) } } };
    }
    g = { ...g, company: { ...g.company, cash: comp }, world: { ...g.world, fighters }, camps: g.camps.map((x) => (x.id === c.id ? next : x)) };
    // injury in camp postpones the fight
    if (rng.chance(INJURY[c.intensity] + SPARRING_INJURY[c.sparring])) {
      const weeks = rng.int(3, 8);
      const delay = Math.max(0, weeks - (fight.week - g.week)) + rng.int(1, 3);
      const fighter = g.world.fighters[c.fighterId];
      g = {
        ...g,
        world: { ...g.world, fighters: { ...g.world.fighters, [fighter.id]: { ...fighter, injuredWeeks: weeks } } },
        fights: g.fights.map((x) => (x.id === fight.id ? { ...x, week: x.week + delay } : x)),
        shows: g.shows.map((s) => (s.fights.includes(fight.id) ? { ...s, week: s.week + delay } : s)),
        camps: g.camps.map((x) => (x.id === c.id ? { ...x, injured: false, start: x.start + delay, weeksDone: Math.max(0, x.weeksDone - 2) } : x)),
      };
      g = inboxPush(g, `${fighter.name} injured in camp`, `Out for ${weeks} weeks. The fight is postponed by ${delay} week${delay > 1 ? "s" : ""}${c.intensity === "hard" ? " (hard training raises injury risk)" : ""}.`, true);
    }
  }
  return g;
}

/** Condition and game-plan bonus for each side of a scheduled fight. */
export function fightConfigFor(g: GameSave, fight: ScheduledFight): FightConfig {
  const side = (id: string) => {
    const c = campFor(g, fight.id, id);
    const base = fight.rehydration ? 95 : 100;
    return { condition: c ? Math.min(base, c.condition) : Math.min(base, 88 + (g.world.fighters[id].ratings.stamina % 8)), plan: planBonus(c) };
  };
  const A = side(fight.a), B = side(fight.b);
  return { rounds: fight.rounds, conditionA: A.condition, conditionB: B.condition, planBonusA: A.plan, planBonusB: B.plan };
}
export type { Fighter, CampFocus };
