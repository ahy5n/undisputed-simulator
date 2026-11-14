import { campFor } from "./camps";
import { inboxPush } from "./matchmaking";
import type { Rng } from "./rng";
import type { FightResult } from "./fight";
import type { Rankings } from "./rankings";
import { WORLD_BODIES, type GameSave, type ScheduledFight } from "./types";

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const heat = (g: GameSave, a: string, b: string) => g.rivalries[pairKey(a, b)] ?? 0;
const mineOn = (g: GameSave, f: ScheduledFight) => [f.a, f.b].filter((id) => g.world.fighters[id]?.promoter === "player");
const clamp = (n: number) => Math.max(1, Math.min(100, n));

/** Big enough for a press conference: a title fight, a grudge match, or two real names. */
export function isBig(g: GameSave, f: ScheduledFight): boolean {
  const F = g.world.fighters;
  return f.titles.length > 0 || heat(g, f.a, f.b) > 0 || F[f.a].popularity + F[f.b].popularity >= 85;
}
export const pendingPressers = (g: GameSave) => g.fights.filter((f) => !f.done && f.presser === "pending");

export type Tone = "respectful" | "confident" | "trash" | "skip";
export const TONES: { id: Exclude<Tone, "skip">; label: string; line: string; effect: string }[] = [
  { id: "respectful", label: "Respectful", line: "He's a great fighter. May the best man win.", effect: "Both camps relaxed. No extra hype." },
  { id: "confident", label: "Confident", line: "We've done the work. My man wins, and wins well.", effect: "More ticket and PPV sales. Your fighter grows in belief." },
  { id: "trash", label: "Trash talk", line: "He's been protected his whole career. Saturday it ends.", effect: "Big hype, but it fires up the opponent and starts bad blood." },
];

export function answerPresser(g: GameSave, fightId: string, tone: Tone): GameSave {
  const f = g.fights.find((x) => x.id === fightId);
  if (!f || f.presser !== "pending") return g;
  const mine = mineOn(g, f);
  const fighters = { ...g.world.fighters };
  const mor = (id: string, d: number) => { fighters[id] = { ...fighters[id], morale: clamp(fighters[id].morale + d) }; };
  let hype = 1.03, rivalries = g.rivalries;
  if (tone === "respectful") { hype = 1; mor(f.a, 3); mor(f.b, 3); }
  if (tone === "confident") { hype = 1.1; mine.forEach((id) => mor(id, 4)); }
  if (tone === "trash") {
    hype = 1.25;
    mine.forEach((id) => mor(id, 2));
    [f.a, f.b].filter((id) => !mine.includes(id)).forEach((id) => mor(id, 7));
    rivalries = { ...rivalries, [pairKey(f.a, f.b)]: heat(g, f.a, f.b) + 1 };
  }
  return { ...g, rivalries, world: { ...g.world, fighters }, fights: g.fights.map((x) => (x.id === fightId ? { ...x, hype, presser: "done" } : x)) };
}

/** Called when a fight ends: close or disputed fights start (or stoke) a rivalry. */
export function rivalryAfter(g: GameSave, f: ScheduledFight, r: FightResult): GameSave {
  const close = r.method === "SD" || r.method === "MD" || r.method === "Draw" || r.controversial;
  if (!close) return g;
  const was = heat(g, f.a, f.b);
  const next = { ...g, rivalries: { ...g.rivalries, [pairKey(f.a, f.b)]: was + 1 } };
  const F = g.world.fighters;
  return mineOn(g, f).length && was === 0
    ? inboxPush(next, `Rivalry: ${F[f.a].name} and ${F[f.b].name}`, "That was close enough that everyone wants to see it again. A rematch would sell about 30% more.")
    : next;
}

export const RENEW_WEEKS = 4;

/** Weekly drama for your stable: press conferences, weigh-ins, contracts running out. */
export function dramaWeek(g: GameSave, rng: Rng, ranks: Rankings): GameSave {
  let cur = g;
  const F = () => cur.world.fighters;
  for (const f of g.fights) {
    if (f.done || !mineOn(cur, f).length) continue;
    const away = f.week - g.week;
    // press conference two weeks out; unanswered ones resolve neutrally on fight week
    if (!f.presser && away <= 2 && away >= 1 && isBig(cur, f)) {
      cur = { ...cur, fights: cur.fights.map((x) => (x.id === f.id ? { ...x, presser: "pending" } : x)) };
      cur = inboxPush(cur, `Press conference: ${F()[f.a].name} vs ${F()[f.b].name}`, "The cameras are waiting. Choose your tone under Fights, or skip it.", true);
    } else if (f.presser === "pending" && away <= 0) cur = answerPresser(cur, f.id, "skip");
    // weigh-in the week before
    if (away === 1 && !f.missedWeight) {
      for (const id of mineOn(cur, f)) {
        const c = campFor(cur, f.id, id);
        if (c && c.condition < 72 && rng.chance(0.35)) {
          const me = F()[id];
          cur = {
            ...cur,
            fights: cur.fights.map((x) => (x.id === f.id ? { ...x, missedWeight: id } : x)),
            camps: cur.camps.map((x) => (x.id === c.id ? { ...x, condition: Math.max(40, x.condition - 8) } : x)),
            world: { ...cur.world, fighters: { ...F(), [id]: { ...me, morale: clamp(me.morale - 6), popularity: clamp(me.popularity - 2) } } },
          };
          cur = inboxPush(cur, `${me.name} misses weight`, "A rushed camp caught up with him on the scales. He is drained and embarrassed going into the fight. Start camps earlier or train lighter.", true);
        }
      }
    }
  }
  // a top contender with nothing booked gets restless; rivals call out your names
  for (const id of g.company.stable) {
    const me = F()[id];
    if (!me || me.retired || cur.fights.some((x) => !x.done && (x.a === id || x.b === id))) continue;
    if (me.popularity >= 45 && rng.chance(0.03)) {
      const foes = Object.values(F()).filter((o) => o.pro && !o.retired && o.division === me.division && o.promoter !== "player" && Math.abs(o.popularity - me.popularity) < 25 && o.popularity >= 35);
      if (foes.length) {
        const foe = rng.pick(foes);
        cur = { ...cur, rivalries: { ...cur.rivalries, [pairKey(id, foe.id)]: heat(cur, id, foe.id) + 1 } };
        cur = inboxPush(cur, `${foe.name} calls out ${me.name}`, `"He's ducking me. Sign the contract." The public wants it now: that fight would sell about 30% more. Find him under Fights, Search.`);
      }
    }
    if (me.titles.length === 0 && me.morale > 30 && rng.chance(0.04)) {
      const top5 = WORLD_BODIES.some((b) => { const i = ranks[me.division][b].indexOf(id); return i >= 0 && i < 5; });
      if (top5) {
        cur = { ...cur, world: { ...cur.world, fighters: { ...F(), [id]: { ...me, morale: clamp(me.morale - 5) } } } };
        cur = inboxPush(cur, `${me.name} demands a title shot`, "He is ranked in the top five and tired of waiting. His morale is dropping. Unhappy fighters ask for more money at renewal.", true);
      }
    }
  }
  // contracts that have run out
  for (const id of g.company.stable) {
    const me = F()[id];
    if (!me?.contract || me.contract.fightsLeft > 0) continue;
    if (cur.fights.some((x) => !x.done && (x.a === id || x.b === id))) continue;
    if (me.contract.expiredWeek === undefined) {
      cur = { ...cur, world: { ...cur.world, fighters: { ...F(), [id]: { ...me, contract: { ...me.contract, expiredWeek: g.week } } } } };
      cur = inboxPush(cur, `${me.name}'s contract is up`, `He has fought the last fight on his deal. Offer new terms from the Stable within ${RENEW_WEEKS} weeks or he becomes a free agent.`, true);
    } else if (g.week - me.contract.expiredWeek >= RENEW_WEEKS) {
      cur = { ...cur, company: { ...cur.company, stable: cur.company.stable.filter((x) => x !== id) }, world: { ...cur.world, fighters: { ...F(), [id]: { ...me, promoter: "independent", contract: undefined } } } };
      cur = inboxPush(cur, `${me.name} leaves`, "His contract ran out with no new offer. He is a free agent.");
    }
  }
  return cur;
}
