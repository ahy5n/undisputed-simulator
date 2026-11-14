"use client";
import { useRef, useState } from "react";
import { useGame } from "@/lib/game/store";
import { newGame } from "@/lib/sim/game";
import { importSave } from "@/lib/save/db";
import { Btn, Card, money } from "./ui";

const COUNTRIES: [string, string][] = [["GB", "United Kingdom"], ["IE", "Ireland"], ["US", "United States"], ["MX", "Mexico"], ["AU", "Australia"], ["JP", "Japan"], ["DE", "Germany"], ["PH", "Philippines"]];
const COLOURS = ["#c8102e", "#0b5fff", "#0a8f4e", "#f2a900", "#6a2bd9", "#111111"];

function Swatches({ value, set, label }: { value: string; set: (v: string) => void; label: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{label}</div>
      <div className="flex gap-2">
        {COLOURS.map((c) => (
          <button key={c} aria-label={`${label} ${c}`} onClick={() => set(c)} style={{ background: c }}
            className={`h-11 w-11 rounded-full border-2 ${value === c ? "border-fg" : "border-transparent"}`} />
        ))}
      </div>
    </div>
  );
}

export default function NewGame() {
  const { saves, open, start, refreshSaves } = useGame();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("GB");
  const [primary, setPrimary] = useState(COLOURS[0]);
  const [secondary, setSecondary] = useState(COLOURS[5]);
  const [cash, setCash] = useState(3_000_000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function create() {
    setBusy(true); setErr("");
    // let the spinner paint before the ~1,400-fighter world is generated
    await new Promise((r) => setTimeout(r, 30));
    try { await start(newGame({ companyName: name, country, primary, secondary, startingCash: cash })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not create save"); }
    setBusy(false);
  }
  async function doImport(f: File | undefined) {
    if (!f) return;
    try { const g = await importSave(f); await refreshSaves(); await open(g.id); } catch (e) { setErr(e instanceof Error ? e.message : "Import failed"); }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="ring -mx-4 -mt-8 overflow-hidden px-4 pb-6 pt-10">
        <div className="label !text-white/60">Manager · Promoter · Matchmaker</div>
        <h1 className="poster mt-2 text-6xl">Undisputed<br /><span className="text-red">Manager</span></h1>
        <p className="mt-3 max-w-xs text-sm text-white/75">Sign fighters. Make fights. Sell out stadiums. Unify the belts before the money runs out.</p>
      </div>
      <div className="ropes -mx-4" aria-hidden />

      {saves.length > 0 && (
        <Card className="mt-6">
          <div className="mb-2 text-sm font-semibold">Continue</div>
          {saves.map((s) => (
            <button key={s.id} onClick={() => open(s.id)} className="flex min-h-12 w-full items-center justify-between border-b border-line text-left last:border-0">
              <span className="font-semibold">{s.name}</span><span className="text-sm text-muted num">Week {s.week}</span>
            </button>
          ))}
        </Card>
      )}

      <Card className="mt-4 space-y-4">
        <div className="text-sm font-semibold">New save</div>
        <label className="block">
          <span className="text-xs font-semibold text-muted">Company name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ironside Boxing"
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted">Home country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3">
            {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <Swatches value={primary} set={setPrimary} label="Poster colour" />
        <Swatches value={secondary} set={setSecondary} label="Trim colour" />
        <label className="block">
          <span className="text-xs font-semibold text-muted">Starting cash: <span className="num text-fg">{money(cash)}</span></span>
          <input type="range" min={500_000} max={10_000_000} step={250_000} value={cash} onChange={(e) => setCash(Number(e.target.value))} className="mt-2 w-full" />
        </label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <Btn variant="bell" onClick={create} disabled={busy} className="w-full !min-h-14 !text-lg">{busy ? "Building the boxing world…" : "Start career"}</Btn>
      </Card>

      <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
      <Btn variant="ghost" className="mt-4 w-full" onClick={() => fileRef.current?.click()}>Import save file</Btn>
    </main>
  );
}
