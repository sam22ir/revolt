import { test } from "vitest";
import { isOnMap, MAP_SIZE, parseTroops, TERRAIN_IDS, terrainAt, ZERO_TROOPS } from "../src/index.ts";
import { ex } from "./helpers.ts";

test("terrain and map bounds: pure terrainAt using every terrain, isOnMap", () => {
  {
    const e = ex("is a pure function of seed and tile, and uses every terrain");
    const seen = new Set<string>();
    for (let x = 0; x < MAP_SIZE; x++)
      for (let y = 0; y < MAP_SIZE; y++) {
        const v = terrainAt(7, x, y);
        e(terrainAt(7, x, y), `tile ${x},${y}`).toBe(v);
        seen.add(v);
      }
    e([...seen].sort(), "all terrains used").toEqual([...TERRAIN_IDS].sort());
  }

  {
    const e = ex("isOnMap accepts whole tiles inside the map only");
    e(isOnMap(0, 0), "origin").toBe(true);
    e(isOnMap(MAP_SIZE - 1, MAP_SIZE - 1), "far corner").toBe(true);
    for (const [x, y] of [[-1, 0], [0, MAP_SIZE], [1.5, 2], [Number.NaN, 1]] as const) e(isOnMap(x, y), `${x},${y}`).toBe(false);
  }
});

test("parseTroops: fills missing types, rejects malformed", () => {
  {
    const e = ex("fills missing types with zero");
    e(parseTroops({ infantry: 3 }), "partial").toEqual({ ...ZERO_TROOPS, infantry: 3 });
    e(parseTroops({}), "empty").toEqual(ZERO_TROOPS);
  }

  {
    const e = ex("rejects negative, fractional, huge, non-numeric and unknown entries");
    for (const bad of [{ infantry: -1 }, { infantry: 0.5 }, { infantry: 1e7 }, { infantry: "5" }, { cavalry: 1 }, JSON.parse('{"__proto__": 1}'), [1], null, 5]) {
      e(parseTroops(bad), JSON.stringify(bad)).toBeNull();
    }
  }
});
