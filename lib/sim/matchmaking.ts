import { askPurse } from "./contracts";
import { gameYear } from "./calendar";
import { matchup } from "./fight";
import { overall } from "./fighter";
import { crossFactor } from "./broadcast";
import { RANK_SIZE, type Rankings } from "./rankings";
import { DIVISIONS, WORLD_BODIES, type Division, type Fighter, type FightTerms, type GameSave, type ScheduledFight, type WorldBody } from "./types";

export const CAMP_MIN = 6;
export const CAMP_DEFAULT = 10;
const divIndex = (d: Division) => DIVISIONS.indexOf(d);
const yearOf = (g: GameSave) => gameYear(g.startDate, g.week);

/** Win probability for a over b. Logistic fit to the fight engine (gap 0-3 ≈ 56%, 10 ≈ 84%, 20+ ≈ 99%). */
export function winChance(a: Fighter, b: Fighter): number {
  const d = overall(a.ratings) - overall(b.ratings);
  return 1 / (1 + Math.exp(-(0.166 * d + 0.25 * matchup(a.style, b.style))));
}

export const upcoming = (g: GameSave) => g.fights.filter((f) => !f.done);
const bookIdx = new WeakMap<ScheduledFight[], Map<string, number[]>>();
function booked(g: GameSave): Map<string, number[]> {
  let m = bookIdx.get(g.fights);
  if (!m) {
    m = new Map();
    for (const f of g.fights) if (!f.done) for (const id of [f.a, f.b]) { const l = m.get(id); if (l) l.push(f.week); else m.set(id, [f.week]); }
    bookIdx.set(g.fights, m);
  }
  return m;
}
export function fightOf(g: GameSave, id: string, week?: number): ScheduledFight | undefined {
  return upcoming(g).find((f) => (f.a === id || f.b === id) && (week === undefined || Math.abs(f.week - week) < CAMP_MIN));
}
/** Free for a fight in `week`: not retired, healthy by then, and no other fight within six weeks. */
export function isFree(g: GameSave, id: string, week: number): boolean {
  const f = g.world.fighters[id];
  if (!f || f.retired || !f.pro) return false;
  if (f.injuredWeeks > week - g.week) return false;
  return !(booked(g).get(id) ?? []).some((w) => Math.abs(w - week) < CAMP_MIN);
}

export interface RankInfo { body: WorldBody; rank: number } // rank 0 = champion
export function rankIn(g: GameSave, r: Rankings, f: Fighter, body: WorldBody): number | null {
  if (g.world.belts[f.division][body] === f.id) return 0;
  const i = r[f.division][body].indexOf(f.id);
  return i < 0 ? null : i + 1;
}
export function bestRank(g: GameSave, r: Rankings, f: Fighter): RankInfo | null {
  let best: RankInfo | null = null;
  for (const body of WORLD_BODIES) {
    const k = rankIn(g, r, f, body);
    if (k !== null && (!best || k < best.rank)) best = { body, rank: k };
  }
  return best;
}

export interface Candidate {
  fighter: Fighter; winChance: number; styleEdge: number; terms: FightTerms;
  gain: RankInfo | null; titles: WorldBody[]; why: string; score: number;
}

const isUnderdogPremium = (wc: number) => 1 + Math.max(0, 0.5 - wc) * 1.2;

export function defaultTerms(g: GameSave, mine: Fighter, opp: Fighter, titles: WorldBody[] = []): FightTerms {
  const y = yearOf(g);
  const title = titles.length > 0;
  const cross = crossFactor(g, mine, opp);
  const champOpp = title && titles.some((b) => g.world.belts[opp.division][b] === opp.id);
  const wcOpp = 1 - winChance(mine, opp);
  const theirs = askPurse(opp, y) * (champOpp ? 1.4 : title ? 1.2 : 1) * isUnderdogPremium(wcOpp) * cross;
  const mineP = askPurse(mine, y) * (title ? 1.2 : 1);
  const r = (n: number) => Math.round(n / 1000) * 1000;
  return { purseA: r(mineP), purseB: r(theirs), titles, rounds: title ? 12 : overall(mine.ratings) > 70 ? 10 : 8, rematch: false, rehydration: false };
}

function describe(g: GameSave, r: Rankings, mine: Fighter, opp: Fighter, wc: number, edge: number): { why: string; gain: RankInfo | null; titles: WorldBody[] } {
  let gain: RankInfo | null = null;
  let titles: WorldBody[] = [];
  for (const body of WORLD_BODIES) {
    const my = rankIn(g, r, mine, body), op = rankIn(g, r, opp, body);
    if (op === null || mine.division !== opp.division) continue;
    if (op === 0) { if (my !== null) titles = [...titles, body]; continue; } // a champion's place is only won in a title fight
    const myK = my ?? RANK_SIZE + 1;
    if (op < myK && (!gain || myK - op > RANK_SIZE + 1 - gain.rank)) gain = { body, rank: op };
  }
  if (titles.length) return { why: `${titles.join("/")} title shot`, gain, titles };
  if (gain) {
    const myAny = bestRank(g, r, mine);
    if (gain.rank <= 10 && (!myAny || myAny.rank > 10)) return { why: `Gets you into the ${gain.body} top 10`, gain, titles };
    if (!myAny) return { why: `Gets you into the ${gain.body} top 15`, gain, titles };
    return { why: `Beat the #${gain.rank} ${gain.body} contender`, gain, titles };
  }
  if (edge > 0.3) return { why: "Your style gives you the edge", gain, titles };
  if (wc >= 0.75) return { why: `Safe step-up: ${Math.round(wc * 100)}% to win`, gain, titles };
  if (opp.popularity >= 60) return { why: "Big name: sells tickets", gain, titles };
  return { why: `Keeps you active against a ${opp.style}`, gain, titles };
}

/** All sensible opponents in tiers: same division band, wider band, adjacent divisions. */
export function candidates(g: GameSave, r: Rankings, mine: Fighter, week: number, maxDivs = 0): Candidate[] {
  const mo = overall(mine.ratings);
  const out: Candidate[] = [];
  for (const o of Object.values(g.world.fighters)) {
    if (o.id === mine.id || !o.pro || o.retired || o.promoter === "player") continue;
    const dd = Math.abs(divIndex(o.division) - divIndex(mine.division));
    if (dd > maxDivs) continue;
    if (!isFree(g, o.id, week)) continue;
    const gap = overall(o.ratings) - mo;
    if (dd === 0 && Math.abs(gap) > 20) continue;
    const wc = winChance(mine, o);
    const edge = matchup(mine.style, o.style);
    const d = describe(g, r, mine, o, wc, edge);
    const sweet = wc >= 0.4 && wc <= 0.85 ? 1 : wc > 0.85 ? 0.3 : wc >= 0.25 ? 0.2 : -2.5;
    const gainScore = d.gain ? (RANK_SIZE + 1 - d.gain.rank) / RANK_SIZE : 0;
    const score = sweet + gainScore * 2 + (d.titles.length && wc >= 0.15 ? 3 : 0) + o.popularity / 150 - (dd ? 0.5 : 0) - Math.abs(gap) / 80;
    out.push({ fighter: o, winChance: wc, styleEdge: edge, terms: defaultTerms(g, mine, o, d.titles), gain: d.gain, titles: d.titles, why: d.why, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Five suggested opponents. Never empty: widens to adjacent divisions if needed. */
export function shortlist(g: GameSave, r: Rankings, mine: Fighter, week = g.week + CAMP_DEFAULT): Candidate[] {
  let list = candidates(g, r, mine, week, 0);
  if (list.length < 5) {
    const wider = candidates(g, r, mine, week, 1).filter((c) => !list.some((x) => x.fighter.id === c.fighter.id));
    list = [...list, ...wider];
  }
  // always include one safer fight so the manager can choose to build a record
  const top = list.slice(0, 4);
  const safe = list.slice(4).find((c) => c.winChance >= 0.65 && c.winChance <= 0.93) ?? list.slice(0, 4).find((c) => c.winChance >= 0.65);
  const rest = list.filter((c) => !top.includes(c));
  return (safe && !top.includes(safe) ? [...top, safe] : [...top, ...rest.slice(0, 1)]).slice(0, 5);
}

export type FightDecision =
  | { kind: "accept"; reason: string }
  | { kind: "counter"; reason: string; terms: FightTerms }
  | { kind: "refuse"; reason: string };

export function evaluateFightOffer(g: GameSave, r: Rankings, mine: Fighter, opp: Fighter, terms: FightTerms, week: number): FightDecision {
  if (opp.retired || !opp.pro) return { kind: "refuse", reason: "He is not an active pro." };
  if (week < g.week + CAMP_MIN) return { kind: "refuse", reason: `Too soon: a camp needs at least ${CAMP_MIN} weeks.` };
  if (!isFree(g, mine.id, week)) return { kind: "refuse", reason: "Your fighter is booked or injured around that date." };
  if (opp.promoter === "player") return isFree(g, opp.id, week) ? { kind: "accept", reason: "Your own fighter. Agreed." } : { kind: "refuse", reason: "He is booked or injured around that date." };
  if (!isFree(g, opp.id, week)) return { kind: "refuse", reason: "He is booked or injured around that date." };
  const y = yearOf(g);
  for (const body of terms.titles) {
    if (mine.division !== opp.division) return { kind: "refuse", reason: "Titles can only be fought for within one division." };
    const champ = g.world.belts[opp.division][body];
    const myRank = rankIn(g, r, mine, body);
    if (champ !== opp.id && champ !== mine.id) return { kind: "refuse", reason: `Neither fighter holds the ${body} belt.` };
    const challenger = champ === opp.id ? mine : opp;
    const chRank = rankIn(g, r, challenger, body);
    if (chRank === null || (champ === mine.id && myRank !== 0)) return { kind: "refuse", reason: `${challenger.name} is not ranked by the ${body}.` };
  }
  const oppBest = bestRank(g, r, opp), myBest = bestRank(g, r, mine);
  const gap = overall(opp.ratings) - overall(mine.ratings);
  if (oppBest && (oppBest.rank <= 5) && !myBest && gap > 10 && terms.titles.length === 0) {
    return { kind: "refuse", reason: "A top contender sees no reward in fighting an unranked opponent." };
  }
  const wcOpp = 1 - winChance(mine, opp);
  const champOpp = terms.titles.some((b) => g.world.belts[opp.division][b] === opp.id);
  const title = terms.titles.length > 0;
  const cross = crossFactor(g, mine, opp);
  const ask = Math.round((askPurse(opp, y) * (champOpp ? 1.4 : title ? 1.2 : 1) * isUnderdogPremium(wcOpp) * cross) / 1000) * 1000;
  if (terms.purseB >= ask) return { kind: "accept", reason: "Terms agreed." };
  if (terms.purseB >= ask * 0.7) return { kind: "counter", reason: "He wants a bigger purse for this one.", terms: { ...terms, purseB: ask } };
  return { kind: "refuse", reason: "The purse is far too low." };
}

let uid = 0;
export const newId = (p: string, g: GameSave) => `${p}-${g.week}-${(uid = (uid + 1) % 1e6)}`;

export function scheduleFight(g: GameSave, a: string, b: string, week: number, terms: FightTerms, promoter: string, origin: ScheduledFight["origin"]): GameSave {
  const fight: ScheduledFight = { id: newId("f", g), week, a, b, promoter, origin, ...terms };
  let lastMandatory = g.lastMandatory;
  // unification exemption: fighting for belts of two different bodies resets both bodies' mandatory clock
  if (terms.titles.length >= 2) {
    const d = g.world.fighters[a].division;
    lastMandatory = { ...lastMandatory };
    for (const body of terms.titles) lastMandatory[`${d}:${body}`] = g.week;
  }
  return { ...g, fights: [...g.fights, fight], lastMandatory };
}

export function inboxPush(g: GameSave, title: string, body: string, needsDecision = false): GameSave {
  return { ...g, inbox: [{ id: `m-${g.week}-${g.inbox.length}-${title.length}-${body.length}`, week: g.week, title, body, needsDecision }, ...g.inbox].slice(0, 60) };
}

/** Every body's view of a fighter, best first. rank 0 = champion. */
export function ranksOf(g: GameSave, r: Rankings, f: Fighter): RankInfo[] {
  const out: RankInfo[] = [];
  for (const body of WORLD_BODIES) { const k = rankIn(g, r, f, body); if (k !== null) out.push({ body, rank: k }); }
  return out.sort((a, b) => a.rank - b.rank);
}
/** "WBC champion · IBF #4 · WBO #9" or "Unranked". */
export function rankText(g: GameSave, r: Rankings, f: Fighter): string {
  const xs = ranksOf(g, r, f);
  return xs.length ? xs.map((x) => (x.rank === 0 ? `${x.body} champion` : `${x.body} #${x.rank}`)).join(" · ") : "Unranked";
}
