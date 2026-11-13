"use client";
import { useState } from "react";
import { GameProvider, useGame } from "@/lib/game/store";
import { dateForWeek, fmtDate } from "@/lib/sim/calendar";
import NewGame from "./NewGame";
import { ProfileProvider } from "./profile";
import { Btn, money } from "./ui";
import { FightsScreen, FeedScreen, HomeScreen, MarketScreen, MoreScreen, ShowsScreen, StableScreen, WorldScreen } from "./screens";

const TABS = [
  { id: "home", label: "Home", icon: "⌂", phone: true },
  { id: "stable", label: "Stable", icon: "🥊", phone: true },
  { id: "fights", label: "Fights", icon: "⚔", phone: true },
  { id: "shows", label: "Shows", icon: "🎤", phone: true },
  { id: "market", label: "Market", icon: "＄", phone: false },
  { id: "world", label: "World", icon: "🌍", phone: false },
  { id: "feed", label: "Feed", icon: "📰", phone: false },
  { id: "more", label: "More", icon: "☰", phone: true },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Shell() {
  const { game, ready, nextWeek } = useGame();
  const [tab, setTab] = useState<Tab>("market");

  if (!ready) return <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>;
  if (!game) return <NewGame />;

  const date = fmtDate(dateForWeek(game.startDate, game.week));
  const screens: Record<Tab, React.ReactNode> = {
    home: <HomeScreen go={(t) => setTab(t as Tab)} />, stable: <StableScreen />, fights: <FightsScreen />,
    shows: <ShowsScreen />, market: <MarketScreen />, world: <WorldScreen />, feed: <FeedScreen />, more: <MoreScreen go={(t) => setTab(t as Tab)} />,
  };
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface p-3 md:flex">
        <div className="display mb-4 px-2 text-2xl font-bold leading-none">{game.company.name}</div>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
            className={`mb-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold ${tab === t.id ? "bg-accent text-accentfg" : "hover:bg-surface2"}`}>
            <span aria-hidden>{t.icon}</span>{t.label}
          </button>
        ))}
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="num text-sm font-bold">{date}</div>
            <div className="num text-xs text-muted">{money(game.company.cash)}</div>
          </div>
          <Btn variant="ghost" disabled title="No fights booked yet">Sim to fight</Btn>
          <Btn onClick={nextWeek}>Next week</Btn>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 md:pb-8">{screens[tab]}</main>
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden" aria-label="Main">
          {TABS.filter((t) => t.phone).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === t.id ? "text-accent" : "text-muted"}`}>
              <span aria-hidden className="text-lg leading-none">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function GameApp() {
  return <GameProvider><ProfileProvider><Shell /></ProfileProvider></GameProvider>;
}
