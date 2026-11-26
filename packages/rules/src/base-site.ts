import { BASE_EDGE_MARGIN, BASE_MOUNTAIN_CLEARANCE, MAP_SIZE } from "./data/map.ts";
import { terrainAt } from "./terrain.ts";

/** Whether a base or alliance HQ may stand on (x, y) of a map `size` tiles wide: on it, clear of its edges and of every mountain. */
export const baseSiteOk = (seed: number, x: number, y: number, size: number = MAP_SIZE): boolean => {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return false;
  if (Math.min(x, y, size - 1 - x, size - 1 - y) < BASE_EDGE_MARGIN) return false;
  for (let dy = -BASE_MOUNTAIN_CLEARANCE; dy <= BASE_MOUNTAIN_CLEARANCE; dy++) {
    for (let dx = -BASE_MOUNTAIN_CLEARANCE; dx <= BASE_MOUNTAIN_CLEARANCE; dx++) {
      if (terrainAt(seed, x + dx, y + dy) === "mountain") return false;
    }
  }
  return true;
};
