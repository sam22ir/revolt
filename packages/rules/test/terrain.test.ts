import { describe, expect, test } from "vitest";
import { isOnMap, MAP_SIZE, parseTroops, TERRAIN_IDS, terrainAt, ZERO_TROOPS } from "../src/index.ts";

describe("terrainAt", () => {
  test("is a pure function of seed and tile, and uses every terrain", () => {
    const seen = new Set<string>();
    for (let x = 0; x < MAP_SIZE; x++) for (let y = 0; y < MAP_SIZE; y++) {
      const v = terrainAt(7, x, y);
      expect(terrainAt(7, x, y)).toBe(v);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([...TERRAIN_IDS].sort());
  });

  test("isOnMap accepts whole tiles inside the map only", () => {
    expect(isOnMap(0, 0)).toBe(true);
    expect(isOnMap(MAP_SIZE - 1, MAP_SIZE - 1)).toBe(true);
    for (const [x, y] of [[-1, 0], [0, MAP_SIZE], [1.5, 2], [Number.NaN, 1]] as const) expect(isOnMap(x, y)).toBe(false);
  });
});

describe("parseTroops", () => {
  test("fills missing types with zero", () => {
    expect(parseTroops({ infantry: 3 })).toEqual({ ...ZERO_TROOPS, infantry: 3 });
    expect(parseTroops({})).toEqual(ZERO_TROOPS);
  });

  test("rejects negative, fractional, huge, non-numeric and unknown entries", () => {
    for (const bad of [{ infantry: -1 }, { infantry: 0.5 }, { infantry: 1e7 }, { infantry: "5" }, { cavalry: 1 }, JSON.parse('{"__proto__": 1}'), [1], null, 5]) {
      expect(parseTroops(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
