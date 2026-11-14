// A simple manager bot: signs mid-level fighters, takes sensible fights, books the most profitable venue.
import { gameYear } from "@/lib/sim/calendar";
import { DEFAULT_OFFER } from "@/lib/sim/contracts";
import { evaluateDeal, maxFee, signDeal } from "@/lib/sim/broadcast";
import { answerPresser, pendingPressers } from "@/lib/sim/drama";
import { overall } from "@/lib/sim/fighter";
import { advanceWeek, pendingPlayerFights } from "@/lib/sim/game";
import { finalAnswer, makeOffer, renewContract } from "@/lib/sim/market";
import { CAMP_DEFAULT, evaluateFightOffer, isFree, scheduleFight, shortlist } from "@/lib/sim/matchmaking";
import { computeRankings } from "@/lib/sim/rankings";
import { bookShow, project, promotedUnassigned, VENUES } from "@/lib/sim/shows";
import { acceptIncoming, clearOrderFor, quickSimFight } from "@/lib/sim/weekly";
import type { GameSave } from "@/lib/sim/types";

export function botWeek(g0: GameSave, stableSize = 6): GameSave {
  let g = g0;
  if (g.over) return g;
  const year = gameYear(g.startDate, g.week);
  for (const f of pendingPlayerFights(g)) g = quickSimFight(g, f.id);
  for (const f of pendingPressers(g)) g = answerPresser(g, f.id, "confident");
  for (const n of g.negotiations) g = finalAnswer(g, n.id);
  // re-sign anyone whose deal is up
  for (const id of g.company.stable) {
    const f = g.world.fighters[id];
    if (f?.contract && f.contract.fightsLeft <= 0) { const o = DEFAULT_OFFER(f, year); g = renewContract(g, id, { ...o, purse: Math.round(o.purse * 1.35), bonus: Math.round(o.bonus * 1.2) }).game; }
  }
  // sign
  if (g.company.stable.length < stableSize && g.week % 3 === 0) {
    const pool = Object.values(g.world.fighters).filter((f) => f.promoter === "independent" && f.pro && !f.retired && year - f.born < 31 && overall(f.ratings) >= 60 && overall(f.ratings) <= 80)
      .sort((a, b) => overall(b.ratings) - overall(a.ratings));
    for (const f of pool.slice(0, 12)) {
      const o = DEFAULT_OFFER(f, year);
      const offer = { ...o, purse: Math.round(o.purse * 1.3), bonus: Math.round(o.bonus * 1.2) };
      if (offer.bonus > g.company.cash * 0.25) continue;
      let r = makeOffer(g, f.id, offer);
      // a normal player takes a fair counter-offer
      if (r.outcome.kind === "counter" && r.outcome.decision?.kind === "counter" && r.outcome.decision.offer.purse * 3 + offer.bonus <= g.company.cash * 0.4) r = makeOffer(g, f.id, r.outcome.decision.offer);
      g = r.game;
      if (r.outcome.kind === "accept" || r.outcome.kind === "war") break;
    }
  }
  // broadcaster
  if (!g.company.deal && g.company.stable.length >= 3) {
    const best = g.world.broadcasters.filter((b) => b.id !== "ppv").map((b) => ({ b, fee: maxFee(g, b, { showsPerYear: 4, exclusive: false, ppvShare: 0.6 }) })).sort((x, y) => y.fee - x.fee)[0];
    const t = { showsPerYear: 4, feePerShow: best.fee, ppvShare: 0.6, exclusive: false, years: 2 };
    if (evaluateDeal(g, best.b, t).kind === "accept") g = signDeal(g, best.b, t);
  }
  // accept decent incoming offers, then make fights
  for (const o of g.incoming) g = acceptIncoming(g, o.id);
  const r = computeRankings(g.world);
  const wk = g.week + CAMP_DEFAULT;
  for (const id of g.company.stable) {
    const me = g.world.fighters[id];
    if (!me || me.retired || !isFree(g, id, wk) || g.fights.some((f) => !f.done && (f.a === id || f.b === id))) continue;
    const list = shortlist(g, r, me, wk).filter((c) => c.winChance >= 0.45).sort((a, b) => (b.titles.length - a.titles.length) || (b.score - a.score));
    for (const c of list) {
      if (c.terms.purseA + c.terms.purseB > Math.max(200_000, g.company.cash * 0.5)) continue;
      const d = evaluateFightOffer(g, r, me, c.fighter, c.terms, wk);
      const terms = d.kind === "accept" ? c.terms : d.kind === "counter" ? d.terms : null;
      if (!terms) continue;
      g = clearOrderFor(scheduleFight(g, id, c.fighter.id, wk, terms, "player", "player"), id, c.fighter.id, terms.titles);
      break;
    }
  }
  // shows: one per date, at the venue that projects the most profit
  const weeks = [...new Set(g.fights.filter((f) => !f.done && f.promoter === "player" && !f.showId).map((f) => f.week))];
  for (const w of weeks) {
    const fs = promotedUnassigned(g, w).slice(0, 8);
    if (!fs.length) continue;
    const dist = g.company.deal && g.company.deal.showsDone < g.company.deal.showsPerYear ? "deal" : "sale";
    const best = VENUES.map((v) => ({ v, p: project(g, v.id, fs, "standard", dist).profit })).sort((a, b) => b.p - a.p)[0];
    g = bookShow(g, { week: w, venue: best.v.id, fights: fs.map((f) => f.id), price: "standard", dist });
  }
  return advanceWeek(g);
}
