"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useGame } from "@/lib/game/store";
import { gameYear } from "@/lib/sim/calendar";
import { ageAt, flag, overall, recordString, stars } from "@/lib/sim/fighter";
import { DIVISION_LABEL, type Ratings } from "@/lib/sim/types";
import { Badge, Btn } from "./ui";

const Ctx = createContext<(id: string) => void>(() => {});
export const useProfile = () => useContext(Ctx);

const LABELS: [keyof Ratings, string][] = [["power", "Power"], ["speed", "Speed"], ["defence", "Defence"], ["chin", "Chin"], ["stamina", "Stamina"], ["skill", "Skill"]];

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return (
    <Ctx.Provider value={setId}>
      {children}
      {id && <Sheet id={id} close={() => setId(null)} />}
    </Ctx.Provider>
  );
}

function Sheet({ id, close }: { id: string; close: () => void }) {
  const { game } = useGame();
  const f = game?.world.fighters[id];
  if (!game || !f) return null;
  const year = gameYear(game.startDate, game.week);
  const age = ageAt(f, year);
  const st = stars(f, year);
  const mine = f.promoter === "player";
  const promoter = game.world.promoters.find((p) => p.id === f.promoter)?.name ?? (mine ? game.company.name : "Free agent");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:items-center" onClick={close} role="dialog" aria-modal="true" aria-label={f.name}>
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-8 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="display text-3xl font-bold leading-none">{f.name}</h2>
              {f.titles.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
            <p className="mt-1 text-sm text-muted">{flag(f.nationality)} {DIVISION_LABEL[f.division]} · {f.style} · {age}y{st ? ` · ${"★".repeat(st)}${"☆".repeat(5 - st)}` : ""}</p>
          </div>
          <div className="display num text-5xl font-bold leading-none">{overall(f.ratings)}</div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[["Record", recordString(f) + (f.recordEstimated ? "*" : "")], ["KOs", String(f.record.ko)], ["Popularity", String(f.popularity)]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface2 p-2"><div className="text-[11px] text-muted">{k}</div><div className="display num text-xl font-bold">{v}</div></div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {LABELS.map(([k, l]) => (
            <div key={k} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-muted">{l}</span>
              <div className="h-2 flex-1 rounded bg-surface2"><div className="h-full rounded bg-accent" style={{ width: `${f.ratings[k]}%` }} /></div>
              <span className="num w-7 text-right font-semibold">{f.ratings[k]}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">Promoter: <span className="text-fg">{promoter}</span> · Morale {f.morale}{f.injuredWeeks ? ` · Injured ${f.injuredWeeks}w` : ""}</p>
        {f.recordEstimated && <p className="mt-1 text-xs text-muted">*Record is an estimate; real data unavailable.</p>}
        <Btn variant="ghost" className="mt-4 w-full" onClick={close}>Close</Btn>
      </div>
    </div>
  );
}
