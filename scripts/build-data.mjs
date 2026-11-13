// Compiles data/source/*.txt into data/fighters.json. Run: node scripts/build-data.mjs
import fs from "node:fs";
import path from "node:path";

const SRC = "data/source";
const DIV = {
  heavyweight: "heavyweight", "light-heavyweight": "light-heavyweight", middleweight: "middleweight",
  welterweight: "welterweight", lightweight: "lightweight", featherweight: "featherweight",
  bantamweight: "bantamweight", flyweight: "flyweight",
};
const STYLE = {
  boxer: { speed: 4, skill: 6, defence: 4, power: -6, chin: 0, stamina: 0 },
  puncher: { power: 8, chin: 2, speed: -2, defence: -4, skill: -2, stamina: -4 },
  swarmer: { stamina: 8, speed: 2, defence: -6, power: 0, chin: 2, skill: -2 },
  "counter-puncher": { defence: 6, skill: 5, speed: 3, power: -2, stamina: -5, chin: 0 },
  "boxer-puncher": { power: 3, skill: 2, speed: 0, defence: 0, chin: 0, stamina: 0 },
  brawler: { power: 5, chin: 5, defence: -8, skill: -6, stamina: 2, speed: -2 },
};
const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)));
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const jitter = (s, k) => ((hash(s + k) % 9) - 4); // -4..+4, deterministic

const belts = JSON.parse(fs.readFileSync("data/belts.json", "utf8")).world;
const heldBy = {};
for (const hold of Object.values(belts)) for (const [b, id] of Object.entries(hold)) if (id) (heldBy[id] ??= []).push(b);
const fighters = [];
const seen = new Set();
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith(".txt"))) {
  const division = DIV[path.basename(file, ".txt")];
  if (!division) throw new Error("unknown division file " + file);
  for (const raw of fs.readFileSync(path.join(SRC, file), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, nat, born, rec, titles, promoter, style, ovr, pop] = line.split("|");
    const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (seen.has(id)) { console.warn("duplicate skipped:", name); continue; }
    seen.add(id);
    const o = Number(ovr);
    let record, recordEstimated = false;
    if (rec === "?") {
      const fights = Math.round(14 + (o - 60) * 0.5);
      const w = Math.round(fights * 0.9), d = 0, l = fights - w;
      record = { w, l, d, ko: Math.round(w * 0.55) }; recordEstimated = true;
    } else { const [w, l, d, ko] = rec.split("-").map(Number); record = { w, l, d, ko }; }
    const koRate = record.w ? record.ko / record.w : 0.5;
    const prof = STYLE[style];
    if (!prof) throw new Error("bad style " + style + " for " + name);
    const ratings = {};
    for (const k of Object.keys(prof)) {
      let v = o + prof[k] + jitter(id, k);
      if (k === "power") v += (koRate - 0.55) * 20;
      ratings[k] = clamp(v);
    }
    fighters.push({
      id, name, nationality: nat, born, division, record,
      titles: heldBy[id] ?? [], promoter, style, ratings,
      popularity: Number(pop), real: true, ...(recordEstimated ? { recordEstimated: true } : {}),
    });
  }
}
fs.writeFileSync("data/fighters.json", JSON.stringify(fighters, null, 1));
console.log(`wrote ${fighters.length} real fighters`);
