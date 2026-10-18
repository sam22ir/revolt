import { MAP_SIZE } from "./data/map.ts";
import { hash32 } from "./rng.ts";

export const TERRAIN_IDS = ["plain", "hills", "forest", "mountain"] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

/** Smooth-ish value noise: hashed lattice every `cell` tiles, bilinearly blended. */
const noise = (seed: number, x: number, y: number, cell: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x - gx * cell) / cell;
  const fy = (y - gy * cell) / cell;
  const v = (i: number, j: number): number => hash32(seed, gx + i, gy + j) / 0xffffffff;
  const top = v(0, 0) * (1 - fx) + v(1, 0) * fx;
  const bottom = v(0, 1) * (1 - fx) + v(1, 1) * fx;
  return top * (1 - fy) + bottom * fy;
};

/** Terrain of a tile: a pure function of the map seed, so it is never stored or sent. Cosmetic in M3. */
export const terrainAt = (seed: number, x: number, y: number): TerrainId => {
  const h = 0.65 * noise(seed, x, y, 8) + 0.35 * noise(seed + 1, x, y, 3);
  if (h > 0.72) return "mountain";
  if (h > 0.58) return "hills";
  if (h < 0.3) return "forest";
  return "plain";
};

export const isOnMap = (x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
