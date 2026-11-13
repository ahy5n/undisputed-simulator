// Reports fighters per division, average ratings and empty belts. Run: node scripts/check-data.mjs
import fs from "node:fs";
const f = JSON.parse(fs.readFileSync("data/fighters.json", "utf8"));
const belts = JSON.parse(fs.readFileSync("data/belts.json", "utf8"));
const divs = ["heavyweight","light-heavyweight","middleweight","welterweight","lightweight","featherweight","bantamweight","flyweight"];
console.log("division".padEnd(18), "n".padStart(4), "avg ovr".padStart(8), "top ovr".padStart(8), "est.rec".padStart(8));
for (const d of divs) {
  const xs = f.filter((x) => x.division === d);
  const ov = xs.map((x) => Object.values(x.ratings).reduce((a, b) => a + b, 0) / 6);
  const avg = ov.length ? ov.reduce((a, b) => a + b, 0) / ov.length : 0;
  console.log(d.padEnd(18), String(xs.length).padStart(4), avg.toFixed(1).padStart(8), Math.max(...ov, 0).toFixed(1).padStart(8), String(xs.filter((x) => x.recordEstimated).length).padStart(8));
}
console.log("total real fighters:", f.length, "(target 500)");
const ids = new Set(f.map((x) => x.id));
const empty = [];
for (const [d, hold] of Object.entries(belts.world)) for (const [b, id] of Object.entries(hold)) {
  if (!id) empty.push(`${b} ${d}: VACANT`); else if (!ids.has(id)) empty.push(`${b} ${d}: ${id} not in fighters.json`);
}
console.log(empty.length ? "Belt issues:\n  " + empty.join("\n  ") : "All world belts held by known fighters.");
