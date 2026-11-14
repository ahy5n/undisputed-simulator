import { describe, expect, it } from "vitest";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { DEFAULT_OFFER, signFighter } from "@/lib/sim/contracts";
import { answerPresser, heat, pendingPressers, rivalryAfter, RENEW_WEEKS } from "@/lib/sim/drama";
import { defaultTerms, scheduleFight } from "@/lib/sim/matchmaking";
import { renewContract } from "@/lib/sim/market";
import { project } from "@/lib/sim/shows";
import { quickSimFight } from "@/lib/sim/weekly";
import { ensureCamps } from "@/lib/sim/camps";
import type { FightResult } from "@/lib/sim/fight";
import type { GameSave } from "@/lib/sim/types";

const BASE: GameSave = { ...newGame({ companyName: "T", country: "GB", primary: "#000", secondary: "#fff", startingCash: 30_000_000 }), fights: [] };
const sign = (g: GameSave, id: string, fights = 3) => signFighter(g, id, { ...DEFAULT_OFFER(g.world.fighters[id], 2026), fights }, 2026);
function big(week = 8) {
  let g = sign(BASE, "anthony-joshua");
  const a = g.world.fighters["anthony-joshua"], b = g.world.fighters["dillian-whyte"];
  g = scheduleFight(g, a.id, b.id, week, defaultTerms(g, a, b, []), "player", "player");
  return noInjuries(g);
}
// a camp that never starts never rolls the injury dice, so the fight date holds
function noInjuries(g: GameSave): GameSave { return { ...ensureCamps(g), camps: ensureCamps(g).camps.map((c) => ({ ...c, start: 9999 })) }; }

describe("press conferences", () => {
  it("a big fight gets one two weeks out; small fights don't", () => {
    let g = big(8);
    for (let i = 0; i < 6; i++) g = advanceWeek(g);
    expect(pendingPressers(g).length).toBe(1);
    expect(g.inbox.some((m) => /Press conference/.test(m.title))).toBe(true);
  });
  it("tone changes hype, morale and bad blood; skip is neutral; it can only be answered once", () => {
    let g = big(8);
    for (let i = 0; i < 6; i++) g = advanceWeek(g);
    const id = pendingPressers(g)[0].id;
    const f0 = g.fights.find((x) => x.id === id)!;
    const opp0 = g.world.fighters[f0.b].morale;
    const trash = answerPresser(g, id, "trash"), nice = answerPresser(g, id, "respectful"), skip = answerPresser(g, id, "skip");
    const hype = (x: GameSave) => x.fights.find((q) => q.id === id)!.hype!;
    expect(hype(trash)).toBeGreaterThan(hype(skip));
    expect(hype(skip)).toBeGreaterThan(hype(nice) - 0.001);
    expect(trash.world.fighters[f0.b].morale).toBeGreaterThan(opp0);
    expect(heat(trash, f0.a, f0.b)).toBe(1);
    expect(heat(nice, f0.a, f0.b)).toBe(0);
    expect(pendingPressers(trash).length).toBe(0);
    expect(answerPresser(trash, id, "respectful")).toBe(trash);
    // hype sells
    const fs = (x: GameSave) => x.fights.filter((q) => q.id === id);
    expect(project(trash, "arena-l", fs(trash), "standard", "ppv").revenue).toBeGreaterThan(project(nice, "arena-l", fs(nice), "standard", "ppv").revenue);
  });
  it("an unanswered press conference resolves itself on fight week", () => {
    let g = big(8);
    for (let i = 0; i < 8; i++) g = advanceWeek(g);
    expect(pendingPressers(g).length).toBe(0);
    expect(g.fights.find((x) => x.a === "anthony-joshua")!.presser).toBe("done");
  });
});

describe("rivalries", () => {
  it("a split decision starts one and a rematch draws more", () => {
    const g = big(8);
    const f = g.fights[0];
    const r = { method: "SD", controversial: false } as FightResult;
    const after = rivalryAfter(g, f, r);
    expect(heat(after, f.a, f.b)).toBe(1);
    expect(rivalryAfter(g, f, { method: "UD", controversial: false } as FightResult)).toBe(g);
    expect(project(after, "arena-l", [f], "standard", "sale").revenue).toBeGreaterThan(project(g, "arena-l", [f], "standard", "sale").revenue);
  });
});

describe("contracts running out", () => {
  it("warns, waits four weeks, then the fighter leaves; re-signing keeps him", () => {
    // young fighters: the January rollover in this window can retire men in their late thirties
    let g = sign(BASE, "moses-itauma", 1);
    const a = g.world.fighters["moses-itauma"], b = g.world.fighters["johnny-fisher"];
    g = noInjuries(scheduleFight(g, a.id, b.id, 7, defaultTerms(g, a, b, []), "player", "player"));
    for (let i = 0; i < 7; i++) g = advanceWeek(g);
    g = quickSimFight(g, g.fights.find((x) => x.a === a.id)!.id);
    expect(g.world.fighters[a.id].contract!.fightsLeft).toBe(0);
    g = advanceWeek(g);
    expect(g.inbox.some((m) => /contract is up/.test(m.title))).toBe(true);
    expect(g.company.stable).toContain(a.id);
    // re-sign on generous terms
    const offer = DEFAULT_OFFER(g.world.fighters[a.id], 2027);
    const kept = renewContract(g, a.id, { ...offer, purse: offer.purse * 1.6, bonus: offer.bonus * 1.6 });
    expect(kept.outcome.kind).toBe("accept");
    expect(kept.game.world.fighters[a.id].contract!.fightsLeft).toBe(3);
    expect(kept.game.world.fighters[a.id].contract!.expiredWeek).toBeUndefined();
    // or do nothing and lose him
    let gone = g;
    for (let i = 0; i < RENEW_WEEKS + 1; i++) gone = advanceWeek(gone);
    expect(gone.company.stable).not.toContain(a.id);
    expect(gone.world.fighters[a.id].promoter).toBe("independent");
    let stays = kept.game;
    for (let i = 0; i < RENEW_WEEKS + 1; i++) stays = advanceWeek(stays);
    expect(stays.company.stable).toContain(a.id);
  });
});

describe("retirement", () => {
  it("a fighter with a fight booked does not retire at the January rollover", () => {
    for (let k = 0; k < 6; k++) {
      let g = big(10); // Joshua (37) v Whyte (38), fight after the rollover
      for (let i = 0; i < 9; i++) g = advanceWeek(g);
      expect(g.world.fighters["anthony-joshua"].retired).toBeFalsy();
      expect(g.world.fighters["dillian-whyte"].retired).toBeFalsy();
      expect(g.fights.some((f) => f.a === "anthony-joshua" && !f.done)).toBe(true);
    }
  });
});

import { olympicsDue, runOlympics, records, hallWeek } from "@/lib/sim/legacy";
import { Rng } from "@/lib/sim/rng";
import { DIVISIONS } from "@/lib/sim/types";

describe("Olympics, Hall of Fame and records", () => {
  it("the Games are due in August of 2028 and run once", () => {
    let g = BASE;
    expect(olympicsDue(g)).toBeNull();
    g = { ...g, startDate: "2028-08-05", week: 0 };
    expect(olympicsDue(g)).toBe(2028);
    const after = runOlympics(g, 2028, new Rng(1));
    expect(olympicsDue(after)).toBeNull();
    expect(after.hall.olympics[0].medals.length).toBe(DIVISIONS.length);
  });
  it("medallists get a medal, a popularity jump and a high ceiling", () => {
    const g = runOlympics({ ...BASE, startDate: "2028-08-05" }, 2028, new Rng(2));
    const golds = g.hall.olympics[0].medals.map((m) => Object.values(g.world.fighters).find((f) => f.name === m.gold && f.amateur?.medal)!);
    for (const f of golds) { expect(f.amateur?.medal).toMatch(/Gold 2028/); expect(f.potential).toBeGreaterThanOrEqual(4); expect(f.popularity).toBeGreaterThanOrEqual(20); }
    expect(g.inbox[0].title).toMatch(/Olympic boxing/);
  });
  it("records an undisputed champion exactly once", () => {
    const belts = structuredClone(BASE.world.belts);
    for (const b of ["WBC", "WBA", "IBF", "WBO"] as const) belts.heavyweight[b] = "oleksandr-usyk";
    const g = hallWeek({ ...BASE, world: { ...BASE.world, belts } });
    expect(g.hall.undisputed.length).toBe(1);
    expect(hallWeek(g).hall.undisputed.length).toBe(1);
  });
  it("records compile from history without error", () => {
    let g = BASE;
    for (let i = 0; i < 20; i++) g = advanceWeek(g);
    const r = records(g, (id) => id);
    expect(r.mostKos.length).toBeGreaterThan(0);
    expect(r.promoter.w + r.promoter.l + r.promoter.d).toBe(0);
  });
});
