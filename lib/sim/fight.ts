import type { Rng } from "./rng";
import type { Fighter, Ratings, Style } from "./types";

/**
 * Fight engine. Pure and seeded. One round at a time (`playRound`) so the live view can drive it,
 * or the whole fight (`simulateFight`) for a quick sim.
 */

export type Tactic = "balanced" | "box-and-move" | "pressure" | "body" | "counter" | "clinch" | "go-for-ko";
export type Shout = "jab" | "move" | "body" | "tie-up" | "hands";
export const TACTICS: Tactic[] = ["balanced", "box-and-move", "pressure", "body", "counter", "clinch", "go-for-ko"];

interface TacticMod { out: number; acc: number; def: number; power: number; dmg: number; stam: number; ko: number; bodyStam: number; clinch: number }
const T: Record<Tactic, TacticMod> = {
  balanced:       { out: 1.0, acc: 1.0, def: 1.0, power: 1.0, dmg: 1.0, stam: 1.0, ko: 1.0, bodyStam: 1, clinch: 0 },
  "box-and-move": { out: 0.9, acc: 1.04, def: 1.14, power: 0.8, dmg: 0.9, stam: 0.85, ko: 0.8, bodyStam: 1, clinch: 0 },
  pressure:       { out: 1.14, acc: 0.98, def: 0.9, power: 1.08, dmg: 1.04, stam: 1.2, ko: 1.15, bodyStam: 1, clinch: 0 },
  body:           { out: 1.0, acc: 1.0, def: 0.97, power: 1.05, dmg: 0.88, stam: 1.05, ko: 0.9, bodyStam: 2.6, clinch: 0 },
  counter:        { out: 0.78, acc: 1.12, def: 1.08, power: 1.05, dmg: 1.05, stam: 0.8, ko: 1.0, bodyStam: 1, clinch: 0 },
  clinch:         { out: 0.6, acc: 0.95, def: 1.1, power: 0.7, dmg: 0.7, stam: 0.5, ko: 0.5, bodyStam: 1, clinch: 1 },
  "go-for-ko":    { out: 1.1, acc: 0.93, def: 0.82, power: 1.22, dmg: 1.12, stam: 1.3, ko: 1.45, bodyStam: 1, clinch: 0 },
};

/** Rock-paper-scissors layer. Positive = row style has the edge over column style. */
const EDGE: Record<Style, Partial<Record<Style, number>>> = {
  "counter-puncher": { swarmer: 1, brawler: 0.5, boxer: -0.3, "boxer-puncher": -0.2 },
  swarmer: { boxer: 1, "counter-puncher": -1, puncher: 0.3 },
  boxer: { puncher: 1, swarmer: -1, brawler: 0.4 },
  puncher: { "counter-puncher": 0.4, boxer: -1, swarmer: -0.3, brawler: 0.3 },
  brawler: { "counter-puncher": -0.5, boxer: -0.4, puncher: -0.3 },
  "boxer-puncher": { "counter-puncher": 0.2 },
};
export function matchup(a: Style, b: Style): number {
  const v = (EDGE[a][b] ?? 0) - (EDGE[b][a] ?? 0);
  return Math.max(-1, Math.min(1, v));
}

export interface FightConfig {
  rounds: number; // 4-12
  homeSide?: "a" | "b";
  /** fight-night bonuses from camp: game-plan accuracy bonus (0-0.05) */
  planBonusA?: number;
  planBonusB?: number;
  /** starting condition 0-100 (training camp / weight cut) */
  conditionA?: number;
  conditionB?: number;
}

export interface Corner {
  fighter: Fighter;
  stamina: number; // 0-100 current
  damage: number; // accumulated, ~0-100+
  knockdowns: number;
  cut: number; // 0-3
  swelling: number; // 0-3
  deductions: number;
  morale: number;
  /** fight-night form, ~0.9-1.1: good and bad nights */
  form: number;
  stats: PunchStats;
}
export interface PunchStats { thrown: number; landed: number; jabsThrown: number; jabsLanded: number; powerThrown: number; powerLanded: number }
const emptyStats = (): PunchStats => ({ thrown: 0, landed: 0, jabsThrown: 0, jabsLanded: 0, powerThrown: 0, powerLanded: 0 });

export type FightEvent =
  | { type: "knockdown"; side: "a" | "b"; round: number; count: number }
  | { type: "stoppage"; side: "a" | "b"; round: number; reason: "ko" | "tko" | "cut" | "corner" | "referee" }
  | { type: "cut"; side: "a" | "b"; round: number; severity: number }
  | { type: "swelling"; side: "a" | "b"; round: number }
  | { type: "deduction"; side: "a" | "b"; round: number; reason: string }
  | { type: "hurt"; side: "a" | "b"; round: number }
  | { type: "exchange"; side: "a" | "b"; round: number; kind: "jab" | "power" | "body" | "counter" | "combo" }
  | { type: "clinch"; round: number }
  | { type: "shout"; side: "a" | "b"; round: number; shout: Shout; followed: boolean };

export interface RoundSummary {
  round: number;
  a: PunchStats; b: PunchStats; // this round only
  events: FightEvent[];
  cards: [number, number][]; // [judge] -> [a,b] this round
  ended: boolean;
}

export type Method = "KO" | "TKO" | "UD" | "SD" | "MD" | "Draw" | "DQ" | "TD";
export interface FightResult {
  winner: "a" | "b" | null;
  method: Method;
  round: number; // round it ended (or last round)
  scheduled: number;
  scorecards: { a: number; b: number }[];
  stats: { a: PunchStats; b: PunchStats };
  knockdowns: { a: number; b: number };
  rounds: RoundSummary[];
  controversial: boolean;
  /** 0-100 how exciting; drives popularity gains */
  excitement: number;
  stoppage?: FightEvent;
}

export interface Judge { bias: "home" | "aggression" | "clean"; strength: number; noise: number }

export interface FightState {
  cfg: FightConfig;
  a: Corner; b: Corner;
  round: number; // rounds completed
  judges: Judge[];
  scores: { a: number; b: number }[]; // per judge running totals
  roundsLog: RoundSummary[];
  over: boolean;
  result?: FightResult;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function mkCorner(f: Fighter, condition: number, form: number): Corner {
  return { fighter: f, stamina: clamp(condition, 40, 100), damage: 0, knockdowns: 0, cut: 0, swelling: 0, deductions: 0, morale: f.morale, form, stats: emptyStats() };
}

export function initFight(a: Fighter, b: Fighter, cfg: FightConfig, rng: Rng): FightState {
  const judges: Judge[] = [0, 1, 2].map(() => ({
    bias: rng.pick(["home", "aggression", "clean"] as const),
    strength: rng.int(2, 6) / 10,
    noise: 0.9 + rng.next() * 0.7,
  }));
  return {
    cfg,
    a: mkCorner(a, cfg.conditionA ?? 100, clamp(rng.normal(1, 0.045), 0.88, 1.12)),
    b: mkCorner(b, cfg.conditionB ?? 100, clamp(rng.normal(1, 0.045), 0.88, 1.12)),
    round: 0, judges, scores: judges.map(() => ({ a: 0, b: 0 })), roundsLog: [], over: false,
  };
}

/** Pull ratings toward the mean so rating gaps translate into believable (not absolute) edges. */
const COMPRESS = 0.52;
const squash = (v: number) => 62 + (v - 62) * COMPRESS;

function effRatings(c: Corner): Ratings {
  const sf = 0.72 + 0.28 * (c.stamina / 100);
  const rr = c.fighter.ratings;
  const r: Ratings = { power: squash(rr.power), speed: squash(rr.speed), defence: squash(rr.defence), chin: squash(rr.chin), stamina: squash(rr.stamina), skill: squash(rr.skill) };
  const swell = 1 - c.swelling * 0.03;
  const f = c.form;
  return {
    power: r.power * (0.92 + 0.08 * (c.stamina / 100)) * f,
    speed: r.speed * sf * swell * f,
    defence: r.defence * sf * (1 - c.damage / 400) * f,
    chin: r.chin * (0.5 + 0.5 * f),
    stamina: r.stamina,
    skill: r.skill * f,
  };
}

const SHOUT_FX: Record<Shout, Partial<TacticMod>> = {
  jab: { acc: 1.05, power: 0.9, dmg: 0.97 },
  move: { def: 1.1, out: 0.95, stam: 0.95 },
  body: { bodyStam: 1.8, dmg: 0.96 },
  "tie-up": { clinch: 0.6, out: 0.85, stam: 0.7 },
  hands: { out: 1.12, stam: 1.12, acc: 0.97 },
};

function mergeMod(t: Tactic, shouts: { shout: Shout; on: boolean }[]): TacticMod {
  const m = { ...T[t] };
  for (const s of shouts) {
    if (!s.on) continue;
    const fx = SHOUT_FX[s.shout];
    for (const k of Object.keys(fx) as (keyof TacticMod)[]) {
      if (k === "clinch") m.clinch = Math.min(1, m.clinch + (fx[k] ?? 0));
      else m[k] = m[k] * (fx[k] as number);
    }
  }
  return m;
}

interface Exchange { thrown: number; jabs: number; power: number; landedJabs: number; landedPower: number; dmg: number; bodyShots: number }

function exchange(att: Corner, def: Corner, am: TacticMod, dm: TacticMod, rng: Rng, planBonus: number): Exchange {
  const A = effRatings(att), D = effRatings(def);
  const styleOut = ({ swarmer: 0.15, "counter-puncher": -0.1, puncher: -0.05, brawler: 0.05, boxer: 0, "boxer-puncher": 0 } as Record<Style, number>)[att.fighter.style];
  const clinchLoss = 1 - 0.5 * (am.clinch + dm.clinch > 0 ? Math.min(1, am.clinch + dm.clinch) : 0);
  const thrown = Math.max(8, Math.round((34 + 0.4 * A.speed) * am.out * (0.55 + 0.45 * (att.stamina / 100)) * (1 + styleOut) * clinchLoss * (0.92 + rng.next() * 0.16)));
  const edge = matchup(att.fighter.style, def.fighter.style);
  const offAcc = 0.5 * A.speed + 0.5 * A.skill;
  const defScore = (0.7 * D.defence + 0.3 * D.speed) * dm.def;
  const acc = clamp((0.285 + (offAcc - defScore) / 380 + planBonus) * (1 + edge * 0.065) * am.acc * clamp(rng.normal(1, 0.1), 0.75, 1.25), 0.1, 0.5);
  const styleP = ({ puncher: 0.1, brawler: 0.08, boxer: -0.08, "counter-puncher": 0.02, swarmer: 0.0, "boxer-puncher": 0.04 } as Record<Style, number>)[att.fighter.style];
  const powerShare = clamp((0.28 + 0.3 * (A.power / 100) + styleP) * am.power, 0.15, 0.75);
  const power = Math.round(thrown * powerShare);
  const jabs = thrown - power;
  const landedJabs = Math.round(jabs * acc * 1.15 * (0.9 + rng.next() * 0.2));
  const landedPower = Math.round(power * acc * 0.85 * (0.85 + rng.next() * 0.3));
  const resist = 0.5 + D.chin / 100;
  const dmg = ((landedPower * (0.55 + (A.power / 100) * 0.95) + landedJabs * 0.1) * am.dmg) / resist;
  return { thrown, jabs, power, landedJabs, landedPower, dmg, bodyShots: Math.round(landedPower * 0.35 * (am.bodyStam > 1 ? 2 : 1)) };
}

export function aiTactic(self: Corner, opp: Corner, state: FightState, side: "a" | "b", rng: Rng): Tactic {
  const r = state.round;
  const myCard = state.scores.reduce((s, j) => s + (side === "a" ? j.a - j.b : j.b - j.a), 0) / 3;
  const left = state.cfg.rounds - r;
  if (self.damage > 55 && rng.chance(0.6)) return rng.chance(0.5) ? "clinch" : "box-and-move";
  if (myCard < -6 && left <= 4) return "go-for-ko";
  if (myCard < -2 && left <= 6) return "pressure";
  if (self.stamina < 35) return rng.chance(0.5) ? "box-and-move" : "clinch";
  if (opp.damage > 45 && self.fighter.ratings.power > 70) return "go-for-ko";
  switch (self.fighter.style) {
    case "boxer": return rng.pick<Tactic>(["box-and-move", "balanced", "box-and-move"]);
    case "puncher": return rng.pick<Tactic>(["balanced", "body", "go-for-ko", "balanced"]);
    case "swarmer": return rng.pick<Tactic>(["pressure", "body", "pressure"]);
    case "counter-puncher": return rng.pick<Tactic>(["counter", "balanced", "counter"]);
    case "brawler": return rng.pick<Tactic>(["pressure", "go-for-ko", "balanced"]);
    default: return rng.pick<Tactic>(["balanced", "body", "box-and-move"]);
  }
}

export interface RoundInput { tactic: Tactic; shouts?: Shout[]; fireUp?: boolean; calm?: boolean }

/** Play one round. Mutates and returns state. */
export function playRound(state: FightState, inA: RoundInput, inB: RoundInput, rng: Rng): RoundSummary {
  const round = state.round + 1;
  const events: FightEvent[] = [];
  const mk = (c: Corner, input: RoundInput, side: "a" | "b") => {
    const sh = (input.shouts ?? []).slice(0, 2).map((s) => {
      const on = rng.chance(0.5 + c.fighter.ratings.skill / 200);
      events.push({ type: "shout", side, round, shout: s, followed: on });
      return { shout: s, on };
    });
    const m = mergeMod(input.tactic, sh);
    if (input.fireUp) { m.out *= 1.06; m.def *= 0.96; m.ko *= 1.05; }
    if (input.calm) { m.stam *= 0.85; m.def *= 1.04; m.out *= 0.97; }
    return m;
  };
  const ma = mk(state.a, inA, "a"), mb = mk(state.b, inB, "b");
  const pa = state.cfg.planBonusA ?? 0, pb = state.cfg.planBonusB ?? 0;
  const ea = exchange(state.a, state.b, ma, mb, rng, pa);
  const eb = exchange(state.b, state.a, mb, ma, rng, pb);

  const apply = (att: Corner, def: Corner, ex: Exchange, am: TacticMod, dm: TacticMod, attSide: "a" | "b", defSide: "a" | "b") => {
    att.stats.thrown += ex.thrown; att.stats.landed += ex.landedJabs + ex.landedPower;
    att.stats.jabsThrown += ex.jabs; att.stats.jabsLanded += ex.landedJabs;
    att.stats.powerThrown += ex.power; att.stats.powerLanded += ex.landedPower;
    def.damage += ex.dmg;
    def.stamina = Math.max(5, def.stamina - ex.landedPower * 0.1 * am.bodyStam);
    const A = effRatings(att), D = effRatings(def);
    const resist = 0.5 + D.chin / 100;
    // knockdown chance
    const fatigue = 1 + (1 - def.stamina / 100) * 0.7;
    const pKd = clamp(
      ex.landedPower * 0.0025 * Math.pow(A.power / 65, 1.5) * Math.pow(1 / resist, 1.6) * (1 + def.damage / 55) * fatigue * am.ko * (1 - 0.35 * dm.clinch) * (def.knockdowns ? 1.12 : 1),
      0, 0.65,
    );
    let kdThisRound = 0;
    let stopped = false;
    while (kdThisRound < 3 && rng.chance(kdThisRound === 0 ? pKd : pKd * 0.45)) {
      kdThisRound++; def.knockdowns++; def.damage += 7;
      events.push({ type: "knockdown", side: defSide, round, count: def.knockdowns });
      const pGetUp = clamp(0.95 - (def.damage / 100) * 0.34 - (def.knockdowns - 1) * 0.09 - (1 - def.stamina / 100) * 0.18 + (D.chin - 60) / 400, 0.08, 0.97);
      if (!rng.chance(pGetUp)) { stopped = true; events.push({ type: "stoppage", side: defSide, round, reason: "ko" }); break; }
      if (kdThisRound >= 3) { stopped = true; events.push({ type: "stoppage", side: defSide, round, reason: "tko" }); break; }
    }
    if (!stopped && def.damage > 20 && rng.chance(0.15 * (def.damage / 60))) events.push({ type: "hurt", side: defSide, round });
    // cuts and swelling
    if (rng.chance(ex.landedPower * 0.0035) && def.cut < 3) { def.cut++; events.push({ type: "cut", side: defSide, round, severity: def.cut }); }
    if (rng.chance(ex.landedPower * 0.003) && def.swelling < 3) { def.swelling++; events.push({ type: "swelling", side: defSide, round }); }
    // exchange flavour
    if (ex.landedPower >= 6 && rng.chance(0.6)) events.push({ type: "exchange", side: attSide, round, kind: am.bodyStam > 1 ? "body" : am === T.counter ? "counter" : "power" });
    else if (ex.landedJabs >= 5 && rng.chance(0.5)) events.push({ type: "exchange", side: attSide, round, kind: "jab" });
    return stopped;
  };

  const startA = { ...state.a.stats }, startB = { ...state.b.stats };
  let stopped = false;
  let stopSide: "a" | "b" | null = null;
  const sA = apply(state.a, state.b, ea, ma, mb, "a", "b");
  if (sA) { stopped = true; stopSide = "b"; }
  const sB = !stopped ? apply(state.b, state.a, eb, mb, ma, "b", "a") : false;
  if (sB) { stopped = true; stopSide = "a"; }

  // clinching and fouls
  if (ma.clinch + mb.clinch > 0) events.push({ type: "clinch", round });
  for (const [c, m, side] of [[state.a, ma, "a"], [state.b, mb, "b"]] as const) {
    const pFoul = (c.fighter.style === "brawler" ? 0.035 : 0.012) + m.clinch * 0.03;
    if (!stopped && rng.chance(pFoul)) { c.deductions++; events.push({ type: "deduction", side, round, reason: m.clinch ? "holding" : "low blow" }); }
  }
  // referee / doctor stoppages
  if (!stopped) {
    for (const [c, side] of [[state.a, "a"], [state.b, "b"]] as const) {
      const thresh = 40 + c.fighter.ratings.chin * 0.5;
      const pRef = c.damage > thresh ? clamp((c.damage - thresh) / 38, 0, 0.7) * (1.1 - c.stamina / 200) : 0;
      if (rng.chance(pRef)) { stopped = true; stopSide = side; events.push({ type: "stoppage", side, round, reason: "referee" }); break; }
      if (c.cut >= 3 && rng.chance(0.16 * (c.cut - 2) + 0.1)) { stopped = true; stopSide = side; events.push({ type: "stoppage", side, round, reason: "cut" }); break; }
    }
  }

  // scoring: each judge scores the round
  const rs = (ex: Exchange, kd: number) => ex.landedPower * 1.7 + ex.landedJabs * 0.95 + kd * 6;
  const kdA = events.filter((e) => e.type === "knockdown" && e.side === "b").length; // A scored knockdowns
  const kdB = events.filter((e) => e.type === "knockdown" && e.side === "a").length;
  const scoreA = rs(ea, kdA), scoreB = rs(eb, kdB);
  const cards: [number, number][] = [];
  state.judges.forEach((j) => {
    let d = scoreA - scoreB + rng.normal(0, 1.6 * j.noise);
    if (j.bias === "home" && state.cfg.homeSide) d += (state.cfg.homeSide === "a" ? 1 : -1) * j.strength * 5;
    if (j.bias === "aggression") d += (ea.thrown - eb.thrown) * 0.12 * j.strength * 2;
    if (j.bias === "clean") d += (ea.landedJabs + ea.landedPower - eb.landedJabs - eb.landedPower) * 0.5 * j.strength;
    let a = 10, b = 10;
    if (Math.abs(d) < 0.15) d = rng.chance(0.5) ? 0.2 : -0.2;
    if (d > 0) { b = kdA >= 2 ? 7 : kdA === 1 || d > 22 ? 8 : 9; } else { a = kdB >= 2 ? 7 : kdB === 1 || d < -22 ? 8 : 9; }
    cards.push([a, b]);
  });
  // deductions applied to the round they occurred in
  events.forEach((e) => {
    if (e.type === "deduction") cards.forEach((c) => { if (e.side === "a") c[0] -= 1; else c[1] -= 1; });
  });
  cards.forEach(([a, b], i) => { state.scores[i].a += a; state.scores[i].b += b; });

  // between-round recovery
  for (const [c, m] of [[state.a, ma], [state.b, mb]] as const) {
    const thrown = c === state.a ? ea.thrown : eb.thrown;
    const cost = (4 + thrown / 11) * m.stam * (1.12 - c.fighter.ratings.stamina / 180);
    c.stamina = clamp(c.stamina - cost + (3 + c.fighter.ratings.stamina / 14) * 0.45 + m.clinch * 4, 5, 100);
    c.damage = Math.max(0, c.damage - (1.2 + c.fighter.ratings.skill / 100));
  }

  state.round = round;
  const summary: RoundSummary = {
    round,
    a: diff(state.a.stats, startA), b: diff(state.b.stats, startB),
    events, cards, ended: stopped || round >= state.cfg.rounds,
  };
  state.roundsLog.push(summary);

  if (stopped && stopSide) {
    const stop = events.find((e) => e.type === "stoppage") as Extract<FightEvent, { type: "stoppage" }>;
    finish(state, stopSide === "a" ? "b" : "a", stop.reason === "ko" ? "KO" : "TKO", stop);
  } else if (round >= state.cfg.rounds) {
    decide(state);
  }
  return summary;
}

function diff(a: PunchStats, b: PunchStats): PunchStats {
  return { thrown: a.thrown - b.thrown, landed: a.landed - b.landed, jabsThrown: a.jabsThrown - b.jabsThrown, jabsLanded: a.jabsLanded - b.jabsLanded, powerThrown: a.powerThrown - b.powerThrown, powerLanded: a.powerLanded - b.powerLanded };
}

function excitement(s: FightState, method: Method): number {
  const kd = s.a.knockdowns + s.b.knockdowns;
  const landed = s.a.stats.landed + s.b.stats.landed;
  const base = 30 + Math.min(25, landed / (s.round * 6)) + kd * 9 + (method === "KO" ? 18 : method === "TKO" ? 12 : 0);
  const close = Math.abs(s.scores.reduce((t, j) => t + j.a - j.b, 0)) < 6 ? 10 : 0;
  return clamp(Math.round(base + close), 0, 100);
}

function finish(state: FightState, winner: "a" | "b" | null, method: Method, stoppage?: FightEvent) {
  const sa = state.a.stats, sb = state.b.stats;
  state.over = true;
  state.result = {
    winner, method, round: state.round, scheduled: state.cfg.rounds,
    scorecards: state.scores.map((s) => ({ ...s })), stats: { a: sa, b: sb },
    knockdowns: { a: state.a.knockdowns, b: state.b.knockdowns }, rounds: state.roundsLog,
    controversial: false, excitement: excitement(state, method), stoppage,
  };
}

function decide(state: FightState) {
  const tally = { a: 0, b: 0, d: 0 };
  for (const s of state.scores) { if (s.a > s.b) tally.a++; else if (s.b > s.a) tally.b++; else tally.d++; }
  let winner: "a" | "b" | null = null;
  let method: Method = "Draw";
  if (tally.a === 3 || tally.b === 3) { winner = tally.a === 3 ? "a" : "b"; method = "UD"; }
  else if (tally.a === 2 && tally.b === 1 || tally.b === 2 && tally.a === 1) { winner = tally.a === 2 ? "a" : "b"; method = "SD"; }
  else if (tally.a === 2 && tally.d === 1 || tally.b === 2 && tally.d === 1) { winner = tally.a === 2 ? "a" : "b"; method = "MD"; }
  else if (tally.a === 1 && tally.b === 0 && tally.d === 2) { winner = null; method = "Draw"; }
  else if (tally.b === 1 && tally.a === 0 && tally.d === 2) { winner = null; method = "Draw"; }
  finish(state, winner, method);
  const r = state.result!;
  const aL = state.a.stats.landed, bL = state.b.stats.landed;
  const share = aL + bL ? (aL - bL) / (aL + bL) : 0;
  r.controversial = winner !== null && ((winner === "a" && share < -0.05) || (winner === "b" && share > 0.05));
}

/** Quick sim: AI picks tactics for both corners. */
export function simulateFight(a: Fighter, b: Fighter, cfg: FightConfig, rng: Rng): FightResult {
  const st = initFight(a, b, cfg, rng);
  while (!st.over) {
    const ta = aiTactic(st.a, st.b, st, "a", rng);
    const tb = aiTactic(st.b, st.a, st, "b", rng);
    playRound(st, { tactic: ta }, { tactic: tb }, rng);
  }
  return st.result!;
}

export function describeResult(a: Fighter, b: Fighter, r: FightResult): string {
  if (!r.winner) return `Draw after ${r.scheduled} rounds`;
  const w = r.winner === "a" ? a : b;
  if (r.method === "KO" || r.method === "TKO") return `${w.name} wins by ${r.method} in round ${r.round}`;
  return `${w.name} wins by ${r.method === "UD" ? "unanimous" : r.method === "SD" ? "split" : "majority"} decision`;
}

/** Cutman between rounds: reduces cut and swelling by one level and eases accumulated damage a little. */
export function cutman(state: FightState, side: "a" | "b"): void {
  const c = state[side];
  c.cut = Math.max(0, c.cut - 1);
  c.swelling = Math.max(0, c.swelling - 1);
  c.damage = Math.max(0, c.damage - 3);
}

/** Corner throws in the towel: the other fighter wins by TKO. */
export function throwTowel(state: FightState, side: "a" | "b"): void {
  if (state.over) return;
  const stop: FightEvent = { type: "stoppage", side, round: state.round, reason: "corner" };
  state.roundsLog[state.roundsLog.length - 1]?.events.push(stop);
  finish(state, side === "a" ? "b" : "a", "TKO", stop);
}
