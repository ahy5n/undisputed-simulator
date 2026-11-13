"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import { gameYear } from "@/lib/sim/calendar";
import { DEFAULT_OFFER, askPurse, contractSalePrice, offerCommitment, offerValue, releaseCost } from "@/lib/sim/contracts";
import { ageAt, overall, stars } from "@/lib/sim/fighter";
import { finalAnswer, makeOffer, raiseBid, releaseFighter, sellContract, type OfferOutcome } from "@/lib/sim/market";
import { DIVISIONS, DIVISION_LABEL, type Division, type Fighter, type Offer } from "@/lib/sim/types";
import { Btn, Card, FighterRow, H, money } from "./ui";

function Sheet({ children, close, label }: { children: React.ReactNode; close: () => void; label: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:items-center" onClick={close} role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-8 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function Stepper({ label, value, set, step, min, max, fmt }: { label: string; value: number; set: (v: number) => void; step: number; min: number; max: number; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button aria-label={`Decrease ${label}`} className="h-11 w-11 rounded-lg border border-line text-lg" onClick={() => set(Math.max(min, value - step))}>−</button>
        <span className="num w-24 text-center font-semibold">{fmt(value)}</span>
        <button aria-label={`Increase ${label}`} className="h-11 w-11 rounded-lg border border-line text-lg" onClick={() => set(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

function OfferSheet({ f, close, onWar }: { f: Fighter; close: () => void; onWar: () => void }) {
  const { game, update } = useGame();
  const year = game ? gameYear(game.startDate, game.week) : 2026;
  const ask = askPurse(f, year);
  const [offer, setOffer] = useState<Offer>(() => DEFAULT_OFFER(f, year));
  const [outcome, setOutcome] = useState<OfferOutcome | null>(null);
  if (!game) return null;
  const step = Math.max(1000, Math.round(ask * 0.05 / 1000) * 1000);
  function submit(o: Offer) {
    const r = makeOffer(game!, f.id, o);
    update(() => r.game);
    setOutcome(r.outcome);
    if (r.outcome.kind === "war") onWar();
  }
  const done = outcome?.kind === "accept";
  return (
    <Sheet close={close} label={`Offer to ${f.name}`}>
      <h2 className="display text-3xl font-bold leading-none">Offer to {f.name}</h2>
      <p className="mt-1 text-sm text-muted">He is looking for about <span className="num font-semibold text-fg">{money(ask)}</span> a fight.</p>
      <div className="mt-4 space-y-3">
        <Stepper label="Signing bonus" value={offer.bonus} set={(v) => setOffer({ ...offer, bonus: v })} step={step} min={0} max={ask * 6} fmt={money} />
        <Stepper label="Purse per fight" value={offer.purse} set={(v) => setOffer({ ...offer, purse: v })} step={step} min={1000} max={ask * 4} fmt={money} />
        <Stepper label="Fights" value={offer.fights} set={(v) => setOffer({ ...offer, fights: v })} step={1} min={1} max={8} fmt={(v) => String(v)} />
        <Stepper label="Your cut" value={Math.round(offer.cut * 100)} set={(v) => setOffer({ ...offer, cut: v / 100 })} step={5} min={0} max={40} fmt={(v) => `${v}%`} />
      </div>
      <div className="mt-4 rounded-lg bg-surface2 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Bonus now</span><span className="num">{money(offer.bonus)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Guaranteed over {offer.fights} fights</span><span className="num">{money(offer.purse * offer.fights)}</span></div>
        <div className="flex justify-between"><span className="text-muted">He takes home per fight</span><span className="num">{money(offerValue(offer))}</span></div>
        <div className="flex justify-between font-semibold"><span>Total commitment</span><span className="num">{money(offerCommitment(offer))}</span></div>
        <div className="flex justify-between"><span className="text-muted">Cash after bonus</span><span className={`num ${game.company.cash - offer.bonus < 0 ? "text-bad" : ""}`}>{money(game.company.cash - offer.bonus)}</span></div>
      </div>
      {outcome && outcome.kind !== "war" && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${outcome.kind === "accept" ? "border-good" : "border-line"}`}>
          <div className="font-semibold">{outcome.kind === "accept" ? "Signed" : outcome.kind === "counter" ? "Counter-offer" : outcome.kind === "unaffordable" ? "Can't afford it" : "Refused"}</div>
          <p className="text-muted">{outcome.message}</p>
          {outcome.decision?.kind === "counter" && (
            <div className="mt-2">
              <div className="num">He wants {money(outcome.decision.offer.purse)} per fight.</div>
              <Btn className="mt-2 w-full" onClick={() => { setOffer(outcome.decision && outcome.decision.kind === "counter" ? outcome.decision.offer : offer); submit((outcome.decision as { offer: Offer }).offer); }}>Accept counter</Btn>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={close}>{done ? "Close" : "Cancel"}</Btn>
        {!done && <Btn className="flex-1" disabled={offer.bonus > game.company.cash} onClick={() => submit(offer)}>Make offer</Btn>}
      </div>
    </Sheet>
  );
}

function BidsTab() {
  const { game, update } = useGame();
  if (!game) return null;
  if (game.negotiations.length === 0) return <Card className="text-sm text-muted">No bidding wars. When you offer terms to a top-ranked fighter or a hot prospect, rival promoters may bid too.</Card>;
  const year = gameYear(game.startDate, game.week);
  return (
    <div className="space-y-3">
      {game.negotiations.map((n) => {
        const f = game.world.fighters[n.fighterId];
        const bestRival = Math.max(...n.rivals.map((r) => r.offer.purse));
        return (
          <Card key={n.id}>
            <div className="display text-xl font-bold">{f.name}</div>
            <div className="text-xs text-muted">Round {n.round} of 3 · ask about {money(askPurse(f, year))}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Your offer</div><div className="num font-semibold">{money(n.offer.purse)}</div></div>
              <div className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Best rival</div><div className="num font-semibold">{money(bestRival)}</div></div>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">{n.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <div className="mt-3 flex gap-2">
              <Btn variant="ghost" className="flex-1" disabled={Math.round((n.offer.bonus * 1.1) / 1000) * 1000 > game.company.cash}
                onClick={() => update((g) => raiseBid(g, n.id, { ...n.offer, purse: Math.round((n.offer.purse * 1.1) / 1000) * 1000, bonus: Math.round((n.offer.bonus * 1.1) / 1000) * 1000 }))}>Raise 10%</Btn>
              <Btn className="flex-1" onClick={() => update((g) => finalAnswer(g, n.id))}>Final answer</Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function MarketScreen() {
  const { game } = useGame();
  const [tab, setTab] = useState<"free" | "prospect" | "bids" | "contract">("free");
  const [div, setDiv] = useState<Division | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const [sel, setSel] = useState<Fighter | null>(null);
  const list = useMemo(() => {
    if (!game) return [];
    const ql = q.trim().toLowerCase();
    return Object.values(game.world.fighters)
      .filter((f) => !f.retired && f.promoter !== "player")
      .filter((f) => (tab === "free" ? f.promoter === "independent" && f.pro : tab === "prospect" ? f.promoter === "independent" && !f.pro : tab === "contract" ? f.promoter !== "independent" && f.pro : false))
      .filter((f) => div === "all" || f.division === div)
      .filter((f) => !ql || f.name.toLowerCase().includes(ql))
      .sort((a, b) => overall(b.ratings) - overall(a.ratings));
  }, [game, tab, div, q]);
  if (!game) return null;
  const year = gameYear(game.startDate, game.week);
  const TABS: [typeof tab, string][] = [["free", "Free agents"], ["prospect", "Prospects"], ["bids", `Bids${game.negotiations.length ? ` (${game.negotiations.length})` : ""}`], ["contract", "Under contract"]];
  return (
    <div>
      <H sub="Make offers. The fighter accepts, counters or refuses. Hot names draw rival bids.">Market</H>
      <div className="mb-3 grid grid-cols-4 gap-1">
        {TABS.map(([id, l]) => <button key={id} onClick={() => { setTab(id); setLimit(40); }} className={`min-h-11 rounded-lg px-1 text-xs font-semibold ${tab === id ? "bg-accent text-accentfg" : "border border-line bg-surface"}`}>{l}</button>)}
      </div>
      {tab === "bids" ? <BidsTab /> : (
        <>
          <div className="mb-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3" />
            <select value={div} onChange={(e) => setDiv(e.target.value as Division | "all")} className="min-h-11 rounded-lg border border-line bg-surface px-2">
              <option value="all">All divisions</option>
              {DIVISIONS.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
            </select>
          </div>
          <Card className="py-1">
            {list.slice(0, limit).map((f) => {
              const st = stars(f, year);
              const owner = game.world.promoters.find((p) => p.id === f.promoter);
              return (
                <FighterRow key={f.id} f={f} right={
                  <div>
                    <div className="text-xs text-muted">{DIVISION_LABEL[f.division]} · {ageAt(f, year)}y{st ? ` · ${"★".repeat(st)}` : ""}</div>
                    {tab === "contract"
                      ? <div className="text-xs text-muted">{owner?.name} to {f.contract?.expiresYear}</div>
                      : <Btn className="mt-1" onClick={() => setSel(f)}>Offer · {money(askPurse(f, year))}</Btn>}
                  </div>} />
              );
            })}
            {list.length === 0 && <p className="p-3 text-sm text-muted">No one matches.</p>}
          </Card>
          {list.length > limit && <Btn variant="ghost" className="mt-3 w-full" onClick={() => setLimit(limit + 40)}>Show more ({list.length - limit})</Btn>}
        </>
      )}
      {sel && <OfferSheet f={sel} close={() => setSel(null)} onWar={() => { setSel(null); setTab("bids"); }} />}
    </div>
  );
}

export function StableActions({ f, close }: { f: Fighter; close: () => void }) {
  const { game, update } = useGame();
  if (!game) return null;
  const year = gameYear(game.startDate, game.week);
  const cost = releaseCost(f), price = contractSalePrice(f, year);
  return (
    <Sheet close={close} label={`Manage ${f.name}`}>
      <h2 className="display text-3xl font-bold leading-none">{f.name}</h2>
      {f.contract ? <p className="mt-1 text-sm text-muted">{f.contract.fightsLeft} fights left at <span className="num">{money(f.contract.purse)}</span>, your cut {Math.round(f.contract.cut * 100)}%.</p> : null}
      <div className="mt-4 space-y-2">
        <Btn variant="danger" className="w-full" onClick={() => { update((g) => releaseFighter(g, f.id)); close(); }}>Release (pay {money(cost)})</Btn>
        <Btn variant="ghost" className="w-full" onClick={() => { update((g) => sellContract(g, f.id)); close(); }}>Sell contract (receive {money(price)})</Btn>
        <Btn variant="ghost" className="w-full" onClick={close}>Cancel</Btn>
      </div>
    </Sheet>
  );
}
