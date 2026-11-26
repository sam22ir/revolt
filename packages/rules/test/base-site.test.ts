import { test } from "vitest";
import { BASE_EDGE_MARGIN, BASE_MOUNTAIN_CLEARANCE, baseSiteOk, MAP_SIZE, terrainAt, ZONE_CLEARANCE, zoneAt } from "../src/index.ts";
import { ex } from "./helpers.ts";

const nearMountain = (seed: number, x: number, y: number): boolean => {
  for (let dy = -BASE_MOUNTAIN_CLEARANCE; dy <= BASE_MOUNTAIN_CLEARANCE; dy++)
    for (let dx = -BASE_MOUNTAIN_CLEARANCE; dx <= BASE_MOUNTAIN_CLEARANCE; dx++) if (terrainAt(seed, x + dx, y + dy) === "mountain") return true;
  return false;
};

test("baseSiteOk: off the edges, clear of mountains and of contested zones", { timeout: 30_000 }, () => {
  for (const seed of [1954, 12345]) {
    const e = ex(`seed ${seed}`);
    let ok = 0;
    for (let x = 0; x < MAP_SIZE; x++)
      for (let y = 0; y < MAP_SIZE; y++) {
        const edge = Math.min(x, y, MAP_SIZE - 1 - x, MAP_SIZE - 1 - y) < BASE_EDGE_MARGIN;
        e(baseSiteOk(seed, x, y), `tile ${x},${y}`).toBe(!edge && !nearMountain(seed, x, y) && zoneAt(seed, x, y, MAP_SIZE, ZONE_CLEARANCE) === null);
        if (baseSiteOk(seed, x, y)) ok++;
      }
    e(ok, "most of the map stays open").toBeGreaterThan(MAP_SIZE * MAP_SIZE * 0.4);
  }
  const e = ex("corners, edges and off the map");
  for (const [x, y] of [[0, 0], [MAP_SIZE - 1, 0], [0, MAP_SIZE - 1], [MAP_SIZE - 1, MAP_SIZE - 1], [BASE_EDGE_MARGIN - 1, 30], [30, MAP_SIZE - BASE_EDGE_MARGIN], [-1, 5], [MAP_SIZE, 5], [3.5, 5]] as const)
    e(baseSiteOk(1954, x, y), `${x},${y}`).toBe(false);
});
