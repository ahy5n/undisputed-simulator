"use client";
import { useState } from "react";
import { pendingPlayerFights } from "@/lib/sim/game";
import { GameProvider, useGame } from "@/lib/game/store";
import { dateForWeek, fmtDate } from "@/lib/sim/calendar";
import NewGame from "./NewGame";
import { ProfileProvider } from "./profile";
import { FightReport } from "./report";
import { Btn, CountUp } from "./ui";
import { FightsScreen } from "./fights";
import { MarketScreen } from "./market";
import { ShowsScreen } from "./shows";
import { FeedScreen, HomeScreen, MoreScreen, StableScreen, WorldScreen } from "./screens";

const TABS = [
  { id: "home", label: "Home", phone: true },
  { id: "stable", label: "Stable", phone: true },
  { id: "fights", label: "Fights", phone: true },
  { id: "shows", label: "Shows", phone: true },
  { id: "market", label: "Market", phone: false },
  { id: "world", label: "World", phone: false },
  { id: "feed", label: "Feed", phone: false },
  { id: "more", label: "More", phone: true },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Line icons drawn for this game, so tabs don't depend on emoji fonts. */
function Icon({ id }: { id: Tab }) {
  const p: Record<Tab, React.ReactNode> = {
    home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>,
    stable: <><path d="M7 11V8a4 4 0 0 1 8 0v1h1.5A2.5 2.5 0 0 1 19 11.5V13a4 4 0 0 1-4 4H9a2 2 0 0 1-2-2z" /><path d="M9 17v3h6v-3" /></>,
    fights: <><path d="M4 7h16M4 12h16M4 17h16" /><path d="M6 4v16M18 4v16" /></>,
    shows: <><path d="M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 0 0-6V6H4z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
    market: <><path d="M5 6h14l-1.5 9h-11z" /><path d="M9 19h.01M15 19h.01" /></>,
    world: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" /></>,
    feed: <><path d="M5 5h11v14H5z" /><path d="M16 9h3v10h-3M8 9h5M8 12h5M8 15h3" /></>,
    more: <path d="M5 7h14M5 12h14M5 17h14" />,
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[id]}</svg>;
}

function Shell() {
  const { game, ready, nextWeek, simToFight } = useGame();
  const [tab, setTab] = useState<Tab>("home");

  if (!ready) return <div className="grid min-h-dvh place-items-center"><div className="text-center"><div className="poster text-3xl">Lacing up…</div><div className="ropes mx-auto mt-3 w-24" /></div></div>;
  if (!game) return <NewGame />;

  const date = fmtDate(dateForWeek(game.startDate, game.week));
  const fightNight = pendingPlayerFights(game).length > 0;
  const needs = game.incoming.length + game.negotiations.length + game.purseBids.length;
  const c = game.company;
  const initials = c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const go = (t: string) => { setTab(t as Tab); window.scrollTo({ top: 0 }); };
  const screens: Record<Tab, React.ReactNode> = {
    home: <HomeScreen go={go} />, stable: <StableScreen />, fights: <FightsScreen />,
    shows: <ShowsScreen />, market: <MarketScreen />, world: <WorldScreen />, feed: <FeedScreen />, more: <MoreScreen go={go} />,
  };
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="poster flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-white" style={{ background: c.colours.primary, boxShadow: `inset 0 -5px 0 ${c.colours.secondary}` }}>{initials}</span>
          <span className="min-w-0"><span className="display block truncate text-lg font-bold leading-tight">{c.name}</span><span className="label">Promotions</span></span>
        </div>
        <div className="ropes" aria-hidden />
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id}
              className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${tab === t.id ? "tape-red bg-surface2 text-fg" : "text-muted hover:bg-surface2 hover:text-fg"}`}>
              <Icon id={t.id} />{t.label}
              {t.id === "fights" && (needs > 0 || fightNight) && <span className="ml-auto rounded-full bg-red px-1.5 text-[10px] font-bold text-white">{fightNight ? "!" : needs}</span>}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="poster text-lg">{date}</div>
            <div className={`num text-xs font-semibold ${c.cash < 0 ? "text-bad" : "text-muted"}`}><CountUp value={c.cash} /></div>
          </div>
          {fightNight ? (
            <Btn variant="bell" className="animate-rise" onClick={() => go("fights")}>Fight night</Btn>
          ) : (
            <>
              <Btn variant="ghost" onClick={simToFight}>Sim to fight</Btn>
              <Btn variant="bell" onClick={nextWeek}>Next week</Btn>
            </>
          )}
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 md:pb-10">{screens[tab]}</main>
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden" aria-label="Main">
          <div className="flex">
            {TABS.filter((t) => t.phone).map((t) => (
              <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id}
                className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === t.id ? "text-fg" : "text-muted"}`}>
                {tab === t.id && <span className="absolute inset-x-4 top-0 h-0.5 bg-red" aria-hidden />}
                <Icon id={t.id} />{t.label}
                {t.id === "fights" && (needs > 0 || fightNight) && <span className="absolute right-[26%] top-1.5 h-2 w-2 rounded-full bg-red" aria-hidden />}
              </button>
            ))}
          </div>
        </nav>
      </div>
      <FightReport goFights={() => go("fights")} />
    </div>
  );
}

export default function GameApp() {
  return <GameProvider><ProfileProvider><Shell /></ProfileProvider></GameProvider>;
}
