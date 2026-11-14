"use client";
import { useState } from "react";
import { useGame } from "@/lib/game/store";
import { gameYear } from "@/lib/sim/calendar";
import { MILESTONES, RED_WEEKS_LIMIT, progress } from "@/lib/sim/board";
import { appeal, evaluateDeal, maxFee, signDeal, trustIn, type DealDecision } from "@/lib/sim/broadcast";
import type { Broadcaster, DealTerms } from "@/lib/sim/types";
import { Btn, Chip, Modal, Panel, money, moneyShort } from "./ui";

function Meter({ value, tone = "bg-red" }: { value: number; tone?: string }) {
  return <div className="h-1.5 bg-surface2"><div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
function Step({ label, value, set, step, min, max, fmt }: { label: string; value: number; set: (v: number) => void; step: number; min: number; max: number; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button aria-label={`Decrease ${label}`} className="h-11 w-11 border border-line text-lg" onClick={() => set(Math.max(min, value - step))}>−</button>
        <span className="num w-24 text-center font-semibold">{fmt(value)}</span>
        <button aria-label={`Increase ${label}`} className="h-11 w-11 border border-line text-lg" onClick={() => set(Math.min(max, value + step))}>+</button>
      </div>
    </div>
  );
}

function Negotiate({ b, close }: { b: Broadcaster; close: () => void }) {
  const { game, update } = useGame();
  const [t, setT] = useState<DealTerms>(() => ({ showsPerYear: 4, feePerShow: Math.max(5000, maxFee(game!, b, { showsPerYear: 4, exclusive: false, ppvShare: 0.6 })), ppvShare: 0.6, exclusive: false, years: 2 }));
  const [res, setRes] = useState<DealDecision | null>(null);
  if (!game) return null;
  const send = (terms: DealTerms) => {
    const d = evaluateDeal(game, b, terms);
    setRes(d);
    if (d.kind === "accept") update((g) => signDeal(g, b, terms));
  };
  const step = Math.max(1000, Math.round((t.feePerShow * 0.1) / 1000) * 1000);
  const signed = res?.kind === "accept";
  return (
    <Modal onClose={close} title={`Deal with ${b.name}`}>
      <p className="text-sm text-muted">They want: {b.prefers.map((p) => p.replace("-", " ")).join(", ")}. Asking above what they will pay gets a counter; far above, they walk.</p>
      <div className="mt-4 space-y-3">
        <Step label="Shows per year" value={t.showsPerYear} set={(v) => setT({ ...t, showsPerYear: v })} step={1} min={2} max={12} fmt={String} />
        <Step label="Fee per show" value={t.feePerShow} set={(v) => setT({ ...t, feePerShow: v })} step={step} min={1000} max={20_000_000} fmt={money} />
        <Step label="Your PPV share" value={Math.round(t.ppvShare * 100)} set={(v) => setT({ ...t, ppvShare: v / 100 })} step={5} min={30} max={80} fmt={(v) => `${v}%`} />
        <Step label="Length" value={t.years} set={(v) => setT({ ...t, years: v })} step={1} min={1} max={3} fmt={(v) => `${v} yr`} />
        <label className="flex min-h-11 items-center justify-between text-sm">Exclusive (bigger fee, rival-network fights cost more)<input type="checkbox" className="h-5 w-5" checked={t.exclusive} onChange={(e) => setT({ ...t, exclusive: e.target.checked })} /></label>
      </div>
      <div className="mt-3 bg-surface2 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Guaranteed per year</span><span className="num font-semibold">{money(t.feePerShow * t.showsPerYear)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Over the deal</span><span className="num font-semibold">{money(t.feePerShow * t.showsPerYear * t.years)}</span></div>
        <p className="mt-1 text-xs text-muted">You must deliver {t.showsPerYear} shows a year. Each missed date costs trust and lowers the renewal offer.</p>
      </div>
      {res && (
        <div className={`mt-3 border p-3 text-sm ${signed ? "border-good" : "border-line"}`}>
          <div className="font-semibold">{signed ? "Signed" : res.kind === "counter" ? "Counter-offer" : "They walk away"}</div>
          <p className="text-muted">{res.reason}</p>
          {res.kind === "counter" && <Btn className="mt-2 w-full" onClick={() => { setT(res.terms); send(res.terms); }}>Accept {money(res.terms.feePerShow)} per show</Btn>}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={close}>{signed ? "Close" : "Cancel"}</Btn>
        {!signed && <Btn className="flex-1" onClick={() => send(t)}>Make the offer</Btn>}
      </div>
    </Modal>
  );
}

export function BroadcastPanel() {
  const { game } = useGame();
  const [sel, setSel] = useState<Broadcaster | null>(null);
  if (!game) return null;
  const d = game.company.deal;
  const partner = d ? game.world.broadcasters.find((b) => b.id === d.broadcasterId) : null;
  return (
    <Panel title="Broadcast deals" pad={false}>
      <div className="border-b border-line p-4">
        {d && partner ? (
          <>
            <div className="flex items-center justify-between"><span className="display text-xl font-bold">{partner.name}</span><Chip tone={d.exclusive ? "red" : undefined}>{d.exclusive ? "Exclusive" : "Non-exclusive"}</Chip></div>
            <div className="mt-1 text-sm text-muted">{money(d.feePerShow)} a show · your PPV share {Math.round(d.ppvShare * 100)}% · until the end of {d.endsYear - 1}</div>
            <div className="mt-2 flex justify-between text-xs"><span className="label">Shows delivered this year</span><span className="num font-semibold">{d.showsDone} / {d.showsPerYear}</span></div>
            <Meter value={(100 * d.showsDone) / d.showsPerYear} tone="bg-blue" />
            <div className="mt-2 flex justify-between text-xs"><span className="label">Trust</span><span className="num font-semibold">{trustIn(game, partner.id)}</span></div>
            <Meter value={trustIn(game, partner.id)} />
          </>
        ) : <p className="text-sm text-muted">No deal. You sell shows one at a time for a lower fee, or go PPV-only for bigger upside and bigger risk.</p>}
      </div>
      {game.world.broadcasters.filter((b) => b.id !== "ppv").map((b) => {
        const a = appeal(game, b);
        const top = game.company.stable.length ? maxFee(game, b, { showsPerYear: 4, exclusive: false, ppvShare: 0.6 }) : 0;
        return (
          <div key={b.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="display text-lg font-semibold leading-tight">{b.name} <span className="text-xs font-normal text-muted">{b.market === "GLOBAL" ? "Global" : b.market}</span></div>
              <div className="truncate text-xs text-muted">{a.reasons.join(" · ") || "No strong view of you yet"}</div>
              <div className="num text-xs">Interest {a.score >= 1.3 ? "high" : a.score >= 0.9 ? "medium" : "low"} · up to about <span className="font-semibold">{moneyShort(top)}</span> a show</div>
            </div>
            <Btn variant="ghost" disabled={d?.broadcasterId === b.id || (!!d && d.exclusive)} onClick={() => setSel(b)}>{d?.broadcasterId === b.id ? "Partner" : "Negotiate"}</Btn>
          </div>
        );
      })}
      {d?.exclusive && <p className="px-4 pb-3 text-xs text-muted">Your current deal is exclusive: you cannot sign another until it ends.</p>}
      {sel && <Negotiate b={sel} close={() => setSel(null)} />}
    </Panel>
  );
}

export function BoardPanel() {
  const { game } = useGame();
  if (!game) return null;
  const c = game.company, b = c.board;
  const year = gameYear(game.startDate, game.week);
  const got = new Map(b.milestones.map((m) => [m.id, m.week]));
  return (
    <Panel title="Board and goals" pad={false}>
      <div className="border-b border-line p-4">
        <div className="flex items-end justify-between"><span className="label">Board confidence</span><span className="poster num text-3xl">{c.confidence}</span></div>
        <Meter value={c.confidence} />
        <p className="mt-2 text-xs text-muted">Wins, titles and profitable shows raise it. Losses, loss-making shows and missed objectives lower it.</p>
        {b.weeksInRed > 0 && <p className="mt-2 text-sm font-semibold text-bad">In the red for {b.weeksInRed} of {RED_WEEKS_LIMIT} weeks. At {RED_WEEKS_LIMIT} the board removes you.</p>}
      </div>
      <div className="border-b border-line p-4">
        <div className="label mb-2">Objectives</div>
        {b.objectives.map((o) => {
          const p = progress(game, o);
          const text = o.kind === "profit" ? `${p >= 0 ? "+" : ""}${moneyShort(p)} so far` : o.kind === "arena" ? (p ? "done" : "not yet") : `${Math.min(p, o.target)} / ${o.target}`;
          return (
            <div key={o.id} className="flex items-center gap-3 border-t border-line py-2 first:border-0">
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{o.text}</div><div className="num text-xs text-muted">{o.status === "open" ? `${text} · due end of ${o.dueYear - 1}${o.dueYear - 1 === year ? " (this season)" : ""}` : ""}</div></div>
              <Chip tone={o.status === "done" ? "good" : o.status === "failed" ? "red" : undefined}>{o.status === "done" ? "Met" : o.status === "failed" ? "Missed" : "Open"}</Chip>
            </div>
          );
        })}
      </div>
      <div className="p-4">
        <div className="label mb-2">Milestones · {b.wins} wins as a promoter</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {MILESTONES.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 border px-3 py-2 text-sm ${got.has(m.id) ? "border-gold font-semibold" : "border-line text-muted"}`}>
              <span aria-hidden className={got.has(m.id) ? "text-gold" : ""}>{got.has(m.id) ? "■" : "□"}</span>{m.label}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function FinancePanel() {
  const { game } = useGame();
  if (!game) return null;
  const shows = game.shows.filter((s) => s.statement);
  const profit = shows.reduce((t, s) => t + s.statement!.profit, 0);
  const committed = game.fights.filter((f) => !f.done && f.promoter === "player").reduce((t, f) => t + f.purseA + f.purseB, 0);
  const guarantees = game.company.stable.reduce((t, id) => { const c = game.world.fighters[id]?.contract; return t + (c ? c.fightsLeft * c.purse : 0); }, 0);
  const rows: [string, string][] = [
    ["Cash", money(game.company.cash)],
    ["Since the start of the season", `${game.company.cash - game.company.board.seasonStartCash >= 0 ? "+" : ""}${money(game.company.cash - game.company.board.seasonStartCash)}`],
    [`Profit from ${shows.length} show${shows.length === 1 ? "" : "s"}`, money(profit)],
    ["Purses owed on booked fights", money(-committed)],
    ["Contract guarantees outstanding", money(-guarantees)],
  ];
  return (
    <Panel title="Finances" pad={false}>
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0"><span className="text-muted">{k}</span><span className="num font-semibold">{v}</span></div>)}
    </Panel>
  );
}

export function GameOver() {
  const { game, closeGame } = useGame();
  const [seen, setSeen] = useState(false);
  if (!game?.over || seen) return null;
  const b = game.company.board;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="ring w-full max-w-md border border-line p-6 text-center">
        <div className="label !text-white/60">Week {game.over.week}</div>
        <h2 className="poster mt-2 text-5xl">Thrown out</h2>
        <p className="mt-3 text-sm text-white/80">{game.over.reason}</p>
        <p className="mt-3 text-sm text-white/60">{b.wins} wins · {game.shows.filter((s) => s.statement).length} shows · {b.milestones.length} milestones</p>
        <div className="mt-5 flex gap-2">
          <Btn variant="ghost" className="flex-1" onClick={() => setSeen(true)}>Look around</Btn>
          <Btn variant="bell" className="flex-1" onClick={closeGame}>New career</Btn>
        </div>
      </div>
    </div>
  );
}
