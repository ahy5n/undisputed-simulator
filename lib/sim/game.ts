import { createWorld, START_YEAR } from "./worldgen";
import { SAVE_VERSION } from "@/lib/save/db";
import { DIVISIONS, WORLD_BODIES, type GameSave, type Settings } from "./types";
import { Rng } from "./rng";
import { gameYear } from "./calendar";
import { rollSeason } from "./season";
import { processNegotiations } from "./market";
import { worldWeek } from "./weekly";

export const DEFAULT_SETTINGS: Settings = { startingCash: 3_000_000, hideScorecards: false };
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
  return {
    version: SAVE_VERSION,
    id: `save-${seed.toString(36)}-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    seed, rngState, week: 0, startDate: START_DATE, world,
    company: {
      name: input.companyName.trim() || "Untitled Promotions", country: input.country,
      colours: { primary: input.primary, secondary: input.secondary },
      cash: input.startingCash, stable: [], confidence: 50, reputation: 30,
    },
    history: [], fights: [], shows: [], incoming: [], orders: [], purseBids: [], lastMandatory: initLastMandatory(seed),
    negotiations: [],
    inbox: [{ id: "welcome", week: 0, title: "Welcome to the game", body: `You have £${input.startingCash.toLocaleString("en-GB")} and no fighters. Open the Market tab to sign your first boxers.`, needsDecision: false }],
    settings: { ...DEFAULT_SETTINGS, startingCash: input.startingCash },
  };
}
export { START_YEAR };

export function advanceWeek(g: GameSave): GameSave {
  const week = g.week + 1;
  const before = gameYear(g.startDate, g.week);
  const after = gameYear(g.startDate, week);
  let cur: GameSave = { ...g, week };
  if (after !== before) {
    const rng = new Rng(cur.rngState);
    const { world, report } = rollSeason(cur.world, rng, after);
    const retiring = cur.company.stable.filter((id) => world.fighters[id].retired);
    cur = {
      ...cur, world, rngState: rng.state,
      company: { ...cur.company, stable: cur.company.stable.filter((id) => !world.fighters[id].retired) },
      inbox: [
        { id: `season-${after}`, week, title: `Season ${after} begins`, body: `Everyone is a year older. ${report.retired.length} pros retired, ${report.intake} new amateurs arrived.${retiring.length ? ` Your fighters retiring: ${retiring.map((i) => world.fighters[i].name).join(", ")}.` : ""}` },
        ...cur.inbox,
      ].slice(0, 60),
    };
  }
  return worldWeek(processNegotiations(cur));
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
    if (pendingPlayerFights(cur).length) return { game: cur, stoppedFor: "fight" };
    if (decisionCount(cur) > base) return { game: cur, stoppedFor: "decision" };
  }
  return { game: cur, stoppedFor: "limit" };
}
