"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { flag, overall, recordString } from "@/lib/sim/fighter";
import { useProfile } from "./profile";
import type { Fighter } from "@/lib/sim/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</div>;
}
export function H({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 mt-1">
      <h1 className="display text-3xl font-bold leading-none">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };
export function Btn({ variant = "primary", className = "", ...p }: BtnProps) {
  const v = variant === "primary" ? "bg-accent text-accentfg" : variant === "danger" ? "border border-bad text-bad" : "border border-line bg-surface";
  return <button {...p} className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-40 ${v} ${className}`} />;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-accentfg">{children}</span>;
}
export const money = (n: number) => (n < 0 ? "-" : "") + "£" + Math.abs(Math.round(n)).toLocaleString("en-GB");

export function FighterRow({ f, right, onClick }: { f: Fighter; right?: ReactNode; onClick?: () => void }) {
  const ovr = overall(f.ratings);
  const show = useProfile();
  const open = onClick ?? (() => show(f.id));
  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-line py-2 text-left last:border-0">
      <div className="display w-10 shrink-0 text-center text-2xl font-bold num">{ovr}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="display truncate text-lg font-semibold leading-tight">{f.name}</span>
          {f.titles.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <div className="truncate text-xs text-muted">
          {flag(f.nationality)} {recordString(f)} ({f.record.ko} KO) · {f.style}
        </div>
      </div>
      {right && <div className="shrink-0 text-right text-sm num" onClick={(e) => e.stopPropagation()}>{right}</div>}
    </div>
  );
}
