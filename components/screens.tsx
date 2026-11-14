"use client";
import { useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/game/store";
import { exportSave, importSave } from "@/lib/save/db";
import { gameYear } from "@/lib/sim/calendar";
import { ageAt, recordString } from "@/lib/sim/fighter";
import { computeRankings } from "@/lib/sim/rankings";
import { DIVISIONS, DIVISION_LABEL, DIVISION_LIMIT, WORLD_BODIES, type Division, type Fighter, type WorldBody } from "@/lib/sim/types";
import { Badge, Btn, Card, CountUp, Empty, FighterRow, H, Panel, Stat, money, moneyShort } from "./ui";
import { FightPoster } from "./poster";
import { feed } from "@/lib/sim/news";
import { pendingPlayerFights } from "@/lib/sim/game";
import { StableActions } from "./market";


export function HomeScreen({ go }: { go: (t: string) => void }) {
  const { game } = useGame();
  if (!game) return null;
  const c = game.company;
  const F = game.world.fighters;
  const year = gameYear(game.startDate, game.week);
  const mineIds = new Set(c.stable);
  const myFights = game.fights.filter((f) => !f.done && (mineIds.has(f.a) || mineIds.has(f.b))).sort((x, y) => x.week - y.week);
  const next = myFights[0];
  const pending = pendingPlayerFights(game);
  const myOrders = game.orders.filter((o) => [o.champion, o.challenger, o.other].some((id) => id && mineIds.has(id)));
  const unshown = game.fights.filter((f) => !f.done && f.promoter === "player" && !f.showId).length;
  const idle = c.stable.map((id) => F[id]).filter((f) => f && !f.retired && !myFights.some((x) => x.a === f.id || x.b === f.id));
  const champs = c.stable.map((id) => F[id]).filter((f) => f?.titles.length);
  const alerts: { text: string; to: string; hot?: boolean }[] = [];
  if (pending.length) alerts.push({ text: `Fight night: ${F[pending[0].a].name} vs ${F[pending[0].b].name}`, to: "fights", hot: true });
  for (const o of game.incoming) alerts.push({ text: `Fight offer for ${F[o.mine].name}: ${F[o.opp].name}`, to: "fights" });
  for (const o of myOrders) alerts.push({ text: `${o.body} has ordered ${o.kind === "vacant" ? "a vacant title fight" : "a mandatory"}: agree terms within ${Math.max(0, o.deadline - game.week)} weeks`, to: "fights", hot: true });
  if (game.purseBids.length) alerts.push({ text: `${game.purseBids.length} purse bid${game.purseBids.length > 1 ? "s" : ""} open`, to: "fights" });
  if (game.negotiations.length) alerts.push({ text: `${game.negotiations.length} bidding war${game.negotiations.length > 1 ? "s" : ""} in progress`, to: "market" });
  if (unshown) alerts.push({ text: `${unshown} fight${unshown > 1 ? "s" : ""} you promote ${unshown > 1 ? "have" : "has"} no show yet`, to: "shows" });
  if (idle.length && c.stable.length) alerts.push({ text: `${idle.length} of your fighters ${idle.length > 1 ? "have" : "has"} nothing booked`, to: "fights" });
  if (c.cash < 0) alerts.push({ text: "You are in the red. Eight weeks below zero and the board acts.", to: "more", hot: true });
  const stories = feed(game, 5);
  return (
    <div className="space-y-4">
      <div>
        <div className="label">{c.name}</div>
        <h1 className="poster mt-1 text-4xl">{pending.length ? "It's fight night" : next ? `${next.week - game.week} week${next.week - game.week === 1 ? "" : "s"} to the bell` : c.stable.length ? "Make a fight" : "Build your stable"}</h1>
        <div className="ropes mt-2 w-16" aria-hidden />
      </div>

      {next ? (
        <FightPoster a={F[mineIds.has(next.a) ? next.a : next.b]} b={F[mineIds.has(next.a) ? next.b : next.a]} year={year}
          kicker={next.titles.length ? `${next.titles.join(" · ")} world title` : `${next.rounds} rounds`}
          footer={pending.includes(next) ? "Tonight" : `In ${next.week - game.week} week${next.week - game.week === 1 ? "" : "s"}`}>
          <Btn variant="bell" className="mt-3 w-full" onClick={() => go("fights")}>{pending.includes(next) ? "Go to the ring" : "Camp and fight details"}</Btn>
        </FightPoster>
      ) : (
        <div className="ring overflow-hidden rounded-xl border border-line">
          <div className="ropes" aria-hidden />
          <div className="p-5 text-center">
            <div className="poster text-2xl">{c.stable.length ? "The ring is empty" : "No fighters. No fights. No money."}</div>
            <p className="mx-auto mt-2 max-w-xs text-sm text-white/70">{c.stable.length ? "Every one of your fighters has a shortlist of five opponents waiting." : "Start in the market. Free agents sign quickly; big names start bidding wars."}</p>
            <Btn variant="bell" className="mt-4" onClick={() => go(c.stable.length ? "fights" : "market")}>{c.stable.length ? "Open the shortlist" : "Sign your first fighter"}</Btn>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.slice(0, 6).map((a, i) => (
            <button key={i} onClick={() => go(a.to)} className={`flex min-h-11 w-full items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-left text-sm font-semibold ${a.hot ? "tape-red border-red/50" : "tape-blue border-line"}`}>
              <span className="min-w-0 flex-1">{a.text}</span><span className="text-muted" aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Cash" value={<CountUp value={c.cash} format={moneyShort} />} tone={c.cash < 0 ? "bad" : undefined} sub={money(c.cash)} />
        <Stat label="Board confidence" value={c.confidence} tone={c.confidence < 30 ? "bad" : c.confidence > 65 ? "good" : undefined} sub={<span className="mt-1 block h-1.5 rounded bg-surface2"><span className="block h-full rounded bg-red" style={{ width: `${c.confidence}%` }} /></span>} />
        <Stat label="Reputation" value={Math.round(c.reputation)} sub="Opens doors with big names" />
        <Stat label="Stable" value={c.stable.length} sub={champs.length ? `${champs.length} world champion${champs.length > 1 ? "s" : ""}` : "No champions yet"} />
      </div>

      <Panel title="Around the rings" right={<button className="min-h-11 text-xs font-semibold text-muted" onClick={() => go("feed")}>All news ›</button>} pad={false}>
        {stories.length ? stories.map((st) => (
          <div key={st.id} className="border-b border-line px-4 py-2.5 last:border-0">
            <div className="display text-lg font-bold leading-tight">{st.headline}</div>
            <div className="text-xs text-muted">{st.detail}</div>
          </div>
        )) : <p className="p-4 text-sm text-muted">No results yet. Ring the bell: fights happen every week.</p>}
      </Panel>

      {game.inbox.length > 0 && (
        <Panel title="Inbox" pad={false}>
          {game.inbox.slice(0, 5).map((m) => (
            <div key={m.id} className="border-b border-line px-4 py-2.5 last:border-0"><div className="text-sm font-semibold">{m.title}</div><p className="text-xs text-muted">{m.body}</p></div>
          ))}
        </Panel>
      )}
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

const KICK: Record<string, string> = { title: "World title", upset: "Upset", ko: "Knockout", result: "Result", yours: "Your stable" };
export function FeedScreen() {
  const { game } = useGame();
  if (!game) return null;
  const stories = feed(game, 40);
  return (
    <div>
      <H sub="Results, title changes and reaction from around the boxing world.">Feed</H>
      {stories.length === 0 && <Empty>Nothing to report yet. Fights are being made; give it a few weeks.</Empty>}
      <div className="space-y-2">
        {stories.map((st) => (
          <div key={st.id} className={`rounded-xl border border-line bg-surface p-3 ${st.kind === "title" || st.kind === "yours" ? "tape-red" : st.kind === "upset" ? "tape-blue" : ""}`}>
            <div className="flex items-center justify-between"><span className={`label ${st.kind === "title" || st.kind === "yours" ? "!text-red" : ""}`}>{KICK[st.kind]}</span><span className="num text-[11px] text-muted">{game.week - st.week <= 0 ? "this week" : `${game.week - st.week}w ago`}</span></div>
            <div className="display mt-0.5 text-xl font-bold leading-tight">{st.headline}</div>
            <div className="text-sm text-muted">{st.detail}</div>
            {st.quote && <p className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-sm"><span className="font-semibold">{st.quote.who}:</span> “{st.quote.text}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorldScreen() {
  const { game } = useGame();
  const [div, setDiv] = useState<Division>("heavyweight");
  const [body, setBody] = useState<WorldBody>("WBC");
  const world = game?.world;
  const rankings = useMemo(() => (world ? computeRankings(world) : null), [world]);
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
