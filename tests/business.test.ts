import { describe, expect, it } from "vitest";
import { advanceWeek, newGame } from "@/lib/sim/game";
import { DEFAULT_OFFER, signFighter } from "@/lib/sim/contracts";
import { appeal, crossFactor, dealSeason, dealShowDone, evaluateDeal, maxFee, signDeal, trustIn } from "@/lib/sim/broadcast";
import { boardSeason, boardWeek, RED_WEEKS_LIMIT } from "@/lib/sim/board";
import { defaultTerms, scheduleFight } from "@/lib/sim/matchmaking";
import { bookShow, project } from "@/lib/sim/shows";
import { quickSimFight } from "@/lib/sim/weekly";
import type { DealTerms, GameSave } from "@/lib/sim/types";

const BASE: GameSave = { ...newGame({ companyName: "T", country: "GB", primary: "#000", secondary: "#fff", startingCash: 3_000_000 }), fights: [] };
const sign = (g: GameSave, id: string) => signFighter(g, id, DEFAULT_OFFER(g.world.fighters[id], 2026), 2026);
const B = (id: string) => BASE.world.broadcasters.find((b) => b.id === id)!;
const terms = (fee: number): DealTerms => ({ showsPerYear: 4, feePerShow: fee, ppvShare: 0.6, exclusive: false, years: 2 });

describe("broadcaster deals", () => {
  const withStars = sign(sign({ ...BASE, company: { ...BASE.company, cash: 50_000_000 } }, "anthony-joshua"), "dillian-whyte");
  it("nobody deals with an empty stable", () => {
    expect(evaluateDeal(BASE, B("sky-sports"), terms(10_000)).kind).toBe("walk");
  });
  it("preferences matter: Sky values British heavyweights more than ESPN does", () => {
    expect(appeal(withStars, B("sky-sports")).score).toBeGreaterThan(appeal(withStars, B("espn")).score);
    expect(appeal(withStars, B("sky-sports")).reasons.join(" ")).toMatch(/British|heavyweight/);
  });
  it("accepts at or below their ceiling, counters a bit above, walks far above", () => {
    const top = maxFee(withStars, B("sky-sports"), terms(0));
    expect(top).toBeGreaterThan(50_000);
    expect(evaluateDeal(withStars, B("sky-sports"), terms(top)).kind).toBe("accept");
    const c = evaluateDeal(withStars, B("sky-sports"), terms(top * 1.3));
    expect(c.kind).toBe("counter");
    if (c.kind === "counter") expect(evaluateDeal(withStars, B("sky-sports"), c.terms).kind).toBe("accept");
    expect(evaluateDeal(withStars, B("sky-sports"), terms(top * 3)).kind).toBe("walk");
  });
  it("exclusivity and giving up PPV share both raise the fee", () => {
    const base = maxFee(withStars, B("dazn"), terms(0));
    expect(maxFee(withStars, B("dazn"), { ...terms(0), exclusive: true })).toBeGreaterThan(base);
    expect(maxFee(withStars, B("dazn"), { ...terms(0), ppvShare: 0.4 })).toBeGreaterThan(base);
  });
  it("a deal pays its fee on a show; flops and missed dates cost trust; the deal expires", () => {
    let g = signDeal(withStars, B("sky-sports"), terms(100_000));
    const a = g.world.fighters["anthony-joshua"], o = g.world.fighters["joseph-parker"];
    g = scheduleFight(g, a.id, o.id, 8, defaultTerms(g, a, o, []), "player", "player");
    const p = project(g, "arena-l", g.fights, "standard", "deal");
    expect(p.lines.some((l) => /Sky Sports fee/.test(l.label) && l.amount === 100_000)).toBe(true);
    const t0 = trustIn(g, "sky-sports");
    expect(trustIn(dealShowDone(g, 0.3), "sky-sports")).toBeLessThan(t0);
    expect(trustIn(dealShowDone(g, 0.95), "sky-sports")).toBeGreaterThan(t0);
    const missed = dealSeason(g, 2027);
    expect(trustIn(missed, "sky-sports")).toBeLessThan(t0);
    expect(missed.company.deal).toBeDefined();
    expect(dealSeason(g, 2028).company.deal).toBeUndefined();
    // lower trust means a lower ceiling at renewal
    expect(maxFee(missed, B("sky-sports"), terms(0))).toBeLessThan(maxFee(g, B("sky-sports"), terms(0)));
    // show settles with the fee and counts toward the deal
    g = bookShow(g, { week: 8, venue: "arena-l", fights: g.fights.map((f) => f.id), price: "standard", dist: "deal" });
    g = quickSimFight(g, g.fights[0].id);
    expect(g.company.deal!.showsDone).toBe(1);
  });
  it("fights across rival broadcasters cost more than in-house ones", () => {
    const g = signDeal(withStars, B("sky-sports"), { ...terms(100_000), exclusive: true });
    const mine = g.world.fighters["anthony-joshua"];
    const dazn = Object.values(g.world.fighters).find((f) => f.promoter === "matchroom")!;
    const free = Object.values(g.world.fighters).find((f) => f.promoter === "independent" && f.pro)!;
    expect(crossFactor(g, mine, dazn)).toBeGreaterThan(crossFactor(g, mine, free));
    expect(crossFactor(g, mine, dazn)).toBe(1.3);
  });
});

describe("board, objectives and bankruptcy", () => {
  it("starts with three objectives and a neutral board", () => {
    expect(BASE.company.board.objectives.length).toBe(3);
    expect(BASE.company.confidence).toBe(50);
  });
  it("signing three fighters meets the stable objective and lifts confidence", () => {
    const ids = Object.values(BASE.world.fighters).filter((f) => f.promoter === "independent" && f.pro).slice(-3).map((f) => f.id);
    let g = BASE;
    for (const id of ids) g = sign(g, id);
    g = boardWeek(g);
    expect(g.company.board.objectives.find((o) => o.kind === "stable")!.status).toBe("done");
    expect(g.company.confidence).toBeGreaterThan(50);
  });
  it("eight weeks in the red ends the save, and time stops", () => {
    let g: GameSave = { ...BASE, company: { ...BASE.company, cash: -1 } };
    for (let i = 0; i < RED_WEEKS_LIMIT - 1; i++) { g = advanceWeek(g); expect(g.over).toBeUndefined(); }
    g = advanceWeek(g);
    expect(g.over).toBeDefined();
    expect(g.company.confidence).toBeLessThan(50);
    const w = g.week;
    expect(advanceWeek(g).week).toBe(w);
  });
  it("getting back above zero resets the countdown", () => {
    let g: GameSave = { ...BASE, company: { ...BASE.company, cash: -1 } };
    for (let i = 0; i < 5; i++) g = advanceWeek(g);
    g = advanceWeek({ ...g, company: { ...g.company, cash: 1_000_000 } });
    expect(g.company.board.weeksInRed).toBe(0);
  });
  it("January judges due objectives and sets new ones", () => {
    const g = boardSeason({ ...BASE, company: { ...BASE.company, cash: BASE.company.cash - 500_000, board: { ...BASE.company.board, objectives: [{ id: "profit-2026", kind: "profit", text: "Make a profit in 2026", target: 1, dueYear: 2027, status: "open" }] } } }, 2027);
    expect(g.company.confidence).toBeLessThan(50);
    expect(g.company.board.objectives.some((o) => o.id === "profit-2027" && o.status === "open")).toBe(true);
    expect(g.company.board.objectives.find((o) => o.id === "profit-2026")!.status).toBe("failed");
  });
  it("a win is counted once and earns the first-win milestone", () => {
    let g = sign(BASE, "anthony-joshua");
    const a = g.world.fighters["anthony-joshua"];
    const weak = Object.values(g.world.fighters).filter((f) => f.division === "heavyweight" && f.pro && f.promoter === "independent").pop()!;
    g = scheduleFight(g, a.id, weak.id, 8, defaultTerms(g, a, weak, []), "player", "player");
    g = quickSimFight(g, g.fights[0].id);
    const won = g.history[g.history.length - 1].winner === "a";
    g = boardWeek(boardWeek(g));
    expect(g.company.board.wins).toBe(won ? 1 : 0);
    if (won) expect(g.company.board.milestones.some((m) => m.id === "first-win")).toBe(true);
  });
});
