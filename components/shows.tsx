"use client";
import { useState } from "react";
import { useGame } from "@/lib/game/store";
import { bookShow, cancelShow, project, promotedUnassigned, showFights, venueById, VENUES } from "@/lib/sim/shows";
import type { GameSave, Show, Statement } from "@/lib/sim/types";
import { Badge, Btn, Card, H, money } from "./ui";

function Lines({ s }: { s: Statement | (Statement & { demand: number }) }) {
  return (
    <div className="text-sm">
      {s.lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
          <span className="text-muted">{l.label}</span>
          <span className={`num shrink-0 ${l.amount < 0 ? "" : "font-semibold"}`}>{money(l.amount)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between font-bold"><span>{s.profit >= 0 ? "Profit" : "Loss"}</span><span className={`num ${s.profit >= 0 ? "text-good" : "text-bad"}`}>{money(s.profit)}</span></div>
      <p className="mt-1 text-xs text-muted">The promoter keeps what is left after purses and costs, win or lose.</p>
    </div>
  );
}

function Builder({ close }: { close: () => void }) {
  const { game, update } = useGame();
  const weeks = game ? [...new Set(game.fights.filter((f) => !f.done && f.promoter === "player" && !f.showId).map((f) => f.week))].sort((a, b) => a - b) : [];
  const [week, setWeek] = useState(weeks[0] ?? 0);
  const [venue, setVenue] = useState("arena-s");
  const [price, setPrice] = useState<Show["price"]>("standard");
  const [dist, setDist] = useState<Show["dist"]>(game?.company.deal ? "deal" : "sale");
  const [picked, setPicked] = useState<string[] | null>(null);
  if (!game) return null;
  const avail = promotedUnassigned(game, week);
  const chosen = (picked ?? avail.map((f) => f.id)).filter((id) => avail.some((f) => f.id === id)).slice(0, 8);
  const fs = avail.filter((f) => chosen.includes(f.id));
  const F = game.world.fighters;
  const partner = game.world.broadcasters.find((x) => x.id === game.company.deal?.broadcasterId)?.name ?? "";
  const proj = fs.length ? project(game, venue, fs, price, dist) : null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:items-center" onClick={close} role="dialog" aria-modal="true" aria-label="Show builder">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-8 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="display text-3xl font-bold leading-none">Build a show</h2>
        {weeks.length === 0 ? <p className="mt-3 text-sm text-muted">No unassigned fights you promote. Make a fight from the Fights tab first; fights you make are promoted by you.</p> : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm"><span className="text-muted">Date</span>
              <select value={week} onChange={(e) => { setWeek(Number(e.target.value)); setPicked(null); }} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3">
                {weeks.map((w) => <option key={w} value={w}>In {w - game.week} weeks ({promotedUnassigned(game, w).length} fight{promotedUnassigned(game, w).length === 1 ? "" : "s"})</option>)}
              </select></label>
            <label className="block text-sm"><span className="text-muted">Venue</span>
              <select value={venue} onChange={(e) => setVenue(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3">
                {VENUES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.capacity.toLocaleString("en-GB")} seats · hire {money(v.hire)}</option>)}
              </select></label>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "standard", "premium"] as const).map((p) => <button key={p} onClick={() => setPrice(p)} className={`min-h-11 rounded-lg text-sm font-semibold capitalize ${price === p ? "bg-fg text-bg" : "border border-line"}`}>{p} tickets</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(game.company.deal
                ? ([["deal", `${partner} show`], ["deal-ppv", `${partner} PPV`], ["sale", "One-off sale"], ["ppv", "Own PPV (riskier)"]] as const)
                : ([["sale", "Sell to a broadcaster"], ["ppv", "PPV (riskier)"]] as const)
              ).map(([id, l]) => <button key={id} onClick={() => setDist(id)} className={`min-h-11 px-1 text-sm font-semibold ${dist === id ? "bg-fg text-bg" : "border border-line"}`}>{l}</button>)}
            </div>
            {game.company.deal && (dist === "sale" || dist === "ppv") && <p className="text-xs text-muted">This show will not count toward the {game.company.deal.showsPerYear} dates you owe {partner}.</p>}
            <div>
              <div className="mb-1 text-sm text-muted">Card ({chosen.length}/8)</div>
              {avail.map((f) => (
                <label key={f.id} className="flex min-h-11 items-center gap-3 border-b border-line text-sm last:border-0">
                  <input type="checkbox" className="h-5 w-5" checked={chosen.includes(f.id)} onChange={(e) => setPicked(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))} />
                  <span className="min-w-0 flex-1 truncate">{F[f.a].name} vs {F[f.b].name}</span>
                  {f.titles.length > 0 && <Badge>{f.titles.join("/")}</Badge>}
                </label>
              ))}
            </div>
            {proj && (
              <div className="rounded-lg bg-surface2 p-3">
                <div className="mb-1 text-sm font-semibold">Projection</div>
                <Lines s={proj} />
                {proj.demand > venueById(venue).capacity * 1.25 && <p className="mt-2 text-xs text-accent">Demand is {Math.round(proj.demand).toLocaleString("en-GB")}: this card could fill a bigger venue.</p>}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Btn variant="ghost" className="flex-1" onClick={close}>Cancel</Btn>
          {weeks.length > 0 && <Btn className="flex-1" disabled={!fs.length} onClick={() => { update((g: GameSave) => bookShow(g, { week, venue, fights: fs.map((f) => f.id), price, dist })); close(); }}>Book show</Btn>}
        </div>
      </div>
    </div>
  );
}

export function ShowsScreen() {
  const { game, update } = useGame();
  const [building, setBuilding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!game) return null;
  const F = game.world.fighters;
  const upcoming = game.shows.filter((s) => !s.statement).sort((a, b) => a.week - b.week);
  const past = game.shows.filter((s) => s.statement).sort((a, b) => b.week - a.week);
  const unassigned = game.fights.filter((f) => !f.done && f.promoter === "player" && !f.showId).length;
  return (
    <div className="space-y-3">
      <H sub="You promote the fights you make. The promoter keeps what is left after purses and costs.">Shows</H>
      <Btn className="w-full" onClick={() => setBuilding(true)}>Build a show{unassigned ? ` (${unassigned} fight${unassigned > 1 ? "s" : ""} waiting)` : ""}</Btn>
      <div className="text-sm font-semibold">Upcoming</div>
      {upcoming.length === 0 && <Card className="text-sm text-muted">No shows booked.</Card>}
      {upcoming.map((s) => {
        const fs = showFights(game, s);
        const p = project(game, s.venue, fs, s.price, s.dist);
        const v = venueById(s.venue);
        return (
          <Card key={s.id}>
            <div className="flex items-center justify-between"><span className="display text-xl font-bold">{v.name}</span><span className="num text-xs text-muted">in {Math.max(0, s.week - game.week)}w{s.auto ? " · auto" : ""}</span></div>
            <ul className="mt-1 text-sm text-muted">{fs.map((f) => <li key={f.id}>{F[f.a].name} vs {F[f.b].name}{f.titles.length ? ` (${f.titles.join("/")})` : ""}</li>)}</ul>
            <div className="mt-2 flex items-center justify-between text-sm"><span className="text-muted">Projected profit</span><span className={`num font-semibold ${p.profit >= 0 ? "text-good" : "text-bad"}`}>{money(p.profit)}</span></div>
            <button className="mt-1 min-h-11 text-sm font-semibold text-accent" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide" : "Show"} breakdown</button>
            {open === s.id && <div className="mt-1"><Lines s={p} /></div>}
            {s.week - game.week >= 1 && <Btn variant="ghost" className="mt-2 w-full" onClick={() => update((g) => cancelShow(g, s.id))}>Unbook (fights stay made)</Btn>}
          </Card>
        );
      })}
      {past.length > 0 && <div className="text-sm font-semibold">Statements</div>}
      {past.map((s) => (
        <Card key={s.id}>
          <button className="flex min-h-11 w-full items-center justify-between text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="font-semibold">{venueById(s.venue).name} · week {s.week}</span>
            <span className={`num font-semibold ${s.statement!.profit >= 0 ? "text-good" : "text-bad"}`}>{money(s.statement!.profit)}</span>
          </button>
          {open === s.id && <Lines s={s.statement!} />}
        </Card>
      ))}
      {building && <Builder close={() => setBuilding(false)} />}
    </div>
  );
}
