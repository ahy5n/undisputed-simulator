"use client";
import { flag, overall, recordString } from "@/lib/sim/fighter";
import type { Fighter, Ratings } from "@/lib/sim/types";
import { Avatar, Badge } from "./ui";

const ROWS: [keyof Ratings, string][] = [["power", "Power"], ["speed", "Speed"], ["defence", "Defence"], ["chin", "Chin"], ["stamina", "Stamina"], ["skill", "Skill"]];
const koPct = (f: Fighter) => (f.record.w ? Math.round((100 * f.record.ko) / f.record.w) : 0);

function Corner({ f, side }: { f: Fighter; side: "red" | "blue" }) {
  const right = side === "blue";
  const parts = f.name.split(" ");
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex ${right ? "justify-end" : ""}`}><Avatar f={f} size={56} corner={side} /></div>
      <div className="mt-2 truncate text-xs font-semibold opacity-80">{parts.slice(0, -1).join(" ") || " "}</div>
      <div className="poster truncate text-[1.7rem]">{parts.slice(-1)[0]}</div>
      <div className="num mt-1 text-xs opacity-80">{flag(f.nationality)} {recordString(f)} · {f.record.ko} KO</div>
      <div className={`mt-1 flex flex-wrap gap-1 ${right ? "justify-end" : ""}`}>{f.titles.map((t) => <Badge key={t}>{t}</Badge>)}</div>
    </div>
  );
}

/** Fight poster: both corners under the lights, optional tale of the tape. */
export function FightPoster({ a, b, kicker, footer, tape, year, children }: { a: Fighter; b: Fighter; kicker?: string; footer?: string; tape?: boolean; year?: number; children?: React.ReactNode }) {
  const line = (label: string, x: string | number, y: string | number, hi?: "a" | "b" | null) => (
    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-white/10 py-1.5 text-sm">
      <span className={`num font-semibold ${hi === "a" ? "text-white" : "opacity-70"}`}>{x}</span>
      <span className="label !text-[10px] !text-white/50">{label}</span>
      <span className={`num text-right font-semibold ${hi === "b" ? "text-white" : "opacity-70"}`}>{y}</span>
    </div>
  );
  const cmp = (x: number, y: number) => (x === y ? null : x > y ? "a" : "b");
  return (
    <div className="ring overflow-hidden rounded-xl border border-line">
      <div className="ropes" aria-hidden />
      <div className="p-4">
        {kicker && <div className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{kicker}</div>}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Corner f={a} side="red" />
          <div className="poster px-1 text-2xl text-white/40">VS</div>
          <Corner f={b} side="blue" />
        </div>
        {tape && (
          <div className="mt-4">
            {line("Overall", overall(a.ratings), overall(b.ratings), cmp(overall(a.ratings), overall(b.ratings)))}
            {year !== undefined && line("Age", year - a.born, year - b.born)}
            {line("KO rate", `${koPct(a)}%`, `${koPct(b)}%`, cmp(koPct(a), koPct(b)))}
            {line("Style", a.style, b.style)}
            {ROWS.map(([k, l]) => line(l, a.ratings[k], b.ratings[k], cmp(a.ratings[k], b.ratings[k])))}
          </div>
        )}
        {footer && <div className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{footer}</div>}
        {children}
      </div>
    </div>
  );
}
