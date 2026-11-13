import { describe, expect, it } from "vitest";
import { Rng } from "@/lib/sim/rng";
import { createWorld } from "@/lib/sim/worldgen";
import { computeRankings, RANK_SIZE } from "@/lib/sim/rankings";
import { rollSeason } from "@/lib/sim/season";
import { overall } from "@/lib/sim/fighter";
import { DIVISIONS, WORLD_BODIES } from "@/lib/sim/types";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.next(), a.int(1, 99)]).toEqual([b.next(), b.next(), b.int(1, 99)]);
  });
});

describe("world generation", () => {
  const { world } = createWorld(12345);
  it("is reproducible", () => {
    const again = createWorld(12345).world;
    expect(Object.keys(again.fighters).length).toBe(Object.keys(world.fighters).length);
    expect(again.fighters["gen-5"].name).toBe(world.fighters["gen-5"].name);
  });
  it("fills every division to ~120 pros and adds ~300 prospects", () => {
    for (const d of DIVISIONS) {
      const n = Object.values(world.fighters).filter((f) => f.division === d && f.pro).length;
      expect(n).toBeGreaterThanOrEqual(120);
    }
    expect(Object.values(world.fighters).filter((f) => !f.pro).length).toBeGreaterThan(150);
  });
  it("every belt holder exists and sits in the belt's division", () => {
    for (const d of DIVISIONS) for (const b of WORLD_BODIES) {
      const id = world.belts[d][b];
      if (id) expect(world.fighters[id]?.division).toBe(d);
    }
  });
});

describe("rankings", () => {
  const { world } = createWorld(777);
  const r = computeRankings(world);
  it("has 15 unique ranked fighters per body and division, excluding that body's champion", () => {
    for (const d of DIVISIONS) for (const b of WORLD_BODIES) {
      const list = r[d][b];
      expect(list.length).toBe(RANK_SIZE);
      expect(new Set(list).size).toBe(RANK_SIZE);
      expect(list).not.toContain(world.belts[d][b]);
    }
  });
});

describe("20 season simulation", () => {
  it("keeps divisions deep, ratings sane and fighters ageing", () => {
    let { world } = createWorld(2026);
    const rng = new Rng(99);
    const avg0 = Object.values(world.fighters).filter((f) => f.pro).map((f) => overall(f.ratings));
    for (let y = 2027; y <= 2046; y++) {
      world = rollSeason(world, rng, y).world;
      for (const d of DIVISIONS) {
        const n = Object.values(world.fighters).filter((f) => f.division === d && f.pro && !f.retired).length;
        expect(n).toBeGreaterThanOrEqual(120);
      }
    }
    const active = Object.values(world.fighters).filter((f) => f.pro && !f.retired);
    const mean = active.map((f) => overall(f.ratings)).reduce((a, b) => a + b, 0) / active.length;
    const mean0 = avg0.reduce((a, b) => a + b, 0) / avg0.length;
    expect(Math.abs(mean - mean0)).toBeLessThan(8); // no runaway inflation/deflation
    expect(Math.max(...active.map((f) => overall(f.ratings)))).toBeLessThanOrEqual(100);
    expect(active.every((f) => 2046 - f.born < 46)).toBe(true);
    expect(Object.values(world.fighters).filter((f) => !f.pro && !f.retired).length).toBeGreaterThan(100);
  });
});

describe("data integrity", () => {
  it("every fighter's promoter id exists", () => {
    const { world } = createWorld(1);
    const ids = new Set([...world.promoters.map((p) => p.id), "independent"]);
    for (const f of Object.values(world.fighters)) expect(ids.has(f.promoter), `${f.name}: ${f.promoter}`).toBe(true);
  });
  it("real independents are free agents in the market pool", () => {
    const { world } = createWorld(1);
    expect(world.fighters["tyson-fury"].promoter).toBe("queensberry");
    expect(world.fighters["dillian-whyte"].promoter).toBe("independent");
  });
});
