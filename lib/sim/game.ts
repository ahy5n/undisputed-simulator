import { createWorld, START_YEAR } from "./worldgen";
import { SAVE_VERSION } from "@/lib/save/db";
import type { GameSave, Settings } from "./types";

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
      cash: input.startingCash, stable: [], confidence: 50,
    },
    history: [],
    inbox: [{ id: "welcome", week: 0, title: "Welcome to the game", body: `You have £${input.startingCash.toLocaleString("en-GB")} and no fighters. Open the Market tab to sign your first boxers.`, needsDecision: false }],
    settings: { ...DEFAULT_SETTINGS, startingCash: input.startingCash },
  };
}
export { START_YEAR };

export function advanceWeek(g: GameSave): GameSave {
  return { ...g, week: g.week + 1 };
}
