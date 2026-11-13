import { createWorld, START_YEAR } from "./worldgen";
import { SAVE_VERSION } from "@/lib/save/db";
import type { GameSave, Settings } from "./types";
import { Rng } from "./rng";
import { gameYear } from "./calendar";
import { rollSeason } from "./season";
import { processNegotiations } from "./market";

export const DEFAULT_SETTINGS: Settings = { startingCash: 3_000_000, hideScorecards: false };
export const START_DATE = "2026-11-14"; // a Saturday

export interface NewGameInput { companyName: string; country: string; primary: string; secondary: string; startingCash: number }

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
    history: [],
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
  let next: GameSave = processNegotiations({ ...g, week });
  if (after !== before) {
    const rng = new Rng(g.rngState);
    const { world, report } = rollSeason(g.world, rng, after);
    const mine = g.company.stable.filter((id) => world.fighters[id].retired);
    next = {
      ...next, world, rngState: rng.state,
      company: { ...g.company, stable: g.company.stable.filter((id) => !world.fighters[id].retired) },
      inbox: [
        { id: `season-${after}`, week, title: `Season ${after} begins`, body: `Everyone is a year older. ${report.retired.length} pros retired, ${report.intake} new amateurs arrived.${mine.length ? ` Your fighters retiring: ${mine.map((i) => world.fighters[i].name).join(", ")}.` : ""}` },
        ...g.inbox,
      ].slice(0, 50),
    };
  }
  return next;
}
