export const DIVISIONS = [
  "heavyweight", "light-heavyweight", "middleweight", "welterweight",
  "lightweight", "featherweight", "bantamweight", "flyweight",
] as const;
export type Division = (typeof DIVISIONS)[number];
export const DIVISION_LABEL: Record<Division, string> = {
  heavyweight: "Heavyweight", "light-heavyweight": "Light heavyweight", middleweight: "Middleweight",
  welterweight: "Welterweight", lightweight: "Lightweight", featherweight: "Featherweight",
  bantamweight: "Bantamweight", flyweight: "Flyweight",
};
export const DIVISION_LIMIT: Record<Division, string> = {
  heavyweight: "No limit", "light-heavyweight": "175 lb", middleweight: "160 lb", welterweight: "147 lb",
  lightweight: "135 lb", featherweight: "126 lb", bantamweight: "118 lb", flyweight: "112 lb",
};
export const WORLD_BODIES = ["WBC", "WBA", "IBF", "WBO"] as const;
export type WorldBody = (typeof WORLD_BODIES)[number];

export type Style = "boxer" | "puncher" | "swarmer" | "counter-puncher" | "boxer-puncher" | "brawler";
export interface Ratings { power: number; speed: number; defence: number; chin: number; stamina: number; skill: number }
export interface Record3 { w: number; l: number; d: number; ko: number }

export interface Fighter {
  id: string;
  name: string;
  nationality: string;
  born: number;
  division: Division;
  record: Record3;
  titles: string[];
  promoter: string; // promoter id, "independent" = free agent, "player" = your company
  style: Style;
  ratings: Ratings;
  popularity: number;
  real: boolean;
  /** 1-5 stars, meaningful for under-25s */
  potential: number;
  /** false = amateur / not yet turned pro */
  pro: boolean;
  amateur?: { w: number; l: number; medal?: string };
  morale: number;
  form: ("W" | "L" | "D")[];
  injuredWeeks: number;
  recordEstimated?: boolean;
  retired?: boolean;
  /** career knockout losses; speeds up chin decline */
  koLosses?: number;
}

export interface Promoter {
  id: string; name: string; country: string; real: boolean;
  personality: "cautious" | "aggressive" | "prospect-builder" | "big-event";
  budget: number; broadcaster: string | null;
}
export interface Broadcaster { id: string; name: string; market: string; budget: number; prefers: string[] }

export interface Company {
  name: string; country: string; colours: { primary: string; secondary: string };
  cash: number; stable: string[]; confidence: number;
}
export interface Settings { startingCash: number; hideScorecards: boolean }

export interface World {
  fighters: Record<string, Fighter>;
  promoters: Promoter[];
  broadcasters: Broadcaster[];
  /** world belts: division -> body -> fighter id | null */
  belts: Record<Division, Record<WorldBody, string | null>>;
}

export interface GameSave {
  version: number;
  id: string;
  createdAt: string;
  seed: number;
  rngState: number;
  /** weeks elapsed since startDate */
  week: number;
  startDate: string; // ISO date of a Saturday
  world: World;
  company: Company;
  history: unknown[];
  inbox: { id: string; week: number; title: string; body: string; needsDecision?: boolean }[];
  settings: Settings;
}
