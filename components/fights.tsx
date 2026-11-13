"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/lib/game/store";
import { overall } from "@/lib/sim/fighter";
import { simulateFight, type FightResult } from "@/lib/sim/fight";
import { Rng } from "@/lib/sim/rng";
import { DIVISIONS, DIVISION_LABEL, type Division, type Fighter } from "@/lib/sim/types";
import { LiveFight, ResultView } from "./fightui";
import { Btn, Card, H } from "./ui";

export function FightsScreen() {
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
  const a: Fighter | undefined = F[aId] ?? pool[0];
  const b: Fighter | undefined = F[bId] && F[bId].id !== a?.id ? F[bId] : pool.find((f) => f.id !== a?.id);
  if (!a || !b) return null;

  if (mode === "live") return <LiveFight key={nonce} a={a} b={b} rounds={rounds} hideCards={game.settings.hideScorecards} onFinish={(r) => { setResult(r); setMode("result"); }} onExit={() => setMode("setup")} />;
  if (mode === "result" && result) return <ResultView a={a} b={b} r={result} onDone={() => setMode("setup")} onRematch={() => { setNonce(nonce + 1); setMode("live"); }} />;

  const Opt = ({ f }: { f: Fighter }) => <option value={f.id}>{f.name} ({overall(f.ratings)})</option>;
  return (
    <div className="space-y-3">
      <H sub="Matchmaking, offers and mandatories arrive in phase 6. Until then, stage an exhibition between any two fighters.">Fights</H>
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Exhibition</div>
        <select value={div} onChange={(e) => { setDiv(e.target.value as Division); setA(""); setB(""); }} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3">
          {DIVISIONS.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
        </select>
        <select value={a.id} onChange={(e) => setA(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Your fighter">{pool.map((f) => <Opt key={f.id} f={f} />)}</select>
        <div className="text-center text-xs text-muted">vs</div>
        <select value={b.id} onChange={(e) => setB(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Opponent">{pool.filter((f) => f.id !== a.id).map((f) => <Opt key={f.id} f={f} />)}</select>
        <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="min-h-11 w-full rounded-lg border border-line bg-bg px-3" aria-label="Rounds">
          {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} rounds</option>)}
        </select>
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => { setNonce(nonce + 1); setMode("live"); }}>Watch live</Btn>
          <Btn variant="ghost" className="flex-1" onClick={() => { setResult(simulateFight(a, b, { rounds }, new Rng((Date.now() ^ 0xabcdef) >>> 0))); setMode("result"); }}>Quick sim</Btn>
        </div>
      </Card>
    </div>
  );
}
