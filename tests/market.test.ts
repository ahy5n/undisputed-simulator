import { describe, expect, it } from "vitest";
import { newGame, advanceWeek } from "@/lib/sim/game";
import { DEFAULT_OFFER, evaluateOffer, ctxFor, askPurse, offerValue } from "@/lib/sim/contracts";
import { finalAnswer, makeOffer, releaseFighter, sellContract, raiseBid } from "@/lib/sim/market";
import { gameYear } from "@/lib/sim/calendar";
import { overall } from "@/lib/sim/fighter";
import type { GameSave } from "@/lib/sim/types";

const fresh = () => newGame({ companyName: "Test", country: "GB", primary: "#000", secondary: "#fff", startingCash: 5_000_000 });
const year = (g: GameSave) => gameYear(g.startDate, g.week);

describe("offers", () => {
  const g = fresh();
  const f = Object.values(g.world.fighters).find((x) => x.promoter === "independent" && x.pro && overall(x.ratings) > 60 && overall(x.ratings) < 70 && x.record.l > 0)!;
  const ctx = ctxFor(g);
  it("accepts a fair offer, counters a slightly low one, refuses a lowball", () => {
    const base = DEFAULT_OFFER(f, year(g));
    const scaled = (k: number) => ({ ...base, purse: base.purse * k, bonus: base.bonus * k });
    expect(evaluateOffer(f, scaled(1.3), year(g), ctx).kind).toBe("accept");
    const mid = evaluateOffer(f, scaled(1.0), year(g), ctx); // new company pays a small premium: default ask is a counter
    expect(["counter", "accept"]).toContain(mid.kind);
    expect(evaluateOffer(f, scaled(0.7), year(g), ctx).kind).toBe("refuse");
    expect(evaluateOffer(f, scaled(0.3), year(g), ctx).kind).toBe("refuse");
  });
  it("a counter-offer is itself acceptable", () => {
    const base = DEFAULT_OFFER(f, year(g));
    for (const k of [0.78, 0.85, 0.9, 0.95]) {
      const o = { ...base, purse: base.purse * k, bonus: base.bonus * k };
      const d = evaluateOffer(f, o, year(g), ctx);
      if (d.kind === "counter") {
        expect(d.offer.purse).toBeGreaterThan(o.purse);
        expect(evaluateOffer(f, d.offer, year(g), ctx).kind).toBe("accept");
      }
    }
  });
  it("more money never makes a fighter less willing", () => {
    const base = DEFAULT_OFFER(f, year(g));
    let last = -1;
    const rank = { refuse: 0, counter: 1, accept: 2 } as const;
    for (const k of [0.2, 0.5, 0.7, 0.8, 0.9, 1.0, 1.2, 1.6]) {
      const r = rank[evaluateOffer(f, { ...base, purse: base.purse * k, bonus: base.bonus * k }, year(g), ctx).kind];
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(offerValue(base)).toBeGreaterThan(0);
    expect(askPurse(f, year(g))).toBeGreaterThanOrEqual(1000);
  });
  it("a star turns down a nobody promoter with a clear reason", () => {
    const star = Object.values(g.world.fighters).find((x) => x.promoter === "independent" && x.pro && overall(x.ratings) >= 85)!;
    const d = evaluateOffer(star, { bonus: 10000, fights: 3, purse: 20000, cut: 0.3 }, year(g), ctx);
    expect(d.kind).toBe("refuse");
  });
});

describe("signing, releasing, selling", () => {
  it("signs a normal free agent and charges the bonus", () => {
    const g = fresh();
    const f = Object.values(g.world.fighters).find((x) => x.promoter === "independent" && x.pro && x.record.l > 2 && overall(x.ratings) < 62 && x.record.w < 40)!;
    const offer = { ...DEFAULT_OFFER(f, year(g)) };
    offer.purse *= 1.4; offer.bonus *= 1.4;
    const { game, outcome } = makeOffer(g, f.id, offer);
    expect(outcome.kind).toBe("accept");
    expect(game.company.stable).toContain(f.id);
    expect(game.company.cash).toBe(g.company.cash - offer.bonus);
    expect(game.world.fighters[f.id].promoter).toBe("player");
    // release pays the remaining guarantee
    const rel = releaseFighter(game, f.id);
    expect(rel.company.cash).toBe(game.company.cash - offer.purse * offer.fights);
    expect(rel.world.fighters[f.id].promoter).toBe("independent");
    // sell brings money in
    const sold = sellContract(game, f.id);
    expect(sold.company.cash).toBeGreaterThanOrEqual(game.company.cash);
    expect(sold.company.stable).not.toContain(f.id);
  });
  it("refuses an offer you cannot afford", () => {
    const g = fresh();
    const f = Object.values(g.world.fighters).find((x) => x.promoter === "independent" && x.pro)!;
    expect(makeOffer(g, f.id, { bonus: 99_000_000, fights: 3, purse: 1000, cut: 0.2 }).outcome.kind).toBe("unaffordable");
  });
});

describe("bidding wars", () => {
  it("a hot fighter starts a war that resolves within three weeks", () => {
    const g = fresh();
    const hot = Object.values(g.world.fighters).filter((x) => x.promoter === "independent" && x.pro && overall(x.ratings) >= 82).sort((a, b) => overall(b.ratings) - overall(a.ratings))[0];
    expect(hot).toBeDefined();
    const base = DEFAULT_OFFER(hot, year(g));
    const { game, outcome } = makeOffer(g, hot.id, { ...base, purse: base.purse * 1.3, bonus: base.bonus * 1.3 });
    expect(outcome.kind).toBe("war");
    expect(game.negotiations.length).toBe(1);
    expect(game.negotiations[0].rivals.length).toBeGreaterThan(0);
    let cur = game;
    for (let i = 0; i < 4 && cur.negotiations.length; i++) cur = advanceWeek(cur);
    expect(cur.negotiations.length).toBe(0);
    // other messages (e.g. a fight offer for the man you just signed) can land in the same week
    const msg = cur.inbox.find((m) => /bidding war/i.test(m.title));
    expect(msg).toBeDefined();
    expect(msg!.body).toMatch(/Chose/);
  });
  it("raising and giving a final answer resolve immediately", () => {
    const g = fresh();
    const hot = Object.values(g.world.fighters).filter((x) => x.promoter === "independent" && x.pro && overall(x.ratings) >= 82)[0];
    const base = DEFAULT_OFFER(hot, year(g));
    const { game } = makeOffer(g, hot.id, base);
    const raised = raiseBid(game, game.negotiations[0].id, { ...base, purse: base.purse * 2, bonus: base.bonus * 2 });
    const done = finalAnswer(raised, raised.negotiations[0].id);
    expect(done.negotiations.length).toBe(0);
  });
});

describe("signing a fighter who is already booked", () => {
  it("tells you about the fight he brings with him", () => {
    const g = newGame({ companyName: "Test", country: "GB", primary: "#000", secondary: "#fff", startingCash: 50_000_000 });
    const booked = g.fights.map((f) => g.world.fighters[f.a]).find((f) => f.promoter === "independent" && overall(f.ratings) < 70 && f.record.l > 1);
    expect(booked).toBeDefined();
    const base = DEFAULT_OFFER(booked!, year(g));
    const { game, outcome } = makeOffer(g, booked!.id, { ...base, purse: base.purse * 2, bonus: base.bonus * 2 });
    if (outcome.kind === "accept") expect(game.inbox.some((m) => /already has a fight booked/.test(m.title))).toBe(true);
    else expect(outcome.kind).toBe("war");
  });
});
