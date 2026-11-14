import { inboxPush } from "./matchmaking";
import { venueById } from "./shows";
import { WORLD_BODIES, type Board, type GameSave, type Objective } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const RED_WEEKS_LIMIT = 8;
/** Weekly running costs: office, gym and staff, growing with the stable and with the size of the company. */
export function overheads(g: GameSave): number {
  const big = Math.min(60_000, Math.max(0, g.company.cash) * 0.0015);
  return Math.round((4_000 + g.company.stable.length * 1_500 + big) / 100) * 100;
}

export const MILESTONES: { id: string; label: string }[] = [
  { id: "first-win", label: "First win as a promoter" },
  { id: "first-show", label: "First show promoted" },
  { id: "world-champion", label: "First world champion" },
  { id: "undisputed", label: "First undisputed champion" },
  { id: "stadium", label: "First stadium show" },
  { id: "10m-show", label: "First £10m show" },
  { id: "50-wins", label: "50 wins as a promoter" },
];

export function openingBoard(cash: number, year: number): Board {
  return {
    objectives: [
      { id: `stable-${year}`, kind: "stable", text: "Build a stable of three fighters", target: 3, dueYear: year + 2, status: "open" },
      { id: `shows-${year}`, kind: "shows", text: `Promote four shows by the end of ${year + 1}`, target: 4, dueYear: year + 2, status: "open" },
      { id: `title-${year}`, kind: "title", text: `Win a world title by the end of ${year + 3}`, target: 1, dueYear: year + 4, status: "open" },
    ],
    milestones: [], weeksInRed: 0, wins: 0, seasonWins: 0, seasonShows: 0, seasonStartCash: cash, historySeen: 0, showsSeen: [],
  };
}

const champions = (g: GameSave) => g.company.stable.map((id) => g.world.fighters[id]).filter((f) => f && f.titles.length > 0);
const totalShows = (g: GameSave) => g.shows.filter((s) => s.statement).length;

export function progress(g: GameSave, o: Objective): number {
  const b = g.company.board;
  switch (o.kind) {
    case "stable": return g.company.stable.length;
    case "shows": return o.id.startsWith("shows-season") ? b.seasonShows : totalShows(g);
    case "title": return champions(g).length;
    case "profit": return g.company.cash - b.seasonStartCash;
    case "wins": return b.seasonWins;
    case "arena": return g.shows.filter((s) => s.statement && venueById(s.venue).capacity >= o.target).length ? o.target : 0;
  }
}
const met = (g: GameSave, o: Objective) => (o.kind === "profit" ? progress(g, o) > 0 : progress(g, o) >= o.target);

function seasonObjectives(g: GameSave, year: number): Objective[] {
  const out: Objective[] = [
    { id: `profit-${year}`, kind: "profit", text: `Make a profit in ${year}`, target: 1, dueYear: year + 1, status: "open" },
    { id: `wins-${year}`, kind: "wins", text: `Win ${Math.max(3, Math.min(12, g.company.stable.length * 2))} fights in ${year}`, target: Math.max(3, Math.min(12, g.company.stable.length * 2)), dueYear: year + 1, status: "open" },
  ];
  const biggest = Math.max(0, ...g.shows.filter((s) => s.statement).map((s) => venueById(s.venue).capacity));
  const nextSize = [5000, 10_000, 20_000, 40_000, 90_000].find((c) => c > biggest);
  if (nextSize) out.push({ id: `arena-${year}`, kind: "arena", text: `Stage a show in a venue of ${nextSize.toLocaleString("en-GB")} seats or more in ${year}`, target: nextSize, dueYear: year + 1, status: "open" });
  return out;
}

/** Weekly board business: results, show profits, milestones, objectives met, weeks in the red. */
export function boardWeek(g: GameSave): GameSave {
  if (g.over) return g;
  let b: Board = { ...g.company.board };
  let conf = g.company.confidence;
  let cur = g;
  const mine = new Set(g.company.stable);
  // results since last look
  for (const h of g.history.slice(b.historySeen)) {
    const side = g.world.fighters[h.a]?.promoter === "player" ? "a" : g.world.fighters[h.b]?.promoter === "player" ? "b" : null;
    if (!side || (!mine.has(h.a) && !mine.has(h.b))) continue;
    if (h.winner === side) { b.wins++; b.seasonWins++; conf += h.titles.length ? 5 : 0.5; }
    else if (h.winner) conf -= h.titles.length ? 3 : 1.5;
  }
  b.historySeen = g.history.length;
  // shows settled since last look
  for (const s of g.shows) {
    if (!s.statement || b.showsSeen.includes(s.id)) continue;
    b = { ...b, showsSeen: [...b.showsSeen, s.id], seasonShows: b.seasonShows + 1 };
    conf += s.statement.profit > 0 ? 1 : -3;
  }
  // running costs, and a board that gets used to success: confidence above 60 fades unless you keep earning it
  const cashNow = g.company.cash - overheads(g);
  if (conf > 55) conf -= conf > 80 ? 1.5 : 1;
  // the red
  b.weeksInRed = cashNow < 0 ? b.weeksInRed + 1 : 0;
  if (b.weeksInRed > 0) conf -= 3;
  cur = { ...cur, company: { ...cur.company, cash: cashNow, board: b, confidence: clamp(conf) } };
  if (b.weeksInRed === 1) cur = inboxPush(cur, "The board is watching the bank balance", `You are in the red. If cash stays below zero for ${RED_WEEKS_LIMIT} weeks, you will be removed.`, true);
  // milestones
  const have = new Set(b.milestones.map((m) => m.id));
  const earn = (id: string, ok: boolean) => {
    if (!ok || have.has(id)) return;
    have.add(id);
    const label = MILESTONES.find((m) => m.id === id)!.label;
    cur = inboxPush({ ...cur, company: { ...cur.company, confidence: clamp(cur.company.confidence + 4), board: { ...cur.company.board, milestones: [...cur.company.board.milestones, { id, week: g.week }] } } }, `Milestone: ${label}`, "The board has noted it.");
  };
  earn("first-win", b.wins >= 1);
  earn("50-wins", b.wins >= 50);
  earn("first-show", totalShows(g) >= 1);
  earn("world-champion", champions(g).length > 0);
  earn("undisputed", champions(g).some((f) => WORLD_BODIES.every((x) => f.titles.includes(x))));
  earn("stadium", g.shows.some((s) => s.statement && venueById(s.venue).capacity >= 40_000));
  earn("10m-show", g.shows.some((s) => s.statement && s.statement.revenue >= 10_000_000));
  // objectives met early
  for (const o of cur.company.board.objectives) {
    if (o.status !== "open" || o.kind === "profit" || !met(cur, o)) continue;
    cur = inboxPush({ ...cur, company: { ...cur.company, confidence: clamp(cur.company.confidence + 10), board: { ...cur.company.board, objectives: cur.company.board.objectives.map((x) => (x.id === o.id ? { ...x, status: "done" } : x)) } } }, "Board objective met", `${o.text}. Confidence is up.`);
  }
  // bankruptcy
  if (cur.company.board.weeksInRed >= RED_WEEKS_LIMIT) {
    cur = inboxPush({ ...cur, over: { week: g.week, reason: `Cash stayed below zero for ${RED_WEEKS_LIMIT} weeks. The board has removed you.` } }, "You have been fired", "The investors have taken control of the company. This save is over, but you can still look around it.");
  }
  return cur;
}

/** January: judge objectives that fall due, then set the new season's. */
export function boardSeason(g: GameSave, year: number): GameSave {
  let conf = g.company.confidence;
  let cur = g;
  const objectives = g.company.board.objectives.map((o) => {
    if (o.status !== "open" || o.dueYear > year) return o;
    const ok = met(g, o);
    conf += ok ? 10 : -12;
    cur = inboxPush(cur, ok ? "Board objective met" : "Board objective missed", `${o.text}. Confidence ${ok ? "is up" : "has fallen"}.`);
    return { ...o, status: ok ? ("done" as const) : ("failed" as const) };
  });
  const board: Board = { ...cur.company.board, objectives: [...objectives.filter((o) => o.status === "open" || o.dueYear >= year), ...seasonObjectives(g, year)].slice(-9), seasonWins: 0, seasonShows: 0, seasonStartCash: g.company.cash };
  return { ...cur, company: { ...cur.company, confidence: clamp(conf), board } };
}
