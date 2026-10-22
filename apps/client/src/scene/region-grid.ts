import { regionGrid, type RegionId } from "@revolt/rules";

let cached: { key: string; grid: readonly RegionId[] } | null = null;

/** The region of every tile, row-major. Built once per seed and size, and shared by the map layer and the minimap. */
export const regionGridFor = (seed: number, size: number): readonly RegionId[] => {
  const key = `${seed}|${size}`;
  if (cached === null || cached.key !== key) cached = { key, grid: regionGrid(seed, size) };
  return cached.grid;
};
