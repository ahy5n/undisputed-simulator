"use client";
import { useGame } from "@/lib/game/store";
import { dateForWeek, fmtDate } from "@/lib/sim/calendar";
import type { Story } from "@/lib/sim/news";
import { Btn, money } from "./ui";

const KICKER: Record<Story["kind"], string> = { title: "World title", upset: "Upset", ko: "Knockout", result: "Result", yours: "Your stable" };

/** The back page: what the boxing world did while the calendar moved. */
export function FightReport({ goFights }: { goFights: () => void }) {
  const { game, report, dismissReport } = useGame();
  if (!game || !report) return null;
  const net = report.cashEnd - report.cashStart;
  const [lead, ...rest] = report.stories;
  const weeks = report.toWeek - report.fromWeek;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="Fight report" onClick={dismissReport}>
      <div className="newsprint animate-rise max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-xl md:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4">
          <div className="rule flex items-end justify-between border-b-4 pb-1">
            <div className="poster text-3xl">The Ring Report</div>
            <div className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">{fmtDate(dateForWeek(game.startDate, report.toWeek))}<br />{weeks > 1 ? `${weeks} weeks` : "This week"} · {report.fights} fights</div>
          </div>
        </div>
        <div className="px-4 py-3">
          {lead ? (
            <div className="lead -mx-4 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-red">{KICKER[lead.kind]}</div>
              <h2 className="poster mt-1 text-[2rem] leading-[1.02]">{lead.headline}</h2>
              <p className="mt-1.5 text-sm">{lead.detail}</p>
              {lead.quote && <p className="mt-2 border-l-4 border-[#17181c] pl-2 text-sm italic">“{lead.quote.text}” <span className="not-italic font-semibold">{lead.quote.who}</span></p>}
            </div>
          ) : <p className="py-6 text-center text-sm">A quiet week. No fights anywhere worth the ink.</p>}
          {rest.length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-x-4">
              {rest.map((s) => (
                <div key={s.id} className="rule border-t py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-red">{KICKER[s.kind]}</div>
                  <div className="display text-lg font-bold leading-tight">{s.headline}</div>
                  <div className="text-xs opacity-80">{s.detail}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rule mt-1 border-t-2 pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Your books</span>
              <span className="num text-sm"><span className="font-bold">{money(report.cashEnd)}</span> <span className={net >= 0 ? "text-[#137a43]" : "text-red"}>({net >= 0 ? "+" : ""}{money(net)})</span></span>
            </div>
            {report.notes.map((n, i) => <div key={i} className="mt-1 text-sm">▸ {n}</div>)}
          </div>
        </div>
        <div className="sticky bottom-0 flex gap-2 bg-[#ece7da] px-4 pb-6 pt-2">
          <Btn className="flex-1 !border-[#17181c] !bg-transparent !text-[#17181c]" variant="ghost" onClick={() => { dismissReport(); goFights(); }}>Open fights</Btn>
          <Btn variant="bell" className="flex-1" onClick={dismissReport}>Carry on</Btn>
        </div>
      </div>
    </div>
  );
}
