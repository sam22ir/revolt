import { BASE_EDGE_MARGIN, BASE_MOUNTAIN_CLEARANCE, MAP_SIZE } from "./data/map.ts";
import { isOnMap, terrainAt } from "./terrain.ts";

/** Whether a base or alliance HQ may stand on (x, y): on the map, clear of its edges and of every mountain. */
export const baseSiteOk = (seed: number, x: number, y: number): boolean => {
  if (!isOnMap(x, y)) return false;
  if (Math.min(x, y, MAP_SIZE - 1 - x, MAP_SIZE - 1 - y) < BASE_EDGE_MARGIN) return false;
  for (let dy = -BASE_MOUNTAIN_CLEARANCE; dy <= BASE_MOUNTAIN_CLEARANCE; dy++) {
    for (let dx = -BASE_MOUNTAIN_CLEARANCE; dx <= BASE_MOUNTAIN_CLEARANCE; dx++) {
      if (terrainAt(seed, x + dx, y + dy) === "mountain") return false;
    }
  }
  return true;
};
