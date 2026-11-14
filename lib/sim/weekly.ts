import { askPurse } from "./contracts";
import { gameYear } from "./calendar";
import { simulateFight, type FightResult } from "./fight";
import { overall } from "./fighter";
import {
  CAMP_DEFAULT, activeByDivision, candidates, defaultTerms, inboxPush, isFree, newId, rankIn, scheduleFight, winChance,
} from "./matchmaking";
import { computeRankings, type Rankings } from "./rankings";
import { Rng } from "./rng";
import { generateFighter } from "./worldgen";
import { autoShows, settleIfComplete } from "./shows";
import { campsWeek, fightConfigFor } from "./camps";
import { dramaWeek, rivalryAfter } from "./drama";
import {
  DIVISIONS, WORLD_BODIES, type Division, type Fighter, type FightTerms, type GameSave, type Order, type ScheduledFight, type WorldBody,
} from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const key = (d: Division, b: WorldBody) => `${d}:${b}`;
const involvesPlayer = (g: GameSave, f: ScheduledFight) => g.world.fighters[f.a].promoter === "player" || g.world.fighters[f.b].promoter === "player";

/* ---------------------------------------------------------------- results */

export function applyResult(g: GameSave, fight: ScheduledFight, r: FightResult, rng: Rng): GameSave {
  const fighters = { ...g.world.fighters };
  const A = { ...fighters[fight.a], record: { ...fighters[fight.a].record }, form: [...fighters[fight.a].form] };
  const B = { ...fighters[fight.b], record: { ...fighters[fight.b].record }, form: [...fighters[fight.b].form] };
  const stoppage = r.method === "KO" || r.method === "TKO";
  const sides: [typeof A, "a" | "b"][] = [[A, "a"], [B, "b"]];
  for (const [f, side] of sides) {
    const won = r.winner === side, drew = r.winner === null;
    if (won) { f.record.w++; if (stoppage) f.record.ko++; f.form.push("W"); }
    else if (drew) { f.record.d++; f.form.push("D"); }
    else { f.record.l++; f.form.push("L"); if (stoppage) f.koLosses = (f.koLosses ?? 0) + 1; }
    f.form = f.form.slice(-5);
    const pop = won ? 2 + Math.round(r.excitement / 25) + (stoppage ? 3 : 0) + (fight.titles.length ? 4 : 0) : drew ? 1 : Math.round(r.excitement / 50) - 1;
    // fame is harder to add the more of it you have
    f.popularity = clamp(Math.round(f.popularity + (pop > 0 ? pop * Math.max(0.15, 1 - f.popularity / 105) : pop)), 1, 100);
    f.morale = clamp(f.morale + (won ? 8 : drew ? 0 : -8), 20, 100);
    const pInj = !won && stoppage ? 0.3 : 0.08;
    if (rng.chance(pInj)) f.injuredWeeks = rng.int(4, 14);
    if (f.contract && f.promoter === "player") f.contract = { ...f.contract, fightsLeft: Math.max(0, f.contract.fightsLeft - 1) };
  }
  fighters[A.id] = A; fighters[B.id] = B;
  // belts
  const belts = structuredClone(g.world.belts);
  const div = A.division;
  if (r.winner) {
    const win = r.winner === "a" ? A : B;
    for (const body of fight.titles) {
      const old = belts[div][body];
      if (old === win.id) continue;
      if (old && fighters[old]) fighters[old] = { ...fighters[old], titles: fighters[old].titles.filter((t) => t !== body) };
      belts[div][body] = win.id;
      fighters[win.id] = { ...fighters[win.id], titles: [...fighters[win.id].titles.filter((t) => t !== body), body] };
    }
  }
  let next: GameSave = {
    ...g, world: { ...g.world, fighters, belts },
    fights: g.fights.map((f) => f.id === fight.id ? { ...f, done: true } : f),
    history: [...g.history, { week: g.week, a: A.id, b: B.id, aName: A.name, bName: B.name, winner: r.winner, method: r.method, round: r.round, titles: fight.titles, division: div }].slice(-30000),
  };
  // On your own shows the promoter keeps whatever is left after purses and costs (settled with the show).
  // On someone else's card you earn your cut of your fighter's purse.
  let cash = next.company.cash;
  let rep = next.company.reputation;
  if (fight.promoter !== "player") for (const [f, side] of sides) if (f.promoter === "player" && f.contract) cash += Math.round((side === "a" ? fight.purseA : fight.purseB) * f.contract.cut);
  for (const [f, side] of sides) if (f.promoter === "player") rep = clamp(rep + (r.winner === side ? 0.5 + (fight.titles.length ? 4 : 0) : r.winner === null ? 0 : -0.4), 0, 100);
  next = { ...next, company: { ...next.company, cash, reputation: rep } };
  next = rivalryAfter(next, fight, r);
  next = settleIfComplete(next, fight.showId, rng);
  if (involvesPlayer(g, fight)) {
    const w = r.winner ? (r.winner === "a" ? A : B) : null;
    next = inboxPush(next, w ? `${w.name} wins` : "Draw", `${A.name} vs ${B.name}: ${w ? `${w.name} by ${r.method}${stoppage ? ` in round ${r.round}` : ""}` : "draw"}${fight.titles.length ? ` (${fight.titles.join("/")})` : ""}.`);
  }
  // rematch clause
  if (fight.rematch && r.winner && !A.retired && !B.retired) {
    const wk = g.week + 20;
    if (isFree(next, A.id, wk) && isFree(next, B.id, wk)) {
      const titles = fight.titles.filter((b) => next.world.belts[div][b] === A.id || next.world.belts[div][b] === B.id);
      next = scheduleFight(next, B.id, A.id, wk, { ...fight, titles, purseA: fight.purseB, purseB: fight.purseA }, fight.promoter, "rematch");
    }
  }
  return next;
}

/** Quick-sim one of the player's fights. */
export function quickSimFight(g: GameSave, fightId: string): GameSave {
  const fight = g.fights.find((f) => f.id === fightId && !f.done);
  if (!fight) return g;
  const rng = new Rng(g.rngState);
  const r = simulateFight(g.world.fighters[fight.a], g.world.fighters[fight.b], fightConfigFor(g, fight), rng);
  const next = applyResult(g, fight, r, rng);
  return { ...next, rngState: rng.state };
}

/* ------------------------------------------------------- never-stuck check */

export function realisticOpponents(g: GameSave, f: Fighter): number {
  const o = overall(f.ratings);
  let n = 0;
  for (const x of activeByDivision(g).get(f.division)!) if (x.id !== f.id && Math.abs(overall(x.ratings) - o) <= 12) n++;
  return n;
}
export const rankedIds = (g: GameSave, r: Rankings): Set<string> => {
  const s = new Set<string>();
  for (const d of DIVISIONS) for (const b of WORLD_BODIES) { r[d][b].forEach((id) => s.add(id)); const c = g.world.belts[d][b]; if (c) s.add(c); }
  return s;
};

/** Guarantee: every ranked fighter has at least three realistic opponents. Pulls in prospects or creates new ones. */
export function ensureOpponents(g: GameSave, r: Rankings, rng: Rng): GameSave {
  let fighters: Record<string, Fighter> | null = null;
  const used = new Set(Object.values(g.world.fighters).map((f) => f.name));
  const small = g.world.promoters.filter((p) => !p.real && p.id !== "independent").map((p) => p.id);
  let n = Object.keys(g.world.fighters).length;
  for (const id of rankedIds(g, r)) {
    const cur = fighters ? { ...g, world: { ...g.world, fighters } } : g;
    const f = cur.world.fighters[id];
    let have = realisticOpponents(cur, f);
    if (have >= 3) continue;
    fighters ??= { ...g.world.fighters };
    const o = overall(f.ratings);
    // 1) prospects in this division near the level turn pro
    for (const p of Object.values(fighters)) {
      if (have >= 3) break;
      if (!p.pro && !p.retired && p.division === f.division && Math.abs(overall(p.ratings) - o) <= 12) { fighters[p.id] = { ...p, pro: true }; have++; }
    }
    // 2) otherwise new fighters are created at his level
    while (have < 3) {
      const nf = generateFighter(rng, f.division, used, small, { year: gameYear(g.startDate, g.week), prospect: false, idPrefix: `fill${g.week}`, n: n++ });
      const delta = o - overall(nf.ratings) + rng.int(-6, 6);
      for (const k of Object.keys(nf.ratings) as (keyof Fighter["ratings"])[]) nf.ratings[k] = clamp(nf.ratings[k] + delta, 1, 100);
      fighters[nf.id] = nf; have++;
    }
  }
  return fighters ? { ...g, world: { ...g.world, fighters } } : g;
}

/* ------------------------------------------------------------- AI fights */

const PERSONALITY_P = { cautious: 0.3, aggressive: 0.55, "prospect-builder": 0.45, "big-event": 0.4 } as const;

function pickOpponent(g: GameSave, r: Rankings, f: Fighter, week: number, rng: Rng, preferOwn: boolean, promoterId: string) {
  let list = candidates(g, r, f, week, 0).slice(0, 12);
  if (preferOwn) { const own = list.filter((c) => c.fighter.promoter === promoterId); if (own.length) list = own; }
  list = list.filter((c) => c.winChance >= 0.28 && c.winChance <= 0.9);
  if (!list.length) return null;
  const top = list.slice(0, 5);
  return rng.pick(top);
}

export function aiMakeFights(g: GameSave, r: Rankings, rng: Rng): GameSave {
  let cur = g;
  const weekBase = g.week;
  const free = (id: string, wk: number) => isFree(cur, id, wk);
  for (const p of g.world.promoters) {
    if (p.id === "independent" || p.budget <= 0) continue;
    const stable = Object.values(cur.world.fighters).filter((f) => f.promoter === p.id && f.pro && !f.retired);
    const attempts = Math.max(1, Math.floor(stable.length / 9));
    for (let i = 0; i < attempts; i++) {
      if (!rng.chance(PERSONALITY_P[p.personality])) continue;
      const wk = weekBase + rng.int(8, 12);
      const mine = stable.filter((f) => free(f.id, wk));
      if (!mine.length) break;
      mine.sort((a, b) => overall(b.ratings) - overall(a.ratings));
      const f = p.personality === "big-event" ? mine[0] : rng.pick(mine.slice(0, Math.max(3, Math.ceil(mine.length / 2))));
      const pick = pickOpponent(cur, r, f, wk, rng, p.personality === "cautious" || p.personality === "prospect-builder" ? rng.chance(0.5) : false, p.id);
      if (!pick) continue;
      const opp = pick.fighter;
      const other = cur.world.promoters.find((x) => x.id === opp.promoter);
      if (other && other.id !== p.id && !rng.chance(0.7)) continue;
      cur = scheduleFight(cur, f.id, opp.id, wk, pick.terms, p.id, "ai");
    }
  }
  // the independent circuit: free agents fight each other on small shows
  const indep = Object.values(cur.world.fighters).filter((f) => f.promoter === "independent" && f.pro && !f.retired);
  for (let i = 0; i < 16 && indep.length > 2; i++) {
    const wk = weekBase + rng.int(8, 12);
    const f = rng.pick(indep);
    if (!free(f.id, wk)) continue;
    const c = candidates(cur, r, f, wk, 0).filter((x) => x.fighter.promoter === "independent" && x.winChance > 0.3 && x.winChance < 0.85).slice(0, 4);
    if (!c.length) continue;
    const pick = rng.pick(c);
    cur = scheduleFight(cur, f.id, pick.fighter.id, wk, pick.terms, "independent", "ai");
  }
  return cur;
}

/** AI promoters offer your free fighters fights. */
export function incomingOffers(g: GameSave, r: Rankings, rng: Rng): GameSave {
  let cur = g;
  for (const id of g.company.stable) {
    const f = cur.world.fighters[id];
    if (!f || f.retired || cur.incoming.some((o) => o.mine === id)) continue;
    const wk = g.week + rng.int(8, 12);
    if (!isFree(cur, id, wk) || !rng.chance(0.18)) continue;
    const list = candidates(cur, r, f, wk, 0).filter((c) => c.winChance > 0.3 && c.winChance < 0.9 && c.fighter.promoter !== "independent").slice(0, 5);
    if (!list.length) continue;
    const pick = rng.pick(list);
    cur = {
      ...cur, incoming: [...cur.incoming, { id: newId("o", cur), issued: g.week, expires: g.week + 3, fromPromoter: pick.fighter.promoter, mine: id, opp: pick.fighter.id, fightWeek: wk, terms: pick.terms }],
    };
    cur = inboxPush(cur, `Fight offer for ${f.name}`, `${cur.world.promoters.find((p) => p.id === pick.fighter.promoter)?.name ?? "A promoter"} offers ${pick.fighter.name} in week +${wk - g.week}: ${pick.why}.`, true);
  }
  return cur;
}
export function acceptIncoming(g: GameSave, offerId: string): GameSave {
  const o = g.incoming.find((x) => x.id === offerId);
  if (!o) return g;
  const next = { ...g, incoming: g.incoming.filter((x) => x.id !== offerId) };
  if (!isFree(next, o.mine, o.fightWeek) || !isFree(next, o.opp, o.fightWeek)) return inboxPush(next, "Offer fell through", "Dates no longer work.");
  return scheduleFight(next, o.mine, o.opp, o.fightWeek, o.terms, o.fromPromoter, "ai");
}
export const declineIncoming = (g: GameSave, offerId: string): GameSave => ({ ...g, incoming: g.incoming.filter((x) => x.id !== offerId) });

/* ---------------------------------------------- mandatories, vacancies, bids */

function firstFreeWeek(g: GameSave, a: string, b: string, from: number): number | null {
  for (let w = from; w <= from + 10; w++) if (isFree(g, a, w) && isFree(g, b, w)) return w;
  return null;
}
const hasTitleFight = (g: GameSave, d: Division, body: WorldBody) => g.fights.some((f) => !f.done && f.titles.includes(body) && g.world.fighters[f.a].division === d);

export function orderParticipants(o: Order): [string, string] { return o.champion ? [o.champion, o.challenger] : [o.challenger, o.other!]; }

function makeOrders(g: GameSave, r: Rankings, rng: Rng): GameSave {
  let cur = g;
  for (const d of DIVISIONS) for (const body of WORLD_BODIES) {
    if (cur.orders.some((o) => o.division === d && o.body === body) || cur.purseBids.some((b) => b.order.division === d && b.order.body === body) || hasTitleFight(cur, d, body)) continue;
    const champ = cur.world.belts[d][body];
    const list = r[d][body].filter((id) => id !== champ);
    if (list.length < 2) continue;
    if (champ === null) {
      cur = { ...cur, orders: [...cur.orders, { id: newId("ord", cur), kind: "vacant", division: d, body, champion: null, challenger: list[0], other: list[1], issued: g.week, deadline: g.week + 4 }] };
    } else if (g.week - (cur.lastMandatory[key(d, body)] ?? -99) >= rng.int(39, 52)) {
      cur = { ...cur, orders: [...cur.orders, { id: newId("ord", cur), kind: "mandatory", division: d, body, champion: champ, challenger: list[0], issued: g.week, deadline: g.week + 4 }] };
    } else continue;
    const o = cur.orders[cur.orders.length - 1];
    const [x, y] = orderParticipants(o);
    if ([x, y].some((id) => cur.world.fighters[id].promoter === "player")) {
      cur = inboxPush(cur, `${body} orders ${o.kind === "vacant" ? "a vacant title fight" : "a mandatory"}`, `${cur.world.fighters[x].name} vs ${cur.world.fighters[y].name} for the ${body} ${d} title. You have 30 days to agree terms before it goes to a purse bid.`, true);
    }
  }
  return cur;
}

export function minBidFor(g: GameSave, o: Order): number {
  const y = gameYear(g.startDate, g.week);
  const [a, b] = orderParticipants(o);
  return Math.round(((askPurse(g.world.fighters[a], y) + askPurse(g.world.fighters[b], y)) * 2.5) / 5000) * 5000;
}

function openBid(g: GameSave, o: Order, rng: Rng): GameSave {
  const minBid = minBidFor(g, o);
  const bids = g.world.promoters
    .filter((p) => p.id !== "independent" && p.budget >= minBid * 4 && rng.chance(0.6))
    .map((p) => ({ promoterId: p.id, amount: Math.min(Math.round((minBid * (1 + rng.next() * 0.8)) / 5000) * 5000, Math.round(p.budget / 4)) }));
  const next: GameSave = { ...g, orders: g.orders.filter((x) => x.id !== o.id), purseBids: [...g.purseBids, { id: newId("pb", g), order: o, minBid, bids, closeWeek: g.week + 1 }] };
  const [x, y] = orderParticipants(o);
  return [x, y].some((id) => g.world.fighters[id].promoter === "player")
    ? inboxPush(next, `Purse bid: ${o.body} ${o.division}`, `No deal in 30 days. Bidding is open until next week (minimum £${minBid.toLocaleString("en-GB")}, ${o.kind === "vacant" ? "50/50" : "75/25"} split). Your fighters' side still gets their share if someone else wins.`, true)
    : next;
}

export function placeBid(g: GameSave, bidId: string, amount: number): GameSave {
  return { ...g, purseBids: g.purseBids.map((b) => b.id === bidId && amount >= b.minBid ? { ...b, bids: [...b.bids.filter((x) => x.promoterId !== "player"), { promoterId: "player", amount }] } : b) };
}

function closeBids(g: GameSave, rng: Rng): GameSave {
  let cur = g;
  for (const pb of g.purseBids) {
    if (pb.closeWeek > g.week) continue;
    const [x, y] = orderParticipants(pb.order);
    const win = [...pb.bids].sort((a, b) => b.amount - a.amount)[0] ?? { promoterId: rng.pick(g.world.promoters.filter((p) => p.real)).id, amount: pb.minBid };
    const wk = firstFreeWeek(cur, x, y, g.week + CAMP_DEFAULT);
    if (wk === null) { cur = { ...cur, purseBids: cur.purseBids.map((b) => b.id === pb.id ? { ...b, closeWeek: g.week + 1 } : b) }; continue; }
    const split = pb.order.kind === "vacant" ? 0.5 : g.settings.bidSplit ?? 0.75;
    const terms: FightTerms = { purseA: Math.round((win.amount * split) / 1000) * 1000, purseB: Math.round((win.amount * (1 - split)) / 1000) * 1000, titles: [pb.order.body], rounds: 12, rematch: false, rehydration: false };
    cur = { ...cur, purseBids: cur.purseBids.filter((b) => b.id !== pb.id), lastMandatory: { ...cur.lastMandatory, [key(pb.order.division, pb.order.body)]: g.week } };
    cur = scheduleFight(cur, x, y, wk, terms, win.promoterId, "bid");
    if ([x, y].some((id) => cur.world.fighters[id].promoter === "player") || win.promoterId === "player") {
      cur = inboxPush(cur, `Purse bid won by ${win.promoterId === "player" ? "you" : cur.world.promoters.find((p) => p.id === win.promoterId)?.name}`, `${cur.world.fighters[x].name} vs ${cur.world.fighters[y].name} for the ${pb.order.body} title, £${win.amount.toLocaleString("en-GB")} purse pot.`);
    }
  }
  return cur;
}

function processOrders(g: GameSave, rng: Rng): GameSave {
  let cur = g;
  for (const o of g.orders) {
    const live = cur.orders.find((x) => x.id === o.id);
    if (!live) continue;
    const [x, y] = orderParticipants(live);
    const fx = cur.world.fighters[x], fy = cur.world.fighters[y];
    if (fx.retired || fy.retired || (live.champion && cur.world.belts[live.division][live.body] !== live.champion)) { cur = { ...cur, orders: cur.orders.filter((z) => z.id !== o.id) }; continue; }
    const player = fx.promoter === "player" || fy.promoter === "player";
    if (!player && rng.chance(0.5)) {
      const wk = firstFreeWeek(cur, x, y, g.week + CAMP_DEFAULT);
      if (wk !== null) {
        const terms = defaultTerms(cur, fx, fy, [live.body]);
        const prom = fx.promoter !== "independent" ? fx.promoter : fy.promoter !== "independent" ? fy.promoter : "independent";
        cur = { ...scheduleFight(cur, x, y, wk, terms, prom, live.kind === "vacant" ? "vacant" : "mandatory"), orders: cur.orders.filter((z) => z.id !== o.id), lastMandatory: { ...cur.lastMandatory, [key(live.division, live.body)]: g.week } };
        continue;
      }
    }
    if (g.week >= live.deadline) cur = openBid(cur, live, rng);
  }
  return closeBids(cur, rng);
}

/** Champion options. */
export function vacateBelt(g: GameSave, fighterId: string, body: WorldBody): GameSave {
  const f = g.world.fighters[fighterId];
  if (g.world.belts[f.division][body] !== fighterId) return g;
  const belts = structuredClone(g.world.belts);
  belts[f.division][body] = null;
  return inboxPush({
    ...g, world: { ...g.world, belts, fighters: { ...g.world.fighters, [fighterId]: { ...f, titles: f.titles.filter((t) => t !== body) } } },
    orders: g.orders.filter((o) => !(o.division === f.division && o.body === body && o.champion === fighterId)),
  }, `${f.name} vacates the ${body} title`, `The ${body} will order a vacant title fight between its top contenders.`);
}
export const stepAsideFee = (g: GameSave, o: Order): number => Math.round((askPurse(g.world.fighters[o.challenger], gameYear(g.startDate, g.week)) * 3) / 5000) * 5000;
export function stepAside(g: GameSave, orderId: string): GameSave {
  const o = g.orders.find((x) => x.id === orderId);
  if (!o || o.kind !== "mandatory") return g;
  const fee = stepAsideFee(g, o);
  if (g.company.cash < fee) return g;
  return inboxPush({
    ...g, orders: g.orders.filter((x) => x.id !== orderId),
    company: { ...g.company, cash: g.company.cash - fee },
    lastMandatory: { ...g.lastMandatory, [key(o.division, o.body)]: g.week - 26 },
  }, "Step-aside fee paid", `You paid £${fee.toLocaleString("en-GB")}. The ${o.body} mandatory is pushed back about six months.`);
}

/** After the player agrees terms for the fight an order asks for. */
export function clearOrderFor(g: GameSave, a: string, b: string, titles: WorldBody[]): GameSave {
  const hit = g.orders.filter((o) => titles.includes(o.body) && new Set(orderParticipants(o)).has(a) && new Set(orderParticipants(o)).has(b));
  if (!hit.length) return g;
  const lm = { ...g.lastMandatory };
  for (const o of hit) lm[key(o.division, o.body)] = g.week;
  return { ...g, orders: g.orders.filter((o) => !hit.includes(o)), lastMandatory: lm };
}

/* ----------------------------------------------------------- weekly entry */

export function worldWeek(g: GameSave): GameSave {
  const rng = new Rng(g.rngState);
  let cur = g;
  // injuries heal
  const hurt = Object.values(cur.world.fighters).filter((f) => f.injuredWeeks > 0);
  if (hurt.length) {
    const fighters = { ...cur.world.fighters };
    for (const f of hurt) fighters[f.id] = { ...f, injuredWeeks: f.injuredWeeks - 1 };
    cur = { ...cur, world: { ...cur.world, fighters } };
  }
  cur = autoShows(cur);
  // fights due: AI fights resolve now; the player's wait for the player (auto-sim if a week overdue)
  for (const f of cur.fights.filter((x) => !x.done && x.week <= g.week)) {
    if (involvesPlayer(cur, f) && f.week === g.week) continue;
    const live = cur.fights.find((x) => x.id === f.id);
    if (!live || live.done) continue;
    const A = cur.world.fighters[f.a], B = cur.world.fighters[f.b];
    if (A.retired || B.retired) { cur = { ...cur, fights: cur.fights.map((x) => x.id === f.id ? { ...x, done: true } : x) }; continue; }
    const res = simulateFight(A, B, { rounds: f.rounds }, rng);
    cur = applyResult(cur, f, res, rng);
  }
  cur = { ...cur, fights: cur.fights.filter((f) => !f.done || f.week >= g.week - 12), incoming: cur.incoming.filter((o) => o.expires > g.week) };
  cur = campsWeek(cur, rng);
  const r = computeRankings(cur.world);
  cur = dramaWeek(cur, rng, r);
  cur = processOrders(makeOrders(cur, r, rng), rng);
  cur = ensureOpponents(cur, r, rng);
  cur = aiMakeFights(cur, r, rng);
  cur = incomingOffers(cur, r, rng);
  return { ...cur, rngState: rng.state };
}
export { winChance, rankIn };
