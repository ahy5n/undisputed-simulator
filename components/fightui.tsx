"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { commentate } from "@/lib/sim/commentary";
import {
  TACTICS, aiTactic, cutman, describeResult, initFight, playRound, throwTowel,
  type FightConfig, type FightResult, type PunchStats, type Shout, type Tactic,
} from "@/lib/sim/fight";
import { Rng } from "@/lib/sim/rng";
import { flag, overall, recordString } from "@/lib/sim/fighter";
import type { Fighter } from "@/lib/sim/types";
import { Btn, Card } from "./ui";

const TACTIC_LABEL: Record<Tactic, string> = {
  balanced: "Balanced", "box-and-move": "Box and move", pressure: "Pressure", body: "Go to the body",
  counter: "Counter", clinch: "Clinch and survive", "go-for-ko": "Go for the KO",
};
const SHOUTS: [Shout, string][] = [["jab", "Jab!"], ["move", "Move your feet!"], ["body", "Body!"], ["tie-up", "Tie him up!"], ["hands", "Let your hands go!"]];

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span className="w-12">{label}</span>
      <div className="h-2 flex-1 rounded bg-surface2"><div className={`h-full rounded ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

export function StatsTable({ a, b, an, bn }: { a: PunchStats; b: PunchStats; an: string; bn: string }) {
  const rows: [string, string, string][] = [
    ["Punches landed / thrown", `${a.landed}/${a.thrown}`, `${b.landed}/${b.thrown}`],
    ["Jabs landed / thrown", `${a.jabsLanded}/${a.jabsThrown}`, `${b.jabsLanded}/${b.jabsThrown}`],
    ["Power landed / thrown", `${a.powerLanded}/${a.powerThrown}`, `${b.powerLanded}/${b.powerThrown}`],
    ["Accuracy", `${Math.round((100 * a.landed) / Math.max(1, a.thrown))}%`, `${Math.round((100 * b.landed) / Math.max(1, b.thrown))}%`],
  ];
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-muted"><th className="py-1 text-left font-normal"></th><th className="text-right font-semibold text-fg">{an.split(" ").slice(-1)[0]}</th><th className="text-right font-semibold text-fg">{bn.split(" ").slice(-1)[0]}</th></tr></thead>
      <tbody>{rows.map(([k, x, y]) => <tr key={k} className="border-t border-line"><td className="py-2 text-muted">{k}</td><td className="num text-right">{x}</td><td className="num text-right">{y}</td></tr>)}</tbody>
    </table>
  );
}

export function ResultView({ a, b, r, onRematch, onDone }: { a: Fighter; b: Fighter; r: FightResult; onRematch?: () => void; onDone: () => void }) {
  return (
    <div className="space-y-3">
      <Card>
        <div className="display text-3xl font-bold leading-tight">{describeResult(a, b, r)}</div>
        <p className="mt-1 text-sm text-muted">
          {r.method === "KO" || r.method === "TKO" ? `Stopped in round ${r.round} of ${r.scheduled}` : `${r.scheduled} rounds`}
          {r.controversial ? " · Controversial verdict" : ""} · Knockdowns {r.knockdowns.a}-{r.knockdowns.b}
        </p>
        {r.scorecards.length > 0 && (r.method === "UD" || r.method === "SD" || r.method === "MD" || r.method === "Draw") && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {r.scorecards.map((c, i) => <div key={i} className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">Judge {i + 1}</div><div className="display num text-xl font-bold">{c.a}-{c.b}</div></div>)}
          </div>
        )}
      </Card>
      <Card><StatsTable a={r.stats.a} b={r.stats.b} an={a.name} bn={b.name} /></Card>
      <div className="flex gap-2">
        {onRematch && <Btn variant="ghost" className="flex-1" onClick={onRematch}>Rematch</Btn>}
        <Btn className="flex-1" onClick={onDone}>Done</Btn>
      </div>
    </div>
  );
}

interface Props { a: Fighter; b: Fighter; rounds: number; extra?: Partial<FightConfig>; hideCards: boolean; onFinish: (r: FightResult) => void; onExit: () => void }

export function LiveFight({ a, b, rounds, extra, hideCards, onFinish, onExit }: Props) {
  const [rng] = useState(() => new Rng((Date.now() ^ 0x9e3779b9) >>> 0));
  const [crng] = useState(() => new Rng((Date.now() ^ 0x1234567) >>> 0));
  const [engine] = useState(() => initFight(a, b, { ...extra, rounds }, rng));
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [log, setLog] = useState<{ round: number; text: string }[]>([]);
  const [queue, setQueue] = useState<{ round: number; text: string }[]>([]);
  const [tactic, setTactic] = useState<Tactic>("balanced");
  const [shouts, setShouts] = useState<Shout[]>([]);
  const [fire, setFire] = useState<"" | "fire" | "calm">("");
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [towelAsk, setTowelAsk] = useState(false);
  const [cutUsed, setCutUsed] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = queue.length > 0;

  useEffect(() => {
    if (!queue.length) return;
    const t = setTimeout(() => {
      setLog((l) => [...l, queue[0]]);
      setQueue((q) => q.slice(1));
    }, speed === 1 ? 650 : 280);
    return () => clearTimeout(t);
  }, [queue, speed]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [log]);
  useEffect(() => { if (engine.over && !busy && engine.result) { /* result shown below */ } }, [engine.over, busy, engine.result]);

  function ring() {
    if (engine.over || busy) return;
    const tb = aiTactic(engine.b, engine.a, engine, "b", rng);
    const sum = playRound(engine, { tactic, shouts, fireUp: fire === "fire", calm: fire === "calm" }, { tactic: tb }, rng);
    const lines = commentate(engine, sum, crng, !hideCards).map((text) => ({ round: sum.round, text }));
    setQueue(lines); setShouts([]); setFire("");
    force();
  }
  function skipRound() { setLog((l) => [...l, ...queue]); setQueue([]); }
  function finishFight() {
    skipRound();
    let guard = 0;
    while (!engine.over && guard++ < 30) {
      const tb = aiTactic(engine.b, engine.a, engine, "b", rng);
      const ta = aiTactic(engine.a, engine.b, engine, "a", rng);
      const sum = playRound(engine, { tactic: ta }, { tactic: tb }, rng);
      setLog((l) => [...l, ...commentate(engine, sum, crng, !hideCards).map((text) => ({ round: sum.round, text }))]);
    }
    force();
  }
  function toggleShout(s: Shout) { setShouts((x) => (x.includes(s) ? x.filter((y) => y !== s) : x.length < 2 ? [...x, s] : x)); }
  function towel() { throwTowel(engine, "a"); setTowelAsk(false); setLog((l) => [...l, { round: engine.round, text: `${a.name.split(" ").slice(-1)[0]}'s corner throws in the towel.` }]); setQueue([]); force(); }

  const finished = engine.over && !busy;
  const scoreLine = engine.scores.map((s) => `${s.a}-${s.b}`).join("  ");
  const A = engine.a, B = engine.b;
  const rd = engine.round;
  const pr = (f: Fighter) => <div className="min-w-0"><div className="display truncate text-xl font-bold leading-tight">{f.name}</div><div className="text-xs text-muted">{flag(f.nationality)} {recordString(f)} · {overall(f.ratings)}</div></div>;

  if (finished && engine.result) {
    return <ResultView a={a} b={b} r={engine.result} onDone={() => { onFinish(engine.result!); }} onRematch={onExit} />;
  }
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
      <Card className="py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {pr(a)}<div className="display text-center text-lg font-bold">R{Math.max(1, rd)}/{rounds}</div><div className="text-right">{pr(b)}</div>
        </div>
        {!hideCards && rd > 0 && <div className="num mt-2 text-center text-xs text-muted">Cards: {scoreLine}</div>}
      </Card>
      <div ref={scroller} className="h-44 shrink-0 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm" aria-live="polite">
        {log.length === 0 && <p className="text-muted">Corners ready. Choose a tactic, then ring the bell.</p>}
        {log.map((l, i) => <p key={i} className={`py-0.5 ${/wins by|knockout|Knockdown|is down|TKO/.test(l.text) ? "font-bold text-accent" : ""}`}>{l.text}</p>)}
      </div>
      <Card className="space-y-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><div className="text-xs font-semibold">{A.fighter.name.split(" ").slice(-1)[0]}</div><Bar label="Health" value={100 - A.damage} tone="bg-good" /><Bar label="Stamina" value={A.stamina} tone="bg-accent" /></div>
          <div className="space-y-1"><div className="text-xs font-semibold">{B.fighter.name.split(" ").slice(-1)[0]}</div><Bar label="Health" value={100 - B.damage} tone="bg-good" /><Bar label="Stamina" value={B.stamina} tone="bg-accent" /></div>
        </div>
        {(A.cut > 0 || A.swelling > 0) && <p className="text-xs text-bad">Your fighter: {A.cut ? `cut ${A.cut}/3 ` : ""}{A.swelling ? `swelling ${A.swelling}/3` : ""}</p>}
        {busy ? (
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => setSpeed(speed === 1 ? 2 : 1)}>{speed}x</Btn>
            <Btn variant="ghost" className="flex-1" onClick={skipRound}>Skip round</Btn>
            <Btn variant="ghost" className="flex-1" onClick={finishFight}>Finish fight</Btn>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Corner tactic</div>
              <div className="grid grid-cols-2 gap-2">
                {TACTICS.map((t) => <button key={t} onClick={() => setTactic(t)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${t === tactic ? "bg-fg text-bg" : "border border-line"}`}>{TACTIC_LABEL[t]}</button>)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">Shout during the round (up to 2). Skill decides how often he listens.</div>
              <div className="flex flex-wrap gap-2">
                {SHOUTS.map(([s, l]) => <button key={s} onClick={() => toggleShout(s)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${shouts.includes(s) ? "bg-accent text-accentfg" : "border border-line"}`}>{l}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setFire(fire === "fire" ? "" : "fire")} className={`min-h-11 rounded-lg text-sm font-semibold ${fire === "fire" ? "bg-accent text-accentfg" : "border border-line"}`}>Fire up</button>
              <button onClick={() => setFire(fire === "calm" ? "" : "calm")} className={`min-h-11 rounded-lg text-sm font-semibold ${fire === "calm" ? "bg-accent text-accentfg" : "border border-line"}`}>Calm down</button>
              <button disabled={cutUsed >= 3 || rd === 0 || (A.cut === 0 && A.swelling === 0)} onClick={() => { cutman(engine, "a"); setCutUsed(cutUsed + 1); force(); }} className="min-h-11 rounded-lg border border-line text-sm font-semibold disabled:opacity-40">Cutman</button>
            </div>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={ring}>{rd === 0 ? "Ring the bell" : `Start round ${rd + 1}`}</Btn>
              {!towelAsk ? <Btn variant="danger" onClick={() => setTowelAsk(true)} disabled={rd === 0}>Towel</Btn> : <Btn variant="danger" onClick={towel}>Confirm towel</Btn>}
            </div>
            <Btn variant="ghost" className="w-full" onClick={onExit}>Leave fight</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
