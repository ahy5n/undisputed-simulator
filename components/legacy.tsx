"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import { records } from "@/lib/sim/legacy";
import { venueById } from "@/lib/sim/shows";
import { DIVISION_LABEL } from "@/lib/sim/types";
import { Chip, Empty, Panel, money, moneyShort } from "./ui";

export function HallPanel() {
  const { game } = useGame();
  const [tab, setTab] = useState<"hall" | "undisputed" | "olympics">("hall");
  if (!game) return null;
  const h = game.hall;
  const F = game.world.fighters;
  const TABS = [["hall", `Hall of Fame (${h.inductees.length})`], ["undisputed", `Undisputed (${h.undisputed.length})`], ["olympics", `Olympics (${h.olympics.length})`]] as const;
  return (
    <Panel title="Hall of Fame" pad={false}>
      <div className="flex border-b border-line">
        {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className={`min-h-11 flex-1 px-1 text-xs font-semibold ${tab === id ? "bg-surface2 text-fg" : "text-muted"}`}>{l}</button>)}
      </div>
      {tab === "hall" && (h.inductees.length ? [...h.inductees].reverse().slice(0, 40).map((x) => (
        <div key={x.id + x.year} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
          <div className="min-w-0"><div className="display text-lg font-semibold leading-tight">{x.name}</div><div className="text-xs text-muted">{x.record} · {x.titleWins} title win{x.titleWins === 1 ? "" : "s"}</div></div>
          <Chip>{x.year}</Chip>
        </div>
      )) : <div className="p-4"><Empty>Retired greats are inducted each January: five title wins, a big record and a bigger name, or an undisputed reign.</Empty></div>)}
      {tab === "undisputed" && (h.undisputed.length ? [...h.undisputed].reverse().map((u) => (
        <div key={u.id + u.division} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0"><span className="display text-lg font-semibold">{u.name}{F[u.id]?.promoter === "player" ? " ★" : ""}</span><span className="text-xs text-muted">{DIVISION_LABEL[u.division]} · week {u.week}</span></div>
      )) : <div className="p-4"><Empty>Nobody holds all four belts at one weight yet. Be the first.</Empty></div>)}
      {tab === "olympics" && (h.olympics.length ? [...h.olympics].reverse().map((o) => (
        <div key={o.year} className="border-b border-line px-4 py-3 last:border-0">
          <div className="poster text-lg">{o.city} {o.year}</div>
          {o.medals.map((m) => <div key={m.division} className="flex justify-between gap-2 text-xs"><span className="text-muted">{DIVISION_LABEL[m.division]}</span><span className="font-semibold">{m.gold}</span></div>)}
        </div>
      )) : <div className="p-4"><Empty>The next Games are in 2028 (Los Angeles). Medallists arrive in the prospect pool as the most wanted names in boxing.</Empty></div>)}
    </Panel>
  );
}

export function RecordsPanel() {
  const { game } = useGame();
  const r = useMemo(() => (game ? records(game, (id) => venueById(id).name) : null), [game]);
  if (!game || !r) return null;
  const p = r.promoter;
  const row = (k: string, v: string) => <div key={k} className="flex justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0"><span className="text-muted">{k}</span><span className="num text-right font-semibold">{v}</span></div>;
  return (
    <Panel title="Records" pad={false}>
      {row("Your fighters' record", `${p.w}-${p.l}-${p.d} (${p.titleWins} title wins)`)}
      {r.fastestKo && row("Quickest title KO", `${r.fastestKo.name} over ${r.fastestKo.over}, round ${r.fastestKo.round}`)}
      {r.mostTitleWins.length > 0 && row("Most title wins", r.mostTitleWins.map((x) => `${x.name} ${x.n}`).slice(0, 3).join(" · "))}
      {r.mostKos.length > 0 && row("Most stoppages", r.mostKos.map((x) => `${x.name} ${x.n}`).slice(0, 3).join(" · "))}
      {r.biggestGates.length > 0 ? r.biggestGates.slice(0, 3).map((x, i) => row(`Biggest show #${i + 1}`, `${x.label}, ${x.attendance.toLocaleString("en-GB")} fans, ${moneyShort(x.revenue)} (${x.profit >= 0 ? "+" : ""}${money(x.profit)})`)) : row("Biggest show", "none yet")}
    </Panel>
  );
}
