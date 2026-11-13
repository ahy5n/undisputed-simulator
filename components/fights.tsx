"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import { gameYear } from "@/lib/sim/calendar";
import { overall, recordString, flag } from "@/lib/sim/fighter";
import { simulateFight, swapResult, type FightResult } from "@/lib/sim/fight";
import {
  CAMP_DEFAULT, CAMP_MIN, candidates, defaultTerms, evaluateFightOffer, rankIn, scheduleFight, shortlist, winChance, type Candidate, type FightDecision,
} from "@/lib/sim/matchmaking";
import { computeRankings, type Rankings } from "@/lib/sim/rankings";
import { Rng } from "@/lib/sim/rng";
import { pendingPlayerFights } from "@/lib/sim/game";
import { acceptIncoming, applyResult, clearOrderFor, declineIncoming, minBidFor, orderParticipants, placeBid, quickSimFight, stepAside, stepAsideFee, vacateBelt } from "@/lib/sim/weekly";
import { DIVISIONS, DIVISION_LABEL, WORLD_BODIES, type Division, type Fighter, type FightTerms, type GameSave, type Order, type WorldBody } from "@/lib/sim/types";
import { LiveFight, ResultView } from "./fightui";
import { Badge, Btn, Card, FighterRow, H, money } from "./ui";

type Tab = "shortlist" | "search" | "orders" | "schedule" | "exhibition";

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

/* ----------------------------------------------------------- offer builder */

function OfferBuilder({ mine, opp, presetTitles, close }: { mine: Fighter; opp: Fighter; presetTitles: WorldBody[]; close: () => void }) {
  const { game, update } = useGame();
  const world = game?.world;
  const rankings = useMemo(() => (world ? computeRankings(world) : null), [world]);
  const [terms, setTerms] = useState<FightTerms>(() => defaultTerms(game!, mine, opp, presetTitles));
  const [weeks, setWeeks] = useState(CAMP_DEFAULT);
  const [result, setResult] = useState<FightDecision | null>(null);
  if (!game || !rankings) return null;
  const week = game.week + weeks;
  const eligible = WORLD_BODIES.filter((b) => mine.division === opp.division && (game.world.belts[mine.division][b] === mine.id || game.world.belts[mine.division][b] === opp.id));
  const wc = winChance(mine, opp);
  const step = Math.max(1000, Math.round(terms.purseB * 0.05 / 1000) * 1000);
  function send(t: FightTerms) {
    const d = evaluateFightOffer(game!, rankings!, mine, opp, t, week);
    setResult(d);
    if (d.kind === "accept") {
      update((g) => clearOrderFor(scheduleFight(g, mine.id, opp.id, week, t, "player", "player"), mine.id, opp.id, t.titles));
    }
  }
  return (
    <Sheet close={close} label="Make an offer">
      <div className="display text-2xl font-bold leading-tight">{mine.name} <span className="text-muted">vs</span> {opp.name}</div>
      <p className="mt-1 text-sm text-muted">{flag(opp.nationality)} {recordString(opp)} · {opp.style} · you are {Math.round(wc * 100)}% to win</p>
      <div className="mt-4 space-y-3">
        <Stepper label="Weeks until fight" value={weeks} set={setWeeks} step={1} min={CAMP_MIN} max={40} fmt={(v) => `${v} wks`} />
        <Stepper label="Your purse" value={terms.purseA} set={(v) => setTerms({ ...terms, purseA: v })} step={Math.max(1000, Math.round(terms.purseA * 0.05 / 1000) * 1000)} min={1000} max={50_000_000} fmt={money} />
        <Stepper label="His purse" value={terms.purseB} set={(v) => setTerms({ ...terms, purseB: v })} step={step} min={1000} max={50_000_000} fmt={money} />
        <Stepper label="Rounds" value={terms.rounds} set={(v) => setTerms({ ...terms, rounds: v })} step={2} min={4} max={12} fmt={(v) => String(v)} />
        {eligible.length > 0 && (
          <div>
            <div className="mb-1 text-sm text-muted">Titles at stake (pick one for a single-belt fight, more to unify)</div>
            <div className="flex flex-wrap gap-2">
              {eligible.map((b) => (
                <button key={b} onClick={() => setTerms({ ...terms, titles: terms.titles.includes(b) ? terms.titles.filter((x) => x !== b) : [...terms.titles, b], rounds: 12 })}
                  className={`min-h-11 rounded-lg px-4 text-sm font-bold ${terms.titles.includes(b) ? "bg-accent text-accentfg" : "border border-line"}`}>{b}</button>
              ))}
            </div>
          </div>
        )}
        <label className="flex min-h-11 items-center justify-between text-sm">Rematch clause<input type="checkbox" className="h-5 w-5" checked={terms.rematch} onChange={(e) => setTerms({ ...terms, rematch: e.target.checked })} /></label>
        <label className="flex min-h-11 items-center justify-between text-sm">Rehydration clause<input type="checkbox" className="h-5 w-5" checked={terms.rehydration} onChange={(e) => setTerms({ ...terms, rehydration: e.target.checked })} /></label>
      </div>
      <div className="mt-3 rounded-lg bg-surface2 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Total purses you pay</span><span className="num font-semibold">{money(terms.purseA + terms.purseB)}</span></div>
        <p className="mt-1 text-xs text-muted">Fights you make are promoted by you: put them on a show in the Shows tab. Gate, TV and sponsorship are projected there; the promoter keeps what is left after purses and costs.</p>
      </div>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${result.kind === "accept" ? "border-good" : "border-line"}`}>
          <div className="font-semibold">{result.kind === "accept" ? "Fight made" : result.kind === "counter" ? "Counter-offer" : "Refused"}</div>
          <p className="text-muted">{result.reason}</p>
          {result.kind === "counter" && <Btn className="mt-2 w-full" onClick={() => { setTerms(result.terms); send(result.terms); }}>Accept his purse ({money(result.terms.purseB)})</Btn>}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={close}>{result?.kind === "accept" ? "Close" : "Cancel"}</Btn>
        {result?.kind !== "accept" && <Btn className="flex-1" onClick={() => send(terms)}>Send offer</Btn>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- shortlist */

function Pick({ c, onOffer }: { c: Candidate; onOffer: () => void }) {
  const f = c.fighter;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5"><span className="display text-xl font-bold leading-tight">{f.name}</span>{f.titles.map((t) => <Badge key={t}>{t}</Badge>)}</div>
          <div className="text-xs text-muted">{flag(f.nationality)} {recordString(f)} ({f.record.ko} KO) · {f.style}</div>
        </div>
        <div className="display num text-3xl font-bold leading-none">{overall(f.ratings)}</div>
      </div>
      <p className="mt-2 text-sm font-semibold text-accent">{c.why}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-surface2 p-2"><div className="text-muted">Win chance</div><div className="num text-base font-bold">{Math.round(c.winChance * 100)}%</div></div>
        <div className="rounded-lg bg-surface2 p-2"><div className="text-muted">Style</div><div className="text-base font-bold">{c.styleEdge > 0.2 ? "Edge" : c.styleEdge < -0.2 ? "Danger" : "Even"}</div></div>
        <div className="rounded-lg bg-surface2 p-2"><div className="text-muted">Rank gain</div><div className="num text-base font-bold">{c.gain ? `${c.gain.body} #${c.gain.rank}` : c.titles.length ? "Title" : "-"}</div></div>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm"><span className="text-muted">Likely purses <span className="num">{money(c.terms.purseA)} / {money(c.terms.purseB)}</span></span></div>
      <Btn className="mt-3 w-full" onClick={onOffer}>Make offer</Btn>
    </Card>
  );
}

function ShortlistTab({ rankings, offer }: { rankings: Rankings; offer: (m: Fighter, o: Fighter, t: WorldBody[]) => void }) {
  const { game } = useGame();
  const [sel, setSel] = useState("");
  const mine = game!.company.stable.map((id) => game!.world.fighters[id]).filter(Boolean);
  const f = mine.find((x) => x.id === sel) ?? mine[0];
  const list = f ? shortlist(game!, rankings, f) : [];
  if (!f) return <Card className="text-sm text-muted">Sign a fighter in the Market and he gets a shortlist of five opponents, refreshed every week.</Card>;
  return (
    <div className="space-y-3">
      <select value={f.id} onChange={(e) => setSel(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3" aria-label="Fighter">
        {mine.map((x) => <option key={x.id} value={x.id}>{x.name} ({overall(x.ratings)})</option>)}
      </select>
      {f.injuredWeeks > 0 && <Card className="text-sm text-bad">{f.name} is injured for {f.injuredWeeks} more week{f.injuredWeeks > 1 ? "s" : ""}.</Card>}
      {list.map((c) => <Pick key={c.fighter.id} c={c} onOffer={() => offer(f, c.fighter, c.titles)} />)}
    </div>
  );
}

function SearchTab({ rankings, offer }: { rankings: Rankings; offer: (m: Fighter, o: Fighter, t: WorldBody[]) => void }) {
  const { game } = useGame();
  const [sel, setSel] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState(0);
  const mine = game!.company.stable.map((id) => game!.world.fighters[id]).filter(Boolean);
  const f = mine.find((x) => x.id === sel) ?? mine[0];
  const ql = q.trim().toLowerCase();
  const list = f ? candidates(game!, rankings, f, game!.week + CAMP_DEFAULT, range).filter((c) => !ql || c.fighter.name.toLowerCase().includes(ql)).slice(0, 40) : [];
  if (!f) return <Card className="text-sm text-muted">You need a fighter first.</Card>;
  return (
    <div className="space-y-3">
      <select value={f.id} onChange={(e) => setSel(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3" aria-label="Fighter">
        {mine.map((x) => <option key={x.id} value={x.id}>{x.name} ({DIVISION_LABEL[x.division]})</option>)}
      </select>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3" />
        <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="min-h-11 rounded-lg border border-line bg-surface px-2" aria-label="Divisions">
          <option value={0}>My division</option><option value={1}>±1 division</option><option value={2}>±2 divisions</option>
        </select>
      </div>
      <Card className="py-1">
        {list.map((c) => (
          <FighterRow key={c.fighter.id} f={c.fighter} right={<div><div className="text-xs text-muted">{Math.round(c.winChance * 100)}% · {DIVISION_LABEL[c.fighter.division]}</div><Btn className="mt-1" onClick={() => offer(f, c.fighter, c.titles)}>Offer</Btn></div>} />
        ))}
        {list.length === 0 && <p className="p-3 text-sm text-muted">No one available for that date.</p>}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- orders */

function OrdersTab({ offer }: { offer: (m: Fighter, o: Fighter, t: WorldBody[]) => void }) {
  const { game, update } = useGame();
  const [bidAmt, setBidAmt] = useState<Record<string, number>>({});
  if (!game) return null;
  const F = game.world.fighters;
  const mineOf = (o: Order) => orderParticipants(o).find((id) => F[id].promoter === "player");
  const orders = [...game.orders].sort((a, b) => Number(!!mineOf(b)) - Number(!!mineOf(a)));
  const champs = game.company.stable.map((id) => F[id]).filter((f) => f?.titles.length);
  return (
    <div className="space-y-3">
      {champs.length > 0 && (
        <Card>
          <div className="mb-1 text-sm font-semibold">Your champions</div>
          {champs.map((c) => c.titles.map((b) => (
            <div key={c.id + b} className="flex min-h-11 items-center justify-between text-sm"><span><Badge>{b}</Badge> <span className="font-semibold">{c.name}</span></span>
              <Btn variant="danger" onClick={() => update((g) => vacateBelt(g, c.id, b as WorldBody))}>Vacate</Btn></div>
          )))}
        </Card>
      )}
      <div className="text-sm font-semibold">Mandatories and vacant titles</div>
      {orders.length === 0 && <Card className="text-sm text-muted">No orders right now. Bodies order mandatories every 9 to 12 months.</Card>}
      {orders.map((o) => {
        const [x, y] = orderParticipants(o);
        const mine = mineOf(o);
        const weeksLeft = Math.max(0, o.deadline - game.week);
        const isChamp = mine && o.champion === mine;
        return (
          <Card key={o.id} className={mine ? "border-accent" : ""}>
            <div className="flex items-center justify-between"><span className="text-sm font-semibold"><Badge>{o.body}</Badge> {DIVISION_LABEL[o.division]} {o.kind === "vacant" ? "vacant title" : "mandatory"}</span><span className="num text-xs text-muted">{weeksLeft}w to agree</span></div>
            <div className="mt-1 text-sm">{F[x].name} <span className="text-muted">vs</span> {F[y].name}</div>
            {mine ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Btn onClick={() => offer(F[mine], F[mine === x ? y : x], [o.body])}>Make offer</Btn>
                {isChamp && o.kind === "mandatory" && <Btn variant="ghost" disabled={game.company.cash < stepAsideFee(game, o)} onClick={() => update((g) => stepAside(g, o.id))}>Step aside {money(stepAsideFee(game, o))}</Btn>}
              </div>
            ) : <p className="mt-1 text-xs text-muted">The promoters are negotiating. If there is no deal, it goes to a purse bid.</p>}
          </Card>
        );
      })}
      {game.purseBids.length > 0 && <div className="text-sm font-semibold">Purse bids</div>}
      {game.purseBids.map((b) => {
        const [x, y] = orderParticipants(b.order);
        const top = Math.max(0, ...b.bids.map((z) => z.amount));
        const amt = bidAmt[b.id] ?? Math.max(b.minBid, top + 5000);
        return (
          <Card key={b.id}>
            <div className="text-sm font-semibold"><Badge>{b.order.body}</Badge> {F[x].name} vs {F[y].name}</div>
            <p className="text-xs text-muted">{b.order.kind === "vacant" ? "50/50" : "75/25"} split · closes in {Math.max(0, b.closeWeek - game.week)} week · minimum {money(b.minBid)} · top bid {top ? money(top) : "none"}</p>
            <div className="mt-2"><Stepper label="Your bid" value={amt} set={(v) => setBidAmt({ ...bidAmt, [b.id]: v })} step={5000} min={b.minBid} max={30_000_000} fmt={money} /></div>
            <Btn className="mt-2 w-full" onClick={() => update((g) => placeBid(g, b.id, amt))}>{b.bids.some((z) => z.promoterId === "player") ? "Raise my bid" : "Place bid"}</Btn>
          </Card>
        );
      })}
      <p className="text-center text-xs text-muted">Minimum for a new bid: {game.orders[0] ? money(minBidFor(game, game.orders[0])) : "set when a bid opens"}.</p>
    </div>
  );
}

/* --------------------------------------------------------------- schedule */

function ScheduleTab({ goLive }: { goLive: (fightId: string) => void }) {
  const { game, update } = useGame();
  if (!game) return null;
  const F = game.world.fighters;
  const year = gameYear(game.startDate, game.week);
  const pending = pendingPlayerFights(game);
  const mineFights = game.fights.filter((f) => !f.done && !pending.includes(f) && [f.a, f.b].some((id) => F[id].promoter === "player")).sort((a, b) => a.week - b.week);
  const others = game.fights.filter((f) => !f.done && ![f.a, f.b].some((id) => F[id].promoter === "player")).sort((a, b) => a.week - b.week).slice(0, 12);
  const line = (f: typeof game.fights[number]) => `${F[f.a].name} vs ${F[f.b].name}`;
  return (
    <div className="space-y-3">
      {game.incoming.map((o) => (
        <Card key={o.id} className="border-accent">
          <div className="text-sm font-semibold">Fight offer: {F[o.mine].name} vs {F[o.opp].name}</div>
          <p className="text-xs text-muted">From {game.world.promoters.find((p) => p.id === o.fromPromoter)?.name} · in {o.fightWeek - game.week} weeks · your purse <span className="num">{money(o.terms.purseA)}</span>{o.terms.titles.length ? ` · ${o.terms.titles.join("/")} title` : ""} · expires in {o.expires - game.week}w</p>
          <div className="mt-2 flex gap-2"><Btn className="flex-1" onClick={() => update((g) => acceptIncoming(g, o.id))}>Accept</Btn><Btn variant="ghost" className="flex-1" onClick={() => update((g) => declineIncoming(g, o.id))}>Decline</Btn></div>
        </Card>
      ))}
      {pending.map((f) => (
        <Card key={f.id} className="border-accent">
          <div className="display text-xl font-bold">Fight night</div>
          <div className="text-sm">{line(f)}{f.titles.length ? ` · ${f.titles.join("/")} title` : ""}</div>
          <div className="mt-2 flex gap-2">
            <Btn className="flex-1" onClick={() => goLive(f.id)}>Watch live</Btn>
            <Btn variant="ghost" className="flex-1" onClick={() => update((g) => quickSimFight(g, f.id))}>Quick sim</Btn>
          </div>
        </Card>
      ))}
      <div className="text-sm font-semibold">Your fights</div>
      {mineFights.length === 0 && <Card className="text-sm text-muted">Nothing booked. Make an offer from your shortlist.</Card>}
      {mineFights.map((f) => (
        <Card key={f.id}><div className="text-sm font-semibold">{line(f)}</div><div className="text-xs text-muted">In {f.week - game.week} weeks · purses {money(f.purseA)} / {money(f.purseB)}{f.titles.length ? ` · ${f.titles.join("/")}` : ""}{f.rematch ? " · rematch clause" : ""}</div></Card>
      ))}
      <div className="text-sm font-semibold">Around the world</div>
      <Card className="py-1">
        {others.map((f) => <div key={f.id} className="flex min-h-11 items-center justify-between border-b border-line text-sm last:border-0"><span className="min-w-0 truncate">{line(f)}</span><span className="num ml-2 shrink-0 text-xs text-muted">{f.titles.length ? f.titles.join("/") + " · " : ""}{f.week - game.week}w</span></div>)}
        {others.length === 0 && <p className="p-3 text-sm text-muted">Quiet. Let a few weeks pass.</p>}
      </Card>
      <p className="text-center text-xs text-muted">Year {year}</p>
    </div>
  );
}

/* --------------------------------------------------------------- exhibition */

function Exhibition() {
  const { game } = useGame();
  const [div, setDiv] = useState<Division>("heavyweight");
  const [aId, setA] = useState(""), [bId, setB] = useState("");
  const [rounds, setRounds] = useState(12);
  const [mode, setMode] = useState<"setup" | "live" | "result">("setup");
  const [result, setResult] = useState<FightResult | null>(null);
  const [nonce, setNonce] = useState(0);
  const pool = useMemo(() => game ? Object.values(game.world.fighters).filter((f) => f.division === div && f.pro && !f.retired).sort((x, y) => overall(y.ratings) - overall(x.ratings)).slice(0, 80) : [], [game, div]);
  if (!game) return null;
  const F = game.world.fighters;
  const a = F[aId] ?? pool[0];
  const b = F[bId] && F[bId].id !== a?.id ? F[bId] : pool.find((f) => f.id !== a?.id);
  if (!a || !b) return null;
  if (mode === "live") return <LiveFight key={nonce} a={a} b={b} rounds={rounds} hideCards={game.settings.hideScorecards} onFinish={(r) => { setResult(r); setMode("result"); }} onExit={() => setMode("setup")} />;
  if (mode === "result" && result) return <ResultView a={a} b={b} r={result} onDone={() => setMode("setup")} onRematch={() => { setNonce(nonce + 1); setMode("live"); }} />;
  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold">Exhibition (no effect on the world)</div>
      <select value={div} onChange={(e) => { setDiv(e.target.value as Division); setA(""); setB(""); }} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3">{DIVISIONS.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}</select>
      <select value={a.id} onChange={(e) => setA(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Fighter one">{pool.map((f) => <option key={f.id} value={f.id}>{f.name} ({overall(f.ratings)})</option>)}</select>
      <select value={b.id} onChange={(e) => setB(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Fighter two">{pool.filter((f) => f.id !== a.id).map((f) => <option key={f.id} value={f.id}>{f.name} ({overall(f.ratings)})</option>)}</select>
      <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Rounds">{[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} rounds</option>)}</select>
      <div className="flex gap-2">
        <Btn className="flex-1" onClick={() => { setNonce(nonce + 1); setMode("live"); }}>Watch live</Btn>
        <Btn variant="ghost" className="flex-1" onClick={() => { setResult(simulateFight(a, b, { rounds }, new Rng((Date.now() ^ 0xabcdef) >>> 0))); setMode("result"); }}>Quick sim</Btn>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- screen */

export function FightsScreen() {
  const { game, update } = useGame();
  const [tab, setTab] = useState<Tab>("shortlist");
  const [offerFor, setOfferFor] = useState<{ mine: Fighter; opp: Fighter; titles: WorldBody[] } | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ a: Fighter; b: Fighter; r: FightResult } | null>(null);
  const world = game?.world;
  const rankings = useMemo(() => (world ? computeRankings(world) : null), [world]);
  if (!game || !rankings) return null;
  const F = game.world.fighters;
  const pending = pendingPlayerFights(game);
  const showTab: Tab = pending.length && tab !== "exhibition" && tab !== "schedule" ? "schedule" : tab;
  const TABS: [Tab, string][] = [["shortlist", "Shortlist"], ["search", "Search"], ["orders", `Orders${game.orders.length + game.purseBids.length ? ` (${game.orders.length + game.purseBids.length})` : ""}`], ["schedule", `Schedule${game.incoming.length + pending.length ? ` (${game.incoming.length + pending.length})` : ""}`], ["exhibition", "Exhibition"]];

  if (live) {
    const fight = game.fights.find((f) => f.id === live);
    if (fight) {
      const swap = F[fight.a].promoter !== "player"; // your fighter always takes the left corner
      const left = F[swap ? fight.b : fight.a], right = F[swap ? fight.a : fight.b];
      return <LiveFight a={left} b={right} rounds={fight.rounds} hideCards={game.settings.hideScorecards}
        onFinish={(res) => {
          const real = swap ? swapResult(res) : res;
          update((g) => { const rng = new Rng(g.rngState); const n = applyResult(g, fight, real, rng); return { ...n, rngState: rng.state }; });
          setLastResult({ a: F[fight.a], b: F[fight.b], r: real }); setLive(null);
        }}
        onExit={() => setLive(null)} />;
    }
  }
  if (lastResult) return <ResultView a={lastResult.a} b={lastResult.b} r={lastResult.r} onDone={() => setLastResult(null)} />;

  return (
    <div>
      <H sub="Shortlists refresh every week. Offers can be accepted, countered or refused.">Fights</H>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${showTab === id ? "bg-accent text-accentfg" : "border border-line bg-surface"}`}>{l}</button>)}
      </div>
      {showTab === "shortlist" && <ShortlistTab rankings={rankings} offer={(m, o, t) => setOfferFor({ mine: m, opp: o, titles: t })} />}
      {showTab === "search" && <SearchTab rankings={rankings} offer={(m, o, t) => setOfferFor({ mine: m, opp: o, titles: t })} />}
      {showTab === "orders" && <OrdersTab offer={(m, o, t) => setOfferFor({ mine: m, opp: o, titles: t })} />}
      {showTab === "schedule" && <ScheduleTab goLive={setLive} />}
      {showTab === "exhibition" && <Exhibition />}
      {offerFor && <OfferBuilder mine={offerFor.mine} opp={offerFor.opp} presetTitles={offerFor.titles} close={() => setOfferFor(null)} />}
    </div>
  );
}
export { rankIn };
export type { GameSave };
