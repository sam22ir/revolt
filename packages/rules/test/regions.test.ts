import { test } from "vitest";
import { isRegionBorder, MAP_SIZE, REGION_CELL, regionAt, regionGrid, regionNeighbors, regionSite, regionsOf, type RegionId } from "../src/index.ts";
import { ex } from "./helpers.ts";

/** Region cells per side of the map. */
const CELLS = Math.ceil(MAP_SIZE / REGION_CELL);

const tilesOf = (size: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push([x, y]);
  return out;
};

/** Orthogonal flood fill: does `inSet` form one 4-connected piece? */
const isConnected = (tiles: [number, number][], size: number, inSet: (x: number, y: number) => boolean): boolean => {
  if (tiles.length === 0) return true;
  const seen = new Set<number>();
  const stack: [number, number][] = [tiles[0] as [number, number]];
  seen.add((tiles[0] as [number, number])[1] * size + (tiles[0] as [number, number])[0]);
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || !inSet(nx, ny)) continue;
      const k = ny * size + nx;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen.size === tiles.length;
};

test("regionAt: pure, seed-dependent, off-map safe, stable for seed 7, regionGrid matches", () => {
  {
    const e = ex("is a pure function of seed and tile");
    for (const [x, y] of tilesOf(MAP_SIZE)) e(regionAt(7, x, y), `tile ${x},${y}`).toBe(regionAt(7, x, y));
  }

  {
    const e = ex("different seeds give different layouts");
    const layout = (seed: number): string => tilesOf(MAP_SIZE).map(([x, y]) => regionAt(seed, x, y)).join(",");
    e(layout(7), "7 vs 8").not.toBe(layout(8));
    e(layout(7), "7 vs 12345").not.toBe(layout(12345));
  }

  {
    const e = ex("off-map and negative coordinates do not throw and are deterministic");
    for (const [x, y] of [[-1, -1], [-5, 3], [3, -40], [MAP_SIZE + 10, 2], [500, 500], [-1000, 1000]] as const) {
      const id = regionAt(7, x, y);
      e(id, `${x},${y} deterministic`).toBe(regionAt(7, x, y));
      e(Number.isInteger(id) && id >= 0 && id < CELLS * CELLS, `${x},${y} valid id`).toBe(true);
    }
  }

  {
    // These literals are the actual values for seed 7. Region ids are stored by the server
    // once regions are used, so a change here must be deliberate.
    const e = ex("seed 7 region ids at fixed tiles and the region count");
    e(regionAt(7, 0, 0), "0,0").toBe(0);
    e(regionAt(7, 191, 0), "191,0").toBe(5);
    e(regionAt(7, 0, 191), "0,191").toBe(30);
    e(regionAt(7, 191, 191), "191,191").toBe(35);
    e(regionAt(7, 96, 96), "96,96").toBe(20);
    e(regionsOf(7), "region count").toHaveLength(36);
  }

  {
    const e = ex("is regionAt for every tile, row-major");
    const size = 32;
    const grid = regionGrid(7, size);
    e(grid, "length").toHaveLength(size * size);
    for (const [x, y] of tilesOf(size)) e(grid[y * size + x], `tile ${x},${y}`).toBe(regionAt(7, x, y, size));
  }
});

test("regionsOf and regionSite: listing, sums, connectivity, count, other map sizes", () => {
  const regions = regionsOf(7);

  {
    const e = ex("every on-map tile's region is listed, and tile counts sum to MAP_SIZE squared");
    const ids = new Set(regions.map((r) => r.id));
    for (const [x, y] of tilesOf(MAP_SIZE)) e(ids.has(regionAt(7, x, y)), `tile ${x},${y}`).toBe(true);
    e(regions.reduce((sum, r) => sum + r.tiles, 0), "tile sum").toBe(MAP_SIZE * MAP_SIZE);
  }

  {
    const e = ex("regions are sorted by id, own at least one tile, and carry their site");
    const ids = regions.map((r) => r.id);
    e(ids, "sorted").toEqual([...ids].sort((a, b) => a - b));
    for (const r of regions) {
      e(r.tiles, `region ${r.id} tiles`).toBeGreaterThan(0);
      e(r.site, `region ${r.id} site`).toEqual(regionSite(7, r.id));
    }
  }

  {
    const e = ex("region count is between (cells - 1)² and cells² for the map's cells per side");
    e(regions.length, "min").toBeGreaterThanOrEqual((CELLS - 1) * (CELLS - 1));
    e(regions.length, "max").toBeLessThanOrEqual(CELLS * CELLS);
  }

  {
    const e = ex("each region is 4-connected for several seeds");
    for (const seed of [1, 2, 7, 99, 4242]) {
      // One grid per seed: regionAt per tile per region is too slow on the full map.
      const grid = regionGrid(seed, MAP_SIZE);
      const at = (x: number, y: number): number => grid[y * MAP_SIZE + x]!;
      for (const region of regionsOf(seed)) {
        const tiles = tilesOf(MAP_SIZE).filter(([x, y]) => at(x, y) === region.id);
        e(isConnected(tiles, MAP_SIZE, (x, y) => at(x, y) === region.id), `seed ${seed} region ${region.id}`).toBe(true);
      }
    }
  }

  {
    const e = ex("size 40 (not a multiple of REGION_CELL) still partitions every tile into connected regions");
    const size = 40;
    const small = regionsOf(7, size);
    e(small.reduce((sum, r) => sum + r.tiles, 0), "tile sum").toBe(size * size);
    const tiles = tilesOf(size);
    for (const region of small) {
      const mine = tiles.filter(([x, y]) => regionAt(7, x, y, size) === region.id);
      e(isConnected(mine, size, (x, y) => regionAt(7, x, y, size) === region.id), `region ${region.id}`).toBe(true);
    }
  }
});

test("region borders and adjacency graph", () => {
  {
    const e = ex("is true exactly when an on-map orthogonal neighbour differs, and borders exist");
    let borders = 0;
    for (const [x, y] of tilesOf(MAP_SIZE)) {
      const own = regionAt(7, x, y);
      const differs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
        ([nx, ny]) => nx! >= 0 && ny! >= 0 && nx! < MAP_SIZE && ny! < MAP_SIZE && regionAt(7, nx!, ny!) !== own,
      );
      e(isRegionBorder(7, x, y), `tile ${x},${y}`).toBe(differs);
      if (differs) borders++;
    }
    e(borders, "borders exist").toBeGreaterThan(0);
  }

  {
    const e = ex("is symmetric, sorted, has every region as a key and never lists itself");
    const adj = regionNeighbors(7);
    const regions = regionsOf(7).map((r) => r.id);
    e([...adj.keys()].sort((a, b) => a - b), "keys").toEqual(regions);
    for (const [id, list] of adj) {
      e(list, `region ${id} sorted`).toEqual([...list].sort((a, b) => a - b));
      e(list, `region ${id} not itself`).not.toContain(id);
      for (const other of list) e(adj.get(other), `region ${id} symmetric with ${other}`).toContain(id);
    }
  }

  {
    const e = ex("the adjacency graph is connected for several seeds");
    for (const seed of [1, 7, 99]) {
      const adj = regionNeighbors(seed);
      const ids = [...adj.keys()];
      const reached = new Set<RegionId>([ids[0] as RegionId]);
      const queue: RegionId[] = [ids[0] as RegionId];
      while (queue.length > 0) {
        for (const next of adj.get(queue.pop() as RegionId) ?? []) {
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      e(reached.size, `seed ${seed}`).toBe(ids.length);
    }
  }
});
