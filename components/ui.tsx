"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { flag, overall, recordString } from "@/lib/sim/fighter";
import { hashSeed } from "@/lib/sim/rng";
import { useProfile } from "./profile";
import type { Fighter } from "@/lib/sim/types";

export const money = (n: number) => (n < 0 ? "-" : "") + "£" + Math.abs(Math.round(n)).toLocaleString("en-GB");
export const moneyShort = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  return a >= 1e6 ? `${s}£${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}m` : a >= 1e3 ? `${s}£${Math.round(a / 1e3)}k` : `${s}£${Math.round(a)}`;
};

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</div>;
}
/** Titled panel with a gold poster-type header. */
export function Panel({ title, right, children, className = "", pad = true }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border border-line bg-surface ${className}`}>
      {(title || right) && (
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4">
          <h2 className="poster flex items-center gap-2 text-base"><span className="h-3.5 w-1 bg-red" aria-hidden />{title}</h2>
          {right}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}
export function H({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 mt-1">
      <h1 className="poster text-4xl">{children}</h1>
      <div className="ropes mt-2 w-16" aria-hidden />
      {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  const c = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="label">{label}</div>
      <div className={`display num mt-0.5 text-2xl font-bold ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "bell" };
export function Btn({ variant = "primary", className = "", ...p }: BtnProps) {
  const v = {
    primary: "bg-accent text-accentfg hover:brightness-110",
    bell: "bell poster text-base",
    danger: "border border-bad/60 text-bad",
    ghost: "border border-line bg-surface2 hover:border-fg/40",
  }[variant];
  return <button {...p} className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`} />;
}
/** Belt plate: used for world titles. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="belt">{children}</span>;
}
export function Chip({ children, tone }: { children: ReactNode; tone?: "blue" | "red" | "good" }) {
  const c = tone === "blue" ? "border-blue/60 text-blue" : tone === "red" ? "border-accent/60 text-bad" : tone === "good" ? "border-good/50 text-good" : "border-line text-muted";
  return <span className={`inline-flex items-center rounded-full border bg-surface2 px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

/** Level names used across the game, with the colour of the stripe on the rating plate. */
export function level(ovr: number) {
  if (ovr >= 82) return { name: "World level", stripe: "var(--red)" };
  if (ovr >= 70) return { name: "Contender", stripe: "var(--fg)" };
  if (ovr >= 58) return { name: "Journeyman", stripe: "var(--blue)" };
  return { name: "Novice", stripe: "var(--line)" };
}
/** Rating plate: a scorecard-style number with a level stripe underneath. */
export function OvrBadge({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const t = level(value);
  const s = size === "lg" ? "h-16 w-16 text-4xl" : size === "sm" ? "h-9 w-9 text-lg" : "h-12 w-12 text-2xl";
  return (
    <span className={`poster num relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface2 ${s}`} title={`${value} overall · ${t.name}`}>
      {value}
      <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: t.stripe }} aria-hidden />
    </span>
  );
}

const NATION_HUE: Record<string, number> = { GB: 222, IE: 145, US: 215, MX: 150, PR: 5, JP: 350, PH: 45, KZ: 190, UA: 50, CU: 205, NG: 140, GH: 40, AU: 230, PK: 155, IN: 28, DE: 48, RU: 0, FR: 235 };
/** Fight-card portrait: a squared tile with trunk stripes in the fighter's colours and his initials. Never a photo. */
export function Avatar({ f, size = 48, corner }: { f: Pick<Fighter, "name" | "nationality">; size?: number; corner?: "red" | "blue" }) {
  const hue = corner === "red" ? 357 : corner === "blue" ? 222 : NATION_HUE[f.nationality] ?? hashSeed(f.nationality) % 360;
  const trim = (hue + 40 + (hashSeed(f.name) % 3) * 60) % 360;
  const initials = f.name.split(/\s+/).filter((p) => !/^(jr\.?|sr\.?)$/i.test(p)).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden" aria-hidden style={{ width: size, height: size, background: `hsl(${hue} 58% 34%)` }}>
      <span className="absolute inset-x-0 bottom-0" style={{ height: Math.max(3, size * 0.12), background: `hsl(${trim} 70% 55%)` }} />
      <span className="poster relative text-white" style={{ fontSize: size * 0.44 }}>{initials}</span>
    </span>
  );
}

export function FormDots({ form }: { form: ("W" | "L" | "D")[] }) {
  if (!form.length) return null;
  return (
    <span className="inline-flex gap-0.5 align-middle" title={`Last ${form.length}: ${form.join(" ")}`}>
      {form.map((r, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${r === "W" ? "bg-good" : r === "L" ? "bg-bad" : "bg-muted"}`} />)}
    </span>
  );
}

export function FighterRow({ f, right, onClick }: { f: Fighter; right?: ReactNode; onClick?: () => void }) {
  const ovr = overall(f.ratings);
  const show = useProfile();
  const open = onClick ?? (() => show(f.id));
  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      className="flex min-h-16 w-full cursor-pointer items-center gap-3 border-b border-line px-1 py-2 text-left transition last:border-0 hover:bg-surface2/60">
      <Avatar f={f} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="display truncate text-lg font-semibold leading-tight">{f.name}</span>
          {f.titles.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <div className="truncate text-xs text-muted">
          {flag(f.nationality)} {recordString(f)} ({f.record.ko} KO) · {f.style} <FormDots form={f.form} />
        </div>
      </div>
      {right && <div className="num shrink-0 text-right text-sm" onClick={(e) => e.stopPropagation()}>{right}</div>}
      <OvrBadge value={ovr} size="sm" />
    </div>
  );
}

/** Count-up animation for big numbers. */
export function CountUp({ value, format = money, ms = 800 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="num">{format(v)}</span>;
}

export function Modal({ onClose, title, children }: { onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 md:items-center md:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="animate-rise max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {title && <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between border-b border-line bg-surface px-4"><h3 className="poster text-xl">{title}</h3><button onClick={onClose} className="h-11 w-11 text-muted" aria-label="Close">✕</button></div>}
        <div className="p-4 pb-8">{children}</div>
      </div>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}
