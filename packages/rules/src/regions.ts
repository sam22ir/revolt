import { MAP_SIZE, REGION_CELL } from "./data/map.ts";
import { hash32 } from "./rng.ts";

/** A region id: `cellRow * cellsPerSide + cellColumn`. A small non-negative integer, stable for a seed and size. */
export type RegionId = number;

export interface Region {
  readonly id: RegionId;
  readonly site: { readonly x: number; readonly y: number };
  /** Number of map tiles this region owns. */
  readonly tiles: number;
}

/** Keeps region sites independent of the terrain noise, which uses the raw seed. */
const SITE_SALT = 7919;

const cellsPerSide = (size: number): number => Math.ceil(size / REGION_CELL);

/** Site of cell (cx, cy): a point inside the cell, away from its edges. Shared by every function here. */
const cellSite = (seed: number, cx: number, cy: number): { x: number; y: number } => {
  const h1 = hash32(seed + SITE_SALT, cx, cy, 1) / 0xffffffff;
  const h2 = hash32(seed + SITE_SALT, cx, cy, 2) / 0xffffffff;
  return { x: (cx + 0.2 + 0.6 * h1) * REGION_CELL, y: (cy + 0.2 + 0.6 * h2) * REGION_CELL };
};

const inGrid = (x: number, y: number, size: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;

const clampCell = (tile: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor(tile / REGION_CELL)));

/**
 * The region of a tile: the nearest site to the tile centre among the cells of the
 * 3x3 block around the tile's own cell. For tiles inside the grid that block is exact:
 * no site two cells away can be closer than the tile's own cell site. Ties go to the lower id. Coordinates
 * outside the map are accepted and deterministic (the tile's cell is clamped into the
 * grid), but callers should check `isOnMap` first.
 */
export const regionAt = (seed: number, x: number, y: number, size: number = MAP_SIZE): RegionId => {
  const n = cellsPerSide(size);
  const cx0 = clampCell(x, n);
  const cy0 = clampCell(y, n);
  const px = x + 0.5;
  const py = y + 0.5;
  let bestId = cy0 * n + cx0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(n - 1, cy0 + 1); cy++) {
    for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(n - 1, cx0 + 1); cx++) {
      const site = cellSite(seed, cx, cy);
      const d = (site.x - px) ** 2 + (site.y - py) ** 2;
      const id = cy * n + cx;
      if (d < bestD || (d === bestD && id < bestId)) {
        bestD = d;
        bestId = id;
      }
    }
  }
  return bestId;
};

/** The site (centre point, in tile coordinates) of a region id. */
export const regionSite = (seed: number, id: RegionId, size: number = MAP_SIZE): { x: number; y: number } => {
  const n = cellsPerSide(size);
  return cellSite(seed, id % n, Math.floor(id / n));
};

/** Region id of every tile, row-major (index = y * size + x). */
const regionGrid = (seed: number, size: number): RegionId[] => {
  const grid: RegionId[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid.push(regionAt(seed, x, y, size));
  return grid;
};

/** Regions that own at least one tile, sorted by id. */
export const regionsOf = (seed: number, size: number = MAP_SIZE): readonly Region[] => {
  const counts = new Map<RegionId, number>();
  for (const id of regionGrid(seed, size)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((id) => ({ id, site: regionSite(seed, id, size), tiles: counts.get(id) ?? 0 }));
};

/** True when any on-map orthogonal neighbour of the tile belongs to a different region. */
export const isRegionBorder = (seed: number, x: number, y: number, size: number = MAP_SIZE): boolean => {
  const own = regionAt(seed, x, y, size);
  const neighbours: [number, number][] = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];
  return neighbours.some(([nx, ny]) => inGrid(nx, ny, size) && regionAt(seed, nx, ny, size) !== own);
};

/**
 * Regions that share an orthogonal tile edge. Every region in `regionsOf` is a key;
 * each list is sorted ascending and symmetric; a region is never its own neighbour.
 */
export const regionNeighbors = (seed: number, size: number = MAP_SIZE): ReadonlyMap<RegionId, readonly RegionId[]> => {
  const sets = new Map<RegionId, Set<RegionId>>();
  for (const { id } of regionsOf(seed, size)) sets.set(id, new Set());
  const grid = regionGrid(seed, size);
  const link = (a: RegionId, b: RegionId): void => {
    if (a === b) return;
    sets.get(a)?.add(b);
    sets.get(b)?.add(a);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = grid[y * size + x] ?? 0;
      if (x + 1 < size) link(id, grid[y * size + x + 1] ?? 0);
      if (y + 1 < size) link(id, grid[(y + 1) * size + x] ?? 0);
    }
  }
  return new Map([...sets].map(([id, set]) => [id, [...set].sort((a, b) => a - b)]));
};
