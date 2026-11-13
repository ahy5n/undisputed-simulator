import type { GameSave } from "@/lib/sim/types";

const DB = "undisputed-manager";
const STORE = "saves";
export const SAVE_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(r.result); };
        t.onerror = () => { db.close(); reject(t.error); };
        t.onabort = () => { db.close(); reject(t.error); };
      }),
  );
}
export const saveGame = (g: GameSave) => tx("readwrite", (s) => s.put(g)).then(() => undefined);
export const loadGame = (id: string) => tx<GameSave | undefined>("readonly", (s) => s.get(id));
export const deleteGame = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => undefined);
export const listGames = async (): Promise<{ id: string; name: string; week: number; createdAt: string }[]> => {
  const all = await tx<GameSave[]>("readonly", (s) => s.getAll());
  return all
    .map((g) => ({ id: g.id, name: g.company.name, week: g.week, createdAt: g.createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export function exportSave(g: GameSave): void {
  const blob = new Blob([JSON.stringify(g)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${g.company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-week-${g.week}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
export async function importSave(file: File): Promise<GameSave> {
  const g = JSON.parse(await file.text()) as GameSave;
  if (!g.world || !g.company || typeof g.seed !== "number") throw new Error("Not an Undisputed Manager save file");
  if (g.version > SAVE_VERSION) throw new Error("Save is from a newer version of the game");
  await saveGame(g);
  return g;
}
