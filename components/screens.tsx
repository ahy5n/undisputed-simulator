"use client";
import { useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/game/store";
import { exportSave, importSave } from "@/lib/save/db";
import { gameYear } from "@/lib/sim/calendar";
import { ageAt, recordString } from "@/lib/sim/fighter";
import { computeRankings } from "@/lib/sim/rankings";
import { DIVISIONS, DIVISION_LABEL, DIVISION_LIMIT, WORLD_BODIES, type Division, type Fighter, type WorldBody } from "@/lib/sim/types";
import { Badge, Btn, Card, FighterRow, H, money } from "./ui";
import { StableActions } from "./market";

const Soon = ({ phase, what }: { phase: number; what: string }) => (
  <Card className="text-sm text-muted">{what} arrives in build phase {phase}.</Card>
);

export function HomeScreen({ go }: { go: (t: string) => void }) {
  const { game } = useGame();
  if (!game) return null;
  const c = game.company;
  return (
    <div className="space-y-4">
      <H sub="Decisions needed come first">Inbox</H>
      {game.inbox.length === 0 && <Card className="text-sm text-muted">Nothing needs you this week.</Card>}
      {game.inbox.map((m) => (
        <Card key={m.id}><div className="font-semibold">{m.title}</div><p className="mt-1 text-sm text-muted">{m.body}</p></Card>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-xs text-muted">Cash</div><div className="display num text-3xl font-bold">{money(c.cash)}</div></Card>
        <Card>
          <div className="text-xs text-muted">Board confidence</div>
          <div className="display num text-3xl font-bold">{c.confidence}</div>
          <div className="mt-1 h-1.5 rounded bg-surface2"><div className="h-full rounded bg-accent" style={{ width: `${c.confidence}%` }} /></div>
        </Card>
      </div>
      <Card>
        <div className="text-sm font-semibold">This week</div>
        <p className="mt-1 text-sm text-muted">No fights or shows scheduled.</p>
        {c.stable.length === 0 && <Btn className="mt-3 w-full" onClick={() => go("market")}>Sign your first fighter</Btn>}
      </Card>
    </div>
  );
}

export function StableScreen() {
  const { game } = useGame();
  const [sel, setSel] = useState<Fighter | null>(null);
  if (!game) return null;
  const year = gameYear(game.startDate, game.week);
  const mine = game.company.stable.map((id) => game.world.fighters[id]).filter(Boolean);
  return (
    <div>
      <H sub={`${mine.length} fighter${mine.length === 1 ? "" : "s"}`}>Stable</H>
      {mine.length === 0 ? <Card className="text-sm text-muted">No fighters yet. Sign some in the Market.</Card> : (
        <Card className="py-1">
          {mine.map((f) => (
            <FighterRow key={f.id} f={f} right={<div><div>{ageAt(f, year)}y</div><button onClick={() => setSel(f)} className="min-h-11 text-xs font-semibold text-accent">Manage</button></div>} />
          ))}
        </Card>
      )}
      {sel && <StableActions f={sel} close={() => setSel(null)} />}
    </div>
  );
}

export const ShowsScreen = () => (<div><H>Shows</H><Soon phase={7} what="The show builder and money projection" /></div>);
export const FeedScreen = () => (<div><H>Feed</H><Soon phase={11} what="The social feed, news and press conferences" /></div>);

export function WorldScreen() {
  const { game } = useGame();
  const [div, setDiv] = useState<Division>("heavyweight");
  const [body, setBody] = useState<WorldBody>("WBC");
  const rankings = useMemo(() => (game ? computeRankings(game.world) : null), [game?.world]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game || !rankings) return null;
  const F = game.world.fighters;
  const champId = game.world.belts[div][body];
  const champ = champId ? F[champId] : null;
  const list = rankings[div][body].map((id) => F[id]);
  return (
    <div>
      <H sub="Top 15 per sanctioning body. The champion is shown separately.">World</H>
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {DIVISIONS.map((d) => (
          <button key={d} onClick={() => setDiv(d)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${d === div ? "bg-accent text-accentfg" : "border border-line bg-surface"}`}>{DIVISION_LABEL[d]}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {WORLD_BODIES.map((b) => (
          <button key={b} onClick={() => setBody(b)} className={`min-h-11 rounded-lg text-sm font-bold ${b === body ? "bg-fg text-bg" : "border border-line bg-surface"}`}>{b}</button>
        ))}
      </div>
      <Card className="mb-3 py-1">
        <div className="pt-2 text-xs font-semibold text-muted">{body} {DIVISION_LABEL[div]} champion ({DIVISION_LIMIT[div]})</div>
        {champ ? <FighterRow f={champ} right={<Badge>C</Badge>} /> : <p className="py-3 text-sm text-muted">Vacant. A vacant title fight is needed.</p>}
        <div className="border-t border-line pt-2 text-xs font-semibold text-muted">Rankings</div>
        {list.map((f, i) => <FighterRow key={f.id} f={f} right={<span className="text-muted">#{i + 1}</span>} />)}
      </Card>
    </div>
  );
}

export function MoreScreen({ go }: { go: (t: string) => void }) {
  const { game, closeGame, update, refreshSaves, open } = useGame();
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  if (!game) return null;
  const links: [string, string][] = [["market", "Market"], ["world", "World"], ["feed", "Feed"]];
  return (
    <div className="space-y-4">
      <H>More</H>
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {links.map(([id, l]) => <Btn key={id} variant="ghost" onClick={() => go(id)}>{l}</Btn>)}
      </div>
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Settings</div>
        <label className="flex min-h-11 items-center justify-between text-sm">Hide round scorecards in live fights
          <input type="checkbox" className="h-5 w-5" checked={game.settings.hideScorecards} onChange={(e) => update((g) => ({ ...g, settings: { ...g.settings, hideScorecards: e.target.checked } }))} />
        </label>
        <label className="flex min-h-11 items-center justify-between text-sm">Theme
          <select className="min-h-11 rounded-lg border border-line bg-bg px-2" defaultValue="auto" onChange={(e) => {
            const v = e.target.value; if (v === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", v);
          }}><option value="auto">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
        </label>
      </Card>
      <Card className="space-y-2">
        <div className="text-sm font-semibold">Save</div>
        <p className="text-xs text-muted">Autosaves in this browser. Export a JSON backup now and then.</p>
        <Btn variant="ghost" className="w-full" onClick={() => exportSave(game)}>Export save</Btn>
        <input ref={ref} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try { const g = await importSave(f); await refreshSaves(); await open(g.id); setMsg("Imported."); } catch (er) { setMsg(er instanceof Error ? er.message : "Import failed"); }
        }} />
        <Btn variant="ghost" className="w-full" onClick={() => ref.current?.click()}>Import save</Btn>
        <Btn variant="ghost" className="w-full" onClick={closeGame}>Switch / new save</Btn>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </Card>
      <p className="text-center text-xs text-muted">Finances, broadcaster deals, board, Hall of Fame and records land in later phases.</p>
    </div>
  );
}
export { recordString };
