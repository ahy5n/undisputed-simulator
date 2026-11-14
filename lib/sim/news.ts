import { hashSeed } from "./rng";
import { overall, surname } from "./fighter";
import { DIVISION_LABEL, type FightRecord, type GameSave, type WorldBody } from "./types";

export interface Story { id: string; week: number; kind: "title" | "upset" | "ko" | "result" | "yours"; headline: string; detail: string; weight: number; quote?: { who: string; text: string } }

const last = surname;
const pick = <T,>(xs: T[], seed: string) => xs[hashSeed(seed) % xs.length];
const methodText = (h: FightRecord) =>
  h.method === "KO" ? `knockout in round ${h.round}` : h.method === "TKO" ? `stoppage in round ${h.round}`
  : h.method === "UD" ? "unanimous decision" : h.method === "SD" ? "split decision" : h.method === "MD" ? "majority decision" : h.method;

const REACT_WIN = ["Told you all. Nobody at this weight lives with me.", "Hard camp, easy night. Who's next?", "That one was for everyone who doubted me.", "I want the belts. All of them."];
const REACT_FAN = ["Robbery. I had it the other way.", "Fight of the year contender, that.", "He looked a level above tonight.", "Run it back. Immediately.", "That chin is made of granite."];
const REACT_PUNDIT = ["He boxed to a plan and never left it.", "The jab won that fight, plain and simple.", "The pressure told in the second half.", "A changing of the guard in the division."];

/**
 * Turn one fight record into a story. `before` is the world before the fight (to know who held the belt);
 * pass the current game when that is unknown and title stories read as plain title fights.
 */
export function storyFor(g: GameSave, h: FightRecord, i: number, before?: GameSave): Story {
  const F = g.world.fighters;
  const A = F[h.a], B = F[h.b];
  const id = `${h.week}-${h.a}-${h.b}-${i}`;
  const div = DIVISION_LABEL[h.division].toLowerCase();
  const yours = A?.promoter === "player" || B?.promoter === "player";
  if (!h.winner) {
    return { id, week: h.week, kind: yours ? "yours" : "result", headline: `${last(h.aName)} and ${last(h.bName)} fight to a draw`, detail: `Nothing to split ${h.aName} and ${h.bName} at ${div}.`, weight: (h.titles.length ? 60 : 10) + (yours ? 50 : 0) };
  }
  const wName = h.winner === "a" ? h.aName : h.bName, lName = h.winner === "a" ? h.bName : h.aName;
  const wId = h.winner === "a" ? h.a : h.b;
  const W = F[wId], L = F[h.winner === "a" ? h.b : h.a];
  const stop = h.method === "KO" || h.method === "TKO";
  const pop = Math.max(A?.popularity ?? 0, B?.popularity ?? 0);
  const quoteSeed = id;
  const quote = hashSeed(quoteSeed) % 3 === 0 ? { who: wName, text: pick(REACT_WIN, quoteSeed) } : hashSeed(quoteSeed) % 3 === 1 ? { who: "Ringside fan", text: pick(REACT_FAN, quoteSeed) } : { who: "TV pundit", text: pick(REACT_PUNDIT, quoteSeed) };
  if (h.titles.length) {
    const belts = h.titles.join("/");
    const wasChamp = before ? h.titles.some((b: WorldBody) => before.world.belts[h.division][b] === wId) : undefined;
    const headline = wasChamp === false ? `And the new! ${last(wName)} takes the ${belts} ${div} title` : wasChamp ? `And still! ${last(wName)} keeps the ${belts} ${div} title` : `${last(wName)} wins ${belts} ${div} title fight`;
    return { id, week: h.week, kind: yours ? "yours" : "title", headline, detail: `${wName} beat ${lName} by ${methodText(h)}.`, weight: 100 + h.titles.length * 20 + pop / 5 + (yours ? 60 : 0), quote };
  }
  const gap = W && L ? overall(L.ratings) - overall(W.ratings) : 0;
  if (gap >= 7) return { id, week: h.week, kind: yours ? "yours" : "upset", headline: `Upset! ${last(wName)} stuns ${last(lName)}`, detail: `${wName} was the underdog and won by ${methodText(h)} at ${div}.`, weight: 50 + gap + pop / 5 + (yours ? 60 : 0), quote };
  if (stop && h.round <= 3) return { id, week: h.week, kind: yours ? "yours" : "ko", headline: `${last(wName)} flattens ${last(lName)} inside ${h.round === 1 ? "a round" : `${h.round} rounds`}`, detail: `A ${methodText(h)} for ${wName} at ${div}.`, weight: 30 + pop / 4 + (yours ? 60 : 0), quote };
  return { id, week: h.week, kind: yours ? "yours" : "result", headline: `${last(wName)} beats ${last(lName)}`, detail: `${wName} won by ${methodText(h)} at ${div}.`, weight: pop / 4 + (yours ? 60 : 0), quote: pop > 55 ? quote : undefined };
}

export interface WeekReport { fromWeek: number; toWeek: number; cashStart: number; cashEnd: number; stories: Story[]; fights: number; notes: string[] }

/** What happened between two game states: the back page after you ring the bell. */
export function weekReport(before: GameSave, after: GameSave): WeekReport {
  const fresh = after.history.slice(before.history.length);
  const stories = fresh.map((h, i) => storyFor(after, h, i, before)).sort((a, b) => b.weight - a.weight).slice(0, 7);
  const seen = new Set(before.inbox.map((m) => m.id));
  const notes = after.inbox.filter((m) => !seen.has(m.id)).map((m) => m.title).slice(0, 6);
  return { fromWeek: before.week, toWeek: after.week, cashStart: before.company.cash, cashEnd: after.company.cash, stories, fights: fresh.length, notes };
}

/** Latest stories for the Feed, newest first. */
export function feed(g: GameSave, n = 40): Story[] {
  const start = Math.max(0, g.history.length - 250);
  return g.history.slice(start).map((h, i) => storyFor(g, h, start + i))
    .filter((s) => s.kind !== "result" || s.weight >= 12)
    .sort((a, b) => b.week - a.week || b.weight - a.weight).slice(0, n);
}
