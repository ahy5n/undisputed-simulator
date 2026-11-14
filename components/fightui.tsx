"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { commentate } from "@/lib/sim/commentary";
import {
  TACTICS, aiTactic, cutman, initFight, playRound, throwTowel,
  type FightConfig, type FightResult, type PunchStats, type Shout, type Tactic,
} from "@/lib/sim/fight";
import { Rng } from "@/lib/sim/rng";
import { overall, recordString, surname } from "@/lib/sim/fighter";
import type { Fighter } from "@/lib/sim/types";
import { Avatar, Btn, Card } from "./ui";
import { FightPoster } from "./poster";

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
      <thead><tr className="text-xs text-muted"><th className="py-1 text-left font-normal"></th><th className="text-right font-semibold text-fg">{surname(an)}</th><th className="text-right font-semibold text-fg">{surname(bn)}</th></tr></thead>
      <tbody>{rows.map(([k, x, y]) => <tr key={k} className="border-t border-line"><td className="py-2 text-muted">{k}</td><td className="num text-right">{x}</td><td className="num text-right">{y}</td></tr>)}</tbody>
    </table>
  );
}

const lastName = surname;

/** The ring announcer: cards are read one at a time, then the verdict lands. */
export function ResultView({ a, b, r, titles = [], newChamp, onRematch, onDone }: { a: Fighter; b: Fighter; r: FightResult; titles?: string[]; newChamp?: boolean; onRematch?: () => void; onDone: () => void }) {
  const decision = r.method === "UD" || r.method === "SD" || r.method === "MD" || r.method === "Draw";
  const steps = decision ? r.scorecards.length + 2 : 2; // intro, [cards...], verdict
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= steps) return;
    const t = setTimeout(() => setStep((x) => x + 1), step === 0 ? 1100 : 1250);
    return () => clearTimeout(t);
  }, [step, steps]);
  const done = step >= steps - 1;
  const w = r.winner ? (r.winner === "a" ? a : b) : null;
  const winnerSide = r.winner === "a" ? "red" : "blue";
  const how = r.method === "UD" ? "unanimous decision" : r.method === "SD" ? "split decision" : r.method === "MD" ? "majority decision" : r.method === "KO" ? "knockout" : "technical knockout";
  return (
    <div className="space-y-3">
      <div className="ring overflow-hidden rounded-xl border border-line">
        <div className="px-5 py-4 text-center" aria-live="polite">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">{decision ? `After ${r.scheduled} rounds, we go to the scorecards` : `The time: round ${r.round} of ${r.scheduled}`}</div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className={`transition-opacity duration-500 ${done && r.winner === "b" ? "opacity-35" : ""}`}><Avatar f={a} size={52} corner="red" /><div className="display mt-1 truncate text-lg font-bold">{lastName(a.name)}</div></div>
            <div className="poster text-xl text-white/40">VS</div>
            <div className={`transition-opacity duration-500 ${done && r.winner === "a" ? "opacity-35" : ""}`}><Avatar f={b} size={52} corner="blue" /><div className="display mt-1 truncate text-lg font-bold">{lastName(b.name)}</div></div>
          </div>
          {decision && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {r.scorecards.map((c, i) => (
                <div key={i} className="rounded-lg border border-white/15 bg-black/30 p-2">
                  <div className="label !text-white/50">Judge {i + 1}</div>
                  {step > i ? <div className="poster num animate-rise mt-1 text-2xl"><span className={c.a > c.b ? "text-white" : "text-white/50"}>{c.a}</span><span className="text-white/30">–</span><span className={c.b > c.a ? "text-white" : "text-white/50"}>{c.b}</span></div>
                    : <div className="poster mt-1 text-2xl text-white/20">?</div>}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 min-h-[5.5rem]">
            {done ? (
              <div className="animate-stamp inline-block">
                {w ? (
                  <>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{titles.length ? (newChamp ? "And the new" : "And still") : "The winner"}{titles.length ? ` ${titles.join(" · ")} champion` : `, by ${how}`}</div>
                    <div className="poster mt-1 border-y-4 px-3 py-1 text-4xl" style={{ borderColor: winnerSide === "red" ? "var(--red)" : "var(--blue)" }}>{w.name}</div>
                    {titles.length > 0 && <div className="mt-1 text-xs uppercase tracking-wider text-white/60">by {how}</div>}
                  </>
                ) : <div className="poster border-y-4 border-white/60 px-3 py-1 text-4xl">A draw</div>}
              </div>
            ) : <div className="poster pt-6 text-xl text-white/40">{step === 0 ? "Ladies and gentlemen…" : decision ? "…" : "The referee waves it off"}</div>}
          </div>
          {r.controversial && done && <div className="mt-1 text-xs font-semibold text-white/70">The crowd is booing. A controversial verdict.</div>}
          {!done && <button className="mt-2 min-h-11 px-4 text-xs font-semibold text-white/60 underline" onClick={() => setStep(steps)}>Skip to the result</button>}
        </div>
      </div>
      {done && (
        <>
          <Card className="animate-rise">
            <div className="label mb-1">Punch stats · knockdowns {r.knockdowns.a}–{r.knockdowns.b}</div>
            <StatsTable a={r.stats.a} b={r.stats.b} an={a.name} bn={b.name} />
          </Card>
          <div className="flex gap-2">
            {onRematch && <Btn variant="ghost" className="flex-1" onClick={onRematch}>Rematch</Btn>}
            <Btn variant="bell" className="flex-1" onClick={onDone}>Leave the arena</Btn>
          </div>
        </>
      )}
    </div>
  );
}

interface Props { a: Fighter; b: Fighter; rounds: number; extra?: Partial<FightConfig>; titles?: string[]; champIds?: string[]; ranks?: [string, string]; hideCards: boolean; onFinish: (r: FightResult) => void; onExit: () => void }

export function LiveFight({ a, b, rounds, extra, titles, champIds, ranks, hideCards, onFinish, onExit }: Props) {
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
  const [intro, setIntro] = useState(true);
  const [flash, setFlash] = useState(0);
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

  function ring() {
    if (engine.over || busy) return;
    const tb = aiTactic(engine.b, engine.a, engine, "b", rng);
    const sum = playRound(engine, { tactic, shouts, fireUp: fire === "fire", calm: fire === "calm" }, { tactic: tb }, rng);
    const lines = commentate(engine, sum, crng, !hideCards).map((text) => ({ round: sum.round, text }));
    setQueue(lines); setShouts([]); setFire("");
    if (sum.events.some((e) => e.type === "knockdown")) setTimeout(() => setFlash((x) => x + 1), speed === 1 ? 2600 : 1100);
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

  if (finished && engine.result) {
    return <ResultView a={a} b={b} r={engine.result} titles={titles} newChamp={engine.result.winner ? !champIds?.includes(engine.result.winner === "a" ? a.id : b.id) : false} onDone={() => { onFinish(engine.result!); }} />;
  }
  if (intro) {
    return (
      <div className="space-y-3">
        <FightPoster a={a} b={b} tape ranks={ranks} kicker={titles?.length ? `For the ${titles.join(" · ")} world title` : `${rounds} rounds`} footer="Tale of the tape">
          <Btn variant="bell" className="mt-4 w-full !min-h-14 !text-xl" onClick={() => setIntro(false)}>Walk to the ring</Btn>
        </FightPoster>
        <Btn variant="ghost" className="w-full" onClick={onExit}>Back</Btn>
      </div>
    );
  }
  const kdLine = (t: string) => /wins by|knockout|Knockdown|is down|hits the deck|TKO/.test(t);
  return (
    <div className="flex flex-col gap-3">
      <div className="ring overflow-hidden rounded-xl border border-line">
        <div className="px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex min-w-0 items-center gap-2"><Avatar f={a} size={36} corner="red" /><div className="min-w-0"><div className="display truncate text-lg font-bold leading-tight">{lastName(a.name)}</div><div className="num text-[11px] text-white/60">{recordString(a)} · {overall(a.ratings)}</div></div></div>
            <div className="text-center"><div className="label !text-white/50">Round</div><div className="poster num text-3xl">{Math.max(1, rd)}<span className="text-base text-white/40">/{rounds}</span></div></div>
            <div className="flex min-w-0 items-center justify-end gap-2 text-right"><div className="min-w-0"><div className="display truncate text-lg font-bold leading-tight">{lastName(b.name)}</div><div className="num text-[11px] text-white/60">{recordString(b)} · {overall(b.ratings)}</div></div><Avatar f={b} size={36} corner="blue" /></div>
          </div>
          <div className="mt-2 flex justify-center gap-1" aria-hidden>{Array.from({ length: rounds }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < (busy ? rd - 1 : rd) ? "bg-white/80" : i === rd - 1 && busy ? "bg-red" : "bg-white/15"}`} />)}</div>
          {!hideCards && rd > 0 && !busy && <div className="num mt-2 text-center text-[11px] text-white/60">Judges: {scoreLine}</div>}
        </div>
      </div>
      <div key={flash} ref={scroller} className={`h-48 shrink-0 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm ${flash ? "animate-flash" : ""}`} aria-live="polite">
        {log.length === 0 && <p className="text-muted">The fighters are in their corners. Choose a tactic, then ring the bell.</p>}
        {log.map((l, i) => <p key={i} className={`animate-rise py-0.5 ${kdLine(l.text) ? "poster py-1.5 text-xl text-red" : ""}`}>{l.text}</p>)}
      </div>
      <Card className="space-y-3 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><div className="text-xs font-semibold">{surname(A.fighter.name)}</div><Bar label="Health" value={100 - A.damage} tone="bg-red" /><Bar label="Stamina" value={A.stamina} tone="bg-red/50" /></div>
          <div className="space-y-1"><div className="text-xs font-semibold">{surname(B.fighter.name)}</div><Bar label="Health" value={100 - B.damage} tone="bg-blue" /><Bar label="Stamina" value={B.stamina} tone="bg-blue/50" /></div>
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
              <Btn variant="bell" className="flex-1" onClick={ring}>{rd === 0 ? "Ring the bell" : `Start round ${rd + 1}`}</Btn>
              {!towelAsk ? <Btn variant="danger" onClick={() => setTowelAsk(true)} disabled={rd === 0}>Towel</Btn> : <Btn variant="danger" onClick={towel}>Confirm towel</Btn>}
            </div>
            <Btn variant="ghost" className="w-full" onClick={onExit}>Leave fight</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
