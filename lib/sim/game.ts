import { createWorld, START_YEAR } from "./worldgen";
import { SAVE_VERSION } from "@/lib/save/db";
import { DIVISIONS, WORLD_BODIES, type GameSave, type Settings } from "./types";
import { Rng } from "./rng";
import { gameYear } from "./calendar";
import { rollSeason } from "./season";
import { processNegotiations } from "./market";
import { aiMakeFights, worldWeek } from "./weekly";
import { computeRankings } from "./rankings";
import { boardSeason, boardWeek, openingBoard } from "./board";
import { dealSeason } from "./broadcast";
import { hallWeek, induct, olympicsDue, runOlympics } from "./legacy";

export const DEFAULT_SETTINGS: Settings = { startingCash: 3_000_000, hideScorecards: false, bidSplit: 0.75 };
export const START_DATE = "2026-11-14"; // a Saturday

export interface NewGameInput { companyName: string; country: string; primary: string; secondary: string; startingCash: number }

function initLastMandatory(seed: number): Record<string, number> {
  const r = new Rng(seed ^ 0x5bd1e995);
  const out: Record<string, number> = {};
  for (const d of DIVISIONS) for (const b of WORLD_BODIES) out[`${d}:${b}`] = -r.int(8, 40);
  return out;
}

export function newGame(input: NewGameInput): GameSave {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const { world, rngState } = createWorld(seed);
  const g: GameSave = {
    version: SAVE_VERSION,
    id: `save-${seed.toString(36)}-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    seed, rngState, week: 0, startDate: START_DATE, world,
    company: {
      name: input.companyName.trim() || "Untitled Promotions", country: input.country,
      colours: { primary: input.primary, secondary: input.secondary },
      cash: input.startingCash, stable: [], confidence: 50, reputation: 30, trust: {}, board: openingBoard(input.startingCash, START_YEAR),
    },
    history: [], fights: [], shows: [], camps: [], rivalries: {}, hall: { undisputed: [], inductees: [], olympics: [] }, incoming: [], orders: [], purseBids: [], lastMandatory: initLastMandatory(seed),
    negotiations: [],
    inbox: [{ id: "welcome", week: 0, title: "Welcome to the game", body: `You have £${input.startingCash.toLocaleString("en-GB")} and no fighters. Open the Market tab to sign your first boxers.`, needsDecision: false }],
    settings: { ...DEFAULT_SETTINGS, startingCash: input.startingCash },
  };
  // The boxing world is already in motion on day one: fill the first weeks of the calendar with fights.
  const rng = new Rng(g.rngState);
  const rankings = computeRankings(g.world);
  let cur = g;
  for (let w = -9; w <= -1; w++) cur = { ...aiMakeFights({ ...cur, week: w }, rankings, rng), week: 0 };
  return { ...cur, rngState: rng.state };
}
export { START_YEAR };

export function advanceWeek(g: GameSave): GameSave {
  if (g.over) return g;
  const week = g.week + 1;
  const before = gameYear(g.startDate, g.week);
  const after = gameYear(g.startDate, week);
  let cur: GameSave = { ...g, week };
  if (after !== before) {
    const rng = new Rng(cur.rngState);
    const booked = new Set(cur.fights.filter((f) => !f.done).flatMap((f) => [f.a, f.b]));
    const { world, report } = rollSeason(cur.world, rng, after, booked);
    // anything still pointing at a pruned fighter goes with him
    const alive = (id: string | null | undefined) => !id || !!world.fighters[id];
    cur = { ...cur, orders: cur.orders.filter((o) => alive(o.champion) && alive(o.challenger) && alive(o.other)), purseBids: cur.purseBids.filter((b) => alive(b.order.champion) && alive(b.order.challenger) && alive(b.order.other)), incoming: cur.incoming.filter((o) => alive(o.mine) && alive(o.opp)), negotiations: cur.negotiations.filter((n) => alive(n.fighterId)), fights: cur.fights.filter((f) => alive(f.a) && alive(f.b)) };
    const retiring = cur.company.stable.filter((id) => world.fighters[id].retired);
    cur = induct({ ...cur, world }, report.retired, after);
    cur = {
      ...cur, world, rngState: rng.state,
      company: { ...cur.company, stable: cur.company.stable.filter((id) => !world.fighters[id].retired) },
      inbox: [
        { id: `season-${after}`, week, title: `Season ${after} begins`, body: `Everyone is a year older. ${report.retired.length} pros retired, ${report.intake} new amateurs arrived.${retiring.length ? ` Your fighters retiring: ${retiring.map((i) => world.fighters[i].name).join(", ")}.` : ""}` },
        ...cur.inbox,
      ].slice(0, 60),
    };
  }
  if (after !== before) cur = boardSeason(dealSeason(cur, after), after);
  cur = hallWeek(boardWeek(worldWeek(processNegotiations(cur))));
  const games = olympicsDue(cur);
  if (games) { const r2 = new Rng(cur.rngState); cur = { ...runOlympics(cur, games, r2), rngState: r2.state }; }
  return cur;
}

/** Fights involving your fighters that fall due this week and need you to play or sim them. */
export function pendingPlayerFights(g: GameSave) {
  return g.fights.filter((f) => !f.done && f.week <= g.week && (g.world.fighters[f.a].promoter === "player" || g.world.fighters[f.b].promoter === "player"));
}

const decisionCount = (g: GameSave) => g.incoming.length + g.negotiations.length + g.purseBids.length + g.orders.filter((o) => [o.champion, o.challenger, o.other].some((id) => id && g.world.fighters[id]?.promoter === "player")).length;

/** Skip weeks until a fight of yours is due or something new needs a decision (max 52 weeks). */
export function simToNextFight(g: GameSave): { game: GameSave; stoppedFor: "fight" | "decision" | "limit" } {
  let cur = g;
  const base = decisionCount(g);
  for (let i = 0; i < 52; i++) {
    cur = advanceWeek(cur);
    if (cur.over) return { game: cur, stoppedFor: "decision" };
    if (pendingPlayerFights(cur).length) return { game: cur, stoppedFor: "fight" };
    if (decisionCount(cur) > base) return { game: cur, stoppedFor: "decision" };
  }
  return { game: cur, stoppedFor: "limit" };
}
