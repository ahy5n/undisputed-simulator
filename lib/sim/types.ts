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

export interface Contract { promoter: string; fightsLeft: number; purse: number; cut: number; expiresYear?: number; expiredWeek?: number }
export interface Offer { bonus: number; fights: number; purse: number; cut: number }
export interface Negotiation {
  id: string; fighterId: string; round: number; offer: Offer;
  rivals: { promoterId: string; offer: Offer }[]; log: string[]; startedWeek: number;
}

export interface FightTerms { purseA: number; purseB: number; titles: WorldBody[]; rounds: number; rematch: boolean; rehydration: boolean }
export interface ScheduledFight extends FightTerms {
  id: string; week: number; a: string; b: string; done?: boolean;
  /** "player" if you promote it, otherwise the AI promoter id */
  promoter: string;
  origin: "player" | "ai" | "mandatory" | "vacant" | "bid" | "rematch";
  showId?: string;
  /** ticket and PPV multiplier from the press conference */
  hype?: number;
  presser?: "pending" | "done";
  missedWeight?: string;
}
export interface IncomingOffer { id: string; issued: number; expires: number; fromPromoter: string; mine: string; opp: string; fightWeek: number; terms: FightTerms }
export interface Order {
  id: string; kind: "mandatory" | "vacant"; division: Division; body: WorldBody;
  champion: string | null; challenger: string; other?: string; issued: number; deadline: number;
}
export interface PurseBid { id: string; order: Order; minBid: number; bids: { promoterId: string; amount: number }[]; closeWeek: number }
export interface FightRecord { week: number; a: string; b: string; aName: string; bName: string; winner: "a" | "b" | null; method: string; round: number; titles: WorldBody[]; division: Division }

export interface StatementLine { label: string; amount: number }
export interface Statement { lines: StatementLine[]; revenue: number; costs: number; profit: number; attendance: number; capacity: number; ppvBuys: number }
export interface Show {
  id: string; week: number; venue: string; fights: string[];
  price: "low" | "standard" | "premium"; dist: "sale" | "ppv" | "deal" | "deal-ppv"; auto?: boolean;
  statement?: Statement;
}

export type CampFocus = keyof Ratings | "gameplan";
export interface Camp {
  id: string; fightId: string; fighterId: string; focus: CampFocus; intensity: "light" | "normal" | "hard"; sparring: 0 | 1 | 2;
  start: number; condition: number; weeksDone: number;
  /** fractional progress toward the next whole rating point, plus whole points already granted this camp */
  progress: number; gained: number; spent: number;
  injured?: boolean;
}

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
  contract?: Contract;
  /** career knockout losses; speeds up chin decline */
  koLosses?: number;
}

export interface Promoter {
  id: string; name: string; country: string; real: boolean;
  personality: "cautious" | "aggressive" | "prospect-builder" | "big-event";
  budget: number; broadcaster: string | null;
}
export interface Broadcaster { id: string; name: string; market: string; budget: number; prefers: string[] }

export interface BroadcastDeal {
  broadcasterId: string; showsPerYear: number; feePerShow: number; ppvShare: number; exclusive: boolean;
  endsYear: number; showsDone: number;
}
export interface DealTerms { showsPerYear: number; feePerShow: number; ppvShare: number; exclusive: boolean; years: number }
export interface Objective { id: string; kind: "stable" | "shows" | "title" | "profit" | "wins" | "arena"; text: string; target: number; dueYear: number; status: "open" | "done" | "failed" }
export interface Board {
  objectives: Objective[]; milestones: { id: string; week: number }[];
  weeksInRed: number; wins: number; seasonWins: number; seasonShows: number; seasonStartCash: number; historySeen: number; showsSeen: string[];
}

export interface Hall {
  undisputed: { id: string; name: string; division: Division; week: number }[];
  inductees: { id: string; name: string; nationality: string; record: string; titleWins: number; year: number }[];
  olympics: { year: number; city: string; medals: { division: Division; gold: string; silver: string; bronze: string }[] }[];
}

export interface Company {
  name: string; country: string; colours: { primary: string; secondary: string };
  cash: number; stable: string[]; confidence: number; reputation: number;
  deal?: BroadcastDeal; trust: Record<string, number>; board: Board;
}
export interface Settings { startingCash: number; hideScorecards: boolean; /** champion's share of a mandatory purse bid */ bidSplit: number }

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
  history: FightRecord[];
  fights: ScheduledFight[];
  shows: Show[];
  camps: Camp[];
  /** `${idA}|${idB}` (sorted) -> heat. Rivals sell more tickets. */
  rivalries: Record<string, number>;
  hall: Hall;
  incoming: IncomingOffer[];
  orders: Order[];
  purseBids: PurseBid[];
  /** `${division}:${body}` -> week the last mandatory/unification took place */
  lastMandatory: Record<string, number>;
  negotiations: Negotiation[];
  inbox: { id: string; week: number; title: string; body: string; needsDecision?: boolean }[];
  settings: Settings;
  /** set when the board fires you: the save is over but stays viewable */
  over?: { week: number; reason: string };
}
