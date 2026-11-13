"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { listGames, loadGame, saveGame } from "@/lib/save/db";
import { advanceWeek } from "@/lib/sim/game";
import type { GameSave } from "@/lib/sim/types";

interface Ctx {
  game: GameSave | null;
  ready: boolean;
  saves: { id: string; name: string; week: number; createdAt: string }[];
  update: (fn: (g: GameSave) => GameSave) => void;
  start: (g: GameSave) => Promise<void>;
  open: (id: string) => Promise<void>;
  nextWeek: () => void;
  refreshSaves: () => Promise<void>;
  closeGame: () => void;
}
const GameCtx = createContext<Ctx | null>(null);
export const useGame = () => {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame outside provider");
  return c;
};
const LAST = "um:last-save";

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameSave | null>(null);
  const [ready, setReady] = useState(false);
  const [saves, setSaves] = useState<Ctx["saves"]>([]);
  const latest = useRef<GameSave | null>(null);
  const dirty = useRef(false);

  const refreshSaves = useCallback(async () => { try { setSaves(await listGames()); } catch { setSaves([]); } }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshSaves();
        const id = localStorage.getItem(LAST);
        if (id) { const g = await loadGame(id); if (g) setGame({ ...g, negotiations: g.negotiations ?? [], company: { ...g.company, reputation: g.company.reputation ?? 30 } }); }
      } catch { /* storage unavailable: start screen still works */ }
      setReady(true);
    })();
  }, [refreshSaves]);

  // Autosave on every change. Writes are coalesced: one in flight, the newest state queued behind it.
  const saving = useRef(false);
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (dirty.current && latest.current) {
        dirty.current = false;
        try { await saveGame(latest.current); } catch { /* storage full/blocked: keep playing, export still works */ }
      }
    } finally { saving.current = false; }
  }, []);
  useEffect(() => {
    if (!game) return;
    latest.current = game; dirty.current = true;
    flush();
  }, [game, flush]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVis); };
  }, [flush]);

  const update = useCallback((fn: (g: GameSave) => GameSave) => setGame((g) => (g ? fn(g) : g)), []);
  const start = useCallback(async (g: GameSave) => {
    await saveGame(g);
    try { localStorage.setItem(LAST, g.id); } catch {}
    setGame(g); await refreshSaves();
  }, [refreshSaves]);
  const open = useCallback(async (id: string) => {
    const g0 = await loadGame(id);
    const g = g0 && { ...g0, negotiations: g0.negotiations ?? [], company: { ...g0.company, reputation: g0.company.reputation ?? 30 } };
    if (g) { try { localStorage.setItem(LAST, id); } catch {} setGame(g); }
  }, []);
  const nextWeek = useCallback(() => setGame((g) => (g ? advanceWeek(g) : g)), []);
  const closeGame = useCallback(() => { try { localStorage.removeItem(LAST); } catch {} setGame(null); refreshSaves(); }, [refreshSaves]);

  return <GameCtx.Provider value={{ game, ready, saves, update, start, open, nextWeek, refreshSaves, closeGame }}>{children}</GameCtx.Provider>;
}
