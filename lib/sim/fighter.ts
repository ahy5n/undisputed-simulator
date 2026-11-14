import type { Fighter, Ratings } from "./types";

const W: Record<keyof Ratings, number> = { power: 0.2, speed: 0.15, defence: 0.15, chin: 0.15, stamina: 0.15, skill: 0.2 };

export function overall(r: Ratings): number {
  let s = 0;
  for (const k of Object.keys(W) as (keyof Ratings)[]) s += r[k] * W[k];
  return Math.round(s);
}
export function ageAt(f: Pick<Fighter, "born">, year: number): number { return year - f.born; }
export function recordString(f: Fighter): string {
  const { w, l, d } = f.record;
  return `${w}-${l}${d ? `-${d}` : ""}`;
}
export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🏳";
  const c = code === "UK" ? "GB" : code;
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
export function stars(f: Fighter, year: number): number | null {
  return ageAt(f, year) < 25 ? f.potential : null;
}

/** Surname for headlines and commentary; "Vergil Ortiz Jr." reads as "Ortiz". */
export function surname(name: string): string {
  const parts = name.split(/\s+/).filter((x) => !/^(jr|sr|ii|iii)\.?$/i.test(x));
  return parts[parts.length - 1] ?? name;
}
