import { expect, it } from "vitest";
import { gameYear } from "@/lib/sim/calendar";
import { overall } from "@/lib/sim/fighter";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { computeRankings } from "@/lib/sim/rankings";
import { rankedIds, realisticOpponents } from "@/lib/sim/weekly";
import { DIVISIONS, WORLD_BODIES, type GameSave } from "@/lib/sim/types";
import { botWeek } from "./bot";

const start = (cash = 3_000_000) => newGame({ companyName: "Bot", country: "GB", primary: "#000", secondary: "#fff", startingCash: cash });
const m = (n: number) => `£${(n / 1e6).toFixed(2)}m`;

it("20 seasons, world only: stays healthy and fast", () => {
  let g: GameSave = start(1e12); // an idle owner with bottomless pockets: this run is about the world, not the books
  const t0 = Date.now(); let worst = 0;
  for (let w = 0; w < 52 * 20; w++) { const t = Date.now(); g = advanceWeek(g); worst = Math.max(worst, Date.now() - t); }
  const ms = Date.now() - t0;
  const active = Object.values(g.world.fighters).filter((f) => f.pro && !f.retired);
  const ov = active.map((f) => overall(f.ratings));
  const vac = DIVISIONS.flatMap((d) => WORLD_BODIES.map((b) => g.world.belts[d][b])).filter((x) => !x).length;
  const r = computeRankings(g.world);
  let minOpp = 99; for (const id of rankedIds(g, r)) minOpp = Math.min(minOpp, realisticOpponents(g, g.world.fighters[id]));
  const bytes = JSON.stringify(g).length;
  const stoppages = g.history.filter((h) => h.method === "KO" || h.method === "TKO").length / g.history.length;
  console.log(`WORLD 20y: ${ms}ms total, ${(ms / 1040).toFixed(0)}ms/week avg, worst ${worst}ms | fighters ${Object.keys(g.world.fighters).length} (active pros ${active.length}) | history ${g.history.length} | save ${(bytes / 1e6).toFixed(1)}MB | mean ovr ${(ov.reduce((a, b) => a + b, 0) / ov.length).toFixed(1)} top ${Math.max(...ov)} | vacant belts ${vac}/32 | min realistic opponents ${minOpp} | stoppage rate ${(stoppages * 100).toFixed(0)}% | undisputed ${g.hall.undisputed.length} | hall ${g.hall.inductees.length} | olympics ${g.hall.olympics.map((o) => o.year).join(",")}`);
  expect(minOpp).toBeGreaterThanOrEqual(3);
  expect(vac).toBeLessThan(8);
  expect(g.hall.olympics.length).toBe(5);
  expect(bytes).toBeLessThan(40e6);
});

it("bot careers on the default £3m budget", () => {
  const out: string[] = [];
  let fired = 0, champs = 0;
  for (let k = 0; k < 4; k++) {
    let g: GameSave = start();
    const line: string[] = [];
    for (let w = 0; w < 52 * 8 && !g.over; w++) {
      g = botWeek(g);
      if (w % 52 === 51) line.push(`${gameYear(g.startDate, g.week)}:${m(g.company.cash)}/c${g.company.confidence}/s${g.company.stable.length}`);
    }
    if (g.over) fired++;
    const titled = g.company.stable.filter((id) => g.world.fighters[id]?.titles.length).length;
    champs += titled;
    const shows = g.shows.filter((s) => s.statement);
    out.push(`BOT ${k}: ${g.over ? "FIRED wk " + g.over.week : "alive"} | ${line.join(" ")} | wins ${g.company.board.wins} | shows ${shows.length} avg profit ${m(shows.reduce((t, s) => t + s.statement!.profit, 0) / Math.max(1, shows.length))} | champions ${titled} | milestones ${g.company.board.milestones.map((x) => x.id).join(",")}`);
  }
  out.forEach((l) => console.log(l));
  console.log(`BOT summary: fired ${fired}/4, champions held at end ${champs}`);
  expect(fired).toBeLessThan(4);
});
