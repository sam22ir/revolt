import { describe, expect, test } from "vitest";
import { isRegionBorder, MAP_SIZE, regionAt, regionGrid, regionNeighbors, regionSite, regionsOf, type RegionId } from "../src/index.ts";

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

describe("regionAt", () => {
  test("is a pure function of seed and tile", () => {
    for (const [x, y] of tilesOf(MAP_SIZE)) expect(regionAt(7, x, y)).toBe(regionAt(7, x, y));
  });

  test("different seeds give different layouts", () => {
    const layout = (seed: number): string => tilesOf(MAP_SIZE).map(([x, y]) => regionAt(seed, x, y)).join(",");
    expect(layout(7)).not.toBe(layout(8));
    expect(layout(7)).not.toBe(layout(12345));
  });

  test("off-map and negative coordinates do not throw and are deterministic", () => {
    for (const [x, y] of [[-1, -1], [-5, 3], [3, -40], [MAP_SIZE + 10, 2], [500, 500], [-1000, 1000]] as const) {
      const id = regionAt(7, x, y);
      expect(id).toBe(regionAt(7, x, y));
      expect(Number.isInteger(id) && id >= 0 && id < 16).toBe(true);
    }
  });
});

describe("regionsOf and regionSite", () => {
  test("every on-map tile's region is listed, and tile counts sum to MAP_SIZE squared", () => {
    const regions = regionsOf(7);
    const ids = new Set(regions.map((r) => r.id));
    for (const [x, y] of tilesOf(MAP_SIZE)) expect(ids.has(regionAt(7, x, y))).toBe(true);
    expect(regions.reduce((sum, r) => sum + r.tiles, 0)).toBe(MAP_SIZE * MAP_SIZE);
  });

  test("regions are sorted by id, own at least one tile, and carry their site", () => {
    const regions = regionsOf(7);
    const ids = regions.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const r of regions) {
      expect(r.tiles).toBeGreaterThan(0);
      expect(r.site).toEqual(regionSite(7, r.id));
    }
  });

  test("region count is between 9 and 16 for MAP_SIZE 64", () => {
    const count = regionsOf(7).length;
    expect(count).toBeGreaterThanOrEqual(9);
    expect(count).toBeLessThanOrEqual(16);
  });

  test("each region is 4-connected for several seeds", () => {
    for (const seed of [1, 2, 7, 99, 4242]) {
      for (const region of regionsOf(seed)) {
        const tiles = tilesOf(MAP_SIZE).filter(([x, y]) => regionAt(seed, x, y) === region.id);
        expect(isConnected(tiles, MAP_SIZE, (x, y) => regionAt(seed, x, y) === region.id), `seed ${seed} region ${region.id}`).toBe(true);
      }
    }
  });
});

describe("isRegionBorder", () => {
  test("is true exactly when an on-map orthogonal neighbour differs, and borders exist", () => {
    let borders = 0;
    for (const [x, y] of tilesOf(MAP_SIZE)) {
      const own = regionAt(7, x, y);
      const differs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
        ([nx, ny]) => nx! >= 0 && ny! >= 0 && nx! < MAP_SIZE && ny! < MAP_SIZE && regionAt(7, nx!, ny!) !== own,
      );
      expect(isRegionBorder(7, x, y)).toBe(differs);
      if (differs) borders++;
    }
    expect(borders).toBeGreaterThan(0);
  });
});

describe("regionNeighbors", () => {
  test("is symmetric, sorted, has every region as a key and never lists itself", () => {
    const adj = regionNeighbors(7);
    const regions = regionsOf(7).map((r) => r.id);
    expect([...adj.keys()].sort((a, b) => a - b)).toEqual(regions);
    for (const [id, list] of adj) {
      expect(list).toEqual([...list].sort((a, b) => a - b));
      expect(list).not.toContain(id);
      for (const other of list) expect(adj.get(other)).toContain(id);
    }
  });

  test("the adjacency graph is connected for several seeds", () => {
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
      expect(reached.size, `seed ${seed}`).toBe(ids.length);
    }
  });
});

describe("other map sizes", () => {
  test("size 40 (not a multiple of REGION_CELL) still partitions every tile into connected regions", () => {
    const size = 40;
    const regions = regionsOf(7, size);
    expect(regions.reduce((sum, r) => sum + r.tiles, 0)).toBe(size * size);
    const tiles = tilesOf(size);
    for (const region of regions) {
      const mine = tiles.filter(([x, y]) => regionAt(7, x, y, size) === region.id);
      expect(isConnected(mine, size, (x, y) => regionAt(7, x, y, size) === region.id), `region ${region.id}`).toBe(true);
    }
  });
});

describe("stability guard", () => {
  // These literals are the actual values for seed 7. Region ids are stored by the server
  // once regions are used, so a change here must be deliberate: changing the site
  // hash, salt, cell size or id scheme changes them, and that is a data migration.
  test("seed 7 region ids at fixed tiles and the region count", () => {
    expect(regionAt(7, 0, 0)).toBe(0);
    expect(regionAt(7, 63, 0)).toBe(3);
    expect(regionAt(7, 0, 63)).toBe(12);
    expect(regionAt(7, 63, 63)).toBe(15);
    expect(regionAt(7, 32, 32)).toBe(5);
    expect(regionsOf(7)).toHaveLength(16);
  });
});

describe("regionGrid", () => {
  test("is regionAt for every tile, row-major", () => {
    const size = 32;
    const grid = regionGrid(7, size);
    expect(grid).toHaveLength(size * size);
    for (const [x, y] of tilesOf(size)) expect(grid[y * size + x]).toBe(regionAt(7, x, y, size));
  });
});
