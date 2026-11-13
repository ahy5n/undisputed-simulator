import type { Rng } from "./rng";
import type { FightEvent, FightState, RoundSummary } from "./fight";

const last = (n: string) => n.split(" ").slice(-1)[0];

const OPEN = [
  "The bell goes for round {r}.", "Round {r} gets under way.", "Seconds out. Round {r}.", "Here we go, round {r}.",
];
const JAB = [
  "{a} is finding range with the jab.", "A stiff jab from {a} snaps {b}'s head back.", "{a} keeps {b} at the end of the jab.",
  "Double jab from {a}, then a probing right.",
];
const POWER = [
  "{a} lands a heavy right hand.", "A big left hook from {a} lands flush.", "{a} drives a straight shot through the guard.",
  "{a} lets the right hand go and it connects.",
];
const BODY = ["{a} digs a hook to the body.", "Thudding body shot from {a}.", "{a} is working the ribs now and {b} feels it."];
const COUNTER = ["{a} slips and counters sharply.", "Beautiful counter from {a} as {b} comes in.", "{b} walks onto a counter from {a}."];
const QUIET = ["Feeling-out stuff, both men measuring.", "A tense few seconds with little landing.", "Both fighters circle, waiting for an opening."];
const SWARM = ["{a} is all over {b} with a flurry.", "{a} fires off a four-punch combination.", "{a} is throwing in bunches."];
const KD = [
  "{b} is down! {a} has dropped {b}!", "Knockdown! {b} goes to the canvas!", "{b} hits the deck after a clean shot from {a}!",
];
const HURT = ["{b} is hurt and looks unsteady.", "{b}'s legs wobble, he's in trouble.", "{b} grabs on to survive."];
const CUT = ["There's a cut over {b}'s eye.", "{b} is bleeding from a cut.", "A nasty cut opens up on {b}."];
const SWELL = ["{b}'s eye is starting to swell.", "Swelling is building around {b}'s eye."];
const CLINCH = ["Lots of clinching, the referee works to separate them.", "They tie up again and the referee breaks them."];
const END_FAST = ["Fast finish to the round.", "Good last ten seconds from both men.", "The bell rings, and that was a busy round."];

function fill(t: string, a: string, b: string) { return t.replace(/\{a\}/g, a).replace(/\{b\}/g, b); }

/** Turn a played round into 8-12 lines of commentary. Pure given the rng. */
export function commentate(state: FightState, sum: RoundSummary, rng: Rng, showCards: boolean): string[] {
  const A = last(state.a.fighter.name), B = last(state.b.fighter.name);
  const lines: string[] = [];
  const say = (pool: string[], who: "a" | "b") => lines.push(who === "a" ? fill(rng.pick(pool), A, B) : fill(rng.pick(pool), B, A));
  lines.push(rng.pick(OPEN).replace("{r}", String(sum.round)));
  const ev = sum.events;

  // opening exchanges driven by stats
  const sa = sum.a, sb = sum.b;
  const jabLeader = sa.jabsLanded >= sb.jabsLanded ? "a" : "b";
  if (Math.max(sa.jabsLanded, sb.jabsLanded) >= 3) say(JAB, jabLeader); else say(QUIET, "a");
  if (sa.thrown + sb.thrown > 150) say(SWARM, sa.thrown >= sb.thrown ? "a" : "b");
  if (ev.some((e) => e.type === "shout" && e.followed)) {
    const e = ev.find((x) => x.type === "shout" && x.followed) as Extract<FightEvent, { type: "shout" }>;
    const corner = e.side === "a" ? A : B;
    const text: Record<string, string> = { jab: "Jab!", move: "Move your feet!", body: "Body!", "tie-up": "Tie him up!", hands: "Let your hands go!" };
    lines.push(`${corner}'s corner shouts "${text[e.shout]}" and he responds.`);
  } else if (ev.some((e) => e.type === "shout")) lines.push("The instruction from the corner seems to go unheard.");

  for (const e of ev) {
    if (e.type === "exchange") {
      const pool = e.kind === "body" ? BODY : e.kind === "counter" ? COUNTER : e.kind === "jab" ? JAB : POWER;
      say(pool, e.side);
    }
    if (e.type === "hurt") say(HURT, e.side === "a" ? "b" : "a");
    if (e.type === "cut") say(CUT, e.side === "a" ? "b" : "a");
    if (e.type === "swelling") say(SWELL, e.side === "a" ? "b" : "a");
    if (e.type === "clinch") say(CLINCH, "a");
    if (e.type === "deduction") lines.push(`The referee takes a point from ${e.side === "a" ? A : B} for ${e.reason}.`);
    if (e.type === "knockdown") {
      say(KD, e.side === "a" ? "b" : "a");
      lines.push(`The referee begins the count over ${e.side === "a" ? A : B}...`);
    }
    if (e.type === "stoppage") {
      const loser = e.side === "a" ? A : B, winner = e.side === "a" ? B : A;
      lines.push(
        e.reason === "ko" ? `That's it! ${loser} can't beat the count. ${winner} wins by knockout!`
        : e.reason === "cut" ? `The doctor waves it off, the cut is too bad. ${winner} wins by TKO!`
        : e.reason === "corner" ? `${loser}'s corner throws in the towel. ${winner} wins by TKO!`
        : `The referee has seen enough and stops it. ${winner} wins by TKO!`,
      );
    }
  }
  // pad to ~8-12 lines with stat-driven filler
  const fillers = [
    () => say(POWER, sa.powerLanded >= sb.powerLanded ? "a" : "b"),
    () => say(JAB, sb.jabsLanded >= sa.jabsLanded ? "b" : "a"),
    () => say(QUIET, "b"),
    () => say(COUNTER, rng.chance(0.5) ? "a" : "b"),
    () => say(BODY, rng.chance(0.5) ? "a" : "b"),
  ];
  const stoppageIdx = lines.findIndex((l) => /wins by/.test(l));
  const target = rng.int(8, 12);
  while (lines.length < target - 1) {
    const f = rng.pick(fillers);
    const before = lines.length;
    f();
    if (stoppageIdx >= 0 && lines.length > before) { const l = lines.pop()!; lines.splice(stoppageIdx, 0, l); }
  }
  if (!state.over) lines.push(fill(rng.pick(END_FAST), A, B));
  if (showCards && sum.cards.length) {
    lines.push(`Cards for the round: ${sum.cards.map(([a, b]) => `${a}-${b}`).join(", ")} (${A}-${B}).`);
  }
  return lines;
}
