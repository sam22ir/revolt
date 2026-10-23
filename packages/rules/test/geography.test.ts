import { test } from "vitest";
import {
  fertilityAt,
  GEO_BANK,
  GEO_OASIS,
  GEO_OASIS_RING,
  GEO_OASIS_SHORE,
  GEO_ROAD,
  GEO_WADI,
  geographyOf,
  MAP_SIZE,
  regionSite,
  regionsOf,
  terrainAt,
  type GeoTile,
} from "../src/index.ts";
import { ex } from "./helpers.ts";

const SEEDS = [7, 12345, 0xdeadbeef];
const onMap = (t: GeoTile, size: number): boolean => t.x >= 0 && t.y >= 0 && t.x < size && t.y < size;
const contiguous = (path: readonly GeoTile[]): boolean => path.every((t, i) => i === 0 || Math.abs(t.x - path[i - 1]!.x) + Math.abs(t.y - path[i - 1]!.y) === 1);
const onEdge = (t: GeoTile, size: number): boolean => t.x === 0 || t.y === 0 || t.x === size - 1 || t.y === size - 1;

test("geographyOf: pure, wadis cross the map, roads link every region site, oases sit on bare plain", () => {
  for (const seed of SEEDS) {
    const geo = geographyOf(seed, MAP_SIZE);
    const row = `seed ${seed}`;

    {
      const e = ex("is a pure function of seed and size (memo or not)");
      const again = geographyOf(seed + 1, MAP_SIZE) && geographyOf(seed, MAP_SIZE);
      e(JSON.stringify({ ...again, flags: [...again.flags] }), row).toBe(JSON.stringify({ ...geo, flags: [...geo.flags] }));
    }

    {
      const e = ex("wadis: two on a 64 map, contiguous, on the map, from one edge to another edge");
      e(geo.wadis.length, row).toBe(2);
      for (const w of geo.wadis) {
        e(contiguous(w), `${row} contiguous`).toBe(true);
        e(w.every((t) => onMap(t, MAP_SIZE)), `${row} on map`).toBe(true);
        e(onEdge(w[0]!, MAP_SIZE) && onEdge(w[w.length - 1]!, MAP_SIZE), `${row} edge to edge`).toBe(true);
        e(w.length >= MAP_SIZE, `${row} crosses the map`).toBe(true);
      }
    }

    {
      const e = ex("roads: contiguous, and together they reach every region site (one connected network)");
      const regions = regionsOf(seed, MAP_SIZE);
      e(geo.roads.length, row).toBe(regions.length - 1);
      for (const r of geo.roads) e(contiguous(r), `${row} contiguous`).toBe(true);
      const tiles = new Set(geo.roads.flatMap((r) => r.map((t) => t.y * MAP_SIZE + t.x)));
      for (const reg of regions) {
        const s = regionSite(seed, reg.id, MAP_SIZE);
        e(tiles.has(Math.floor(s.y) * MAP_SIZE + Math.floor(s.x)), `${row} site of region ${reg.id}`).toBe(true);
      }
      // Flood fill over road tiles: one piece.
      const start = tiles.values().next().value as number;
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % MAP_SIZE, y = Math.floor(i / MAP_SIZE);
        for (const j of [i + 1, i - 1, i + MAP_SIZE, i - MAP_SIZE]) {
          const nx = j % MAP_SIZE, ny = Math.floor(j / MAP_SIZE);
          if (j < 0 || Math.abs(nx - x) + Math.abs(ny - y) !== 1 || !tiles.has(j) || seen.has(j)) continue;
          seen.add(j);
          stack.push(j);
        }
      }
      e(seen.size, `${row} connected`).toBe(tiles.size);
    }

    {
      const e = ex("oases: three, on plain, low fertility, clear of wadis, roads and region sites, spread apart");
      e(geo.oases.length, row).toBe(3);
      const sites = regionsOf(seed, MAP_SIZE).map((r) => regionSite(seed, r.id, MAP_SIZE));
      for (const o of geo.oases) {
        e(terrainAt(seed, o.x, o.y), `${row} ${o.x},${o.y} terrain`).toBe("plain");
        e(fertilityAt(seed, o.x, o.y) <= 0.5, `${row} ${o.x},${o.y} arid`).toBe(true);
        e(sites.every((s) => Math.max(Math.abs(Math.floor(s.x) - o.x), Math.abs(Math.floor(s.y) - o.y)) >= 4), `${row} ${o.x},${o.y} off sites`).toBe(true);
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const f = geo.flags[(o.y + dy) * MAP_SIZE + o.x + dx] ?? 0;
            e(f & (GEO_WADI | GEO_ROAD), `${row} ${o.x},${o.y} clear at ${dx},${dy}`).toBe(0);
          }
      }
      for (const [i, a] of geo.oases.entries())
        for (const b of geo.oases.slice(i + 1)) e(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= 12, `${row} spread`).toBe(true);
    }

    {
      const e = ex("flags agree with the paths: wadi and road tiles marked, banks border a wadi, oasis centre and ring");
      for (const w of geo.wadis) for (const t of w) e(geo.flags[t.y * MAP_SIZE + t.x]! & GEO_WADI, row).toBe(GEO_WADI);
      for (const r of geo.roads) for (const t of r) e(geo.flags[t.y * MAP_SIZE + t.x]! & GEO_ROAD, row).toBe(GEO_ROAD);
      let banks = 0;
      for (let y = 0; y < MAP_SIZE; y++)
        for (let x = 0; x < MAP_SIZE; x++) {
          const f = geo.flags[y * MAP_SIZE + x]!;
          if ((f & GEO_BANK) === 0) continue;
          banks++;
          const wet = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => ((geo.flags[ny! * MAP_SIZE + nx!] ?? 0) & GEO_WADI) !== 0 && nx! >= 0 && nx! < MAP_SIZE);
          if (!wet || (f & GEO_WADI) !== 0) e(`${x},${y}`, `${row} bad bank`).toBe("a dry tile beside a wadi");
        }
      e(banks > 0, `${row} has banks`).toBe(true);
      for (const o of geo.oases) {
        e(geo.flags[o.y * MAP_SIZE + o.x]! & GEO_OASIS, row).toBe(GEO_OASIS);
        e(geo.flags[(o.y + 2) * MAP_SIZE + o.x + 2]! & (GEO_OASIS_RING | GEO_OASIS_SHORE), `${row} outer ring`).toBe(GEO_OASIS_RING);
        e(geo.flags[(o.y - 1) * MAP_SIZE + o.x + 1]! & (GEO_OASIS_RING | GEO_OASIS_SHORE), `${row} shore`).toBe(GEO_OASIS_RING | GEO_OASIS_SHORE);
      }
    }
  }

  {
    const e = ex("small maps still get one wadi and one oasis");
    const geo = geographyOf(7, 24);
    e(geo.wadis.length).toBe(1);
    e(geo.oases.length <= 1).toBe(true);
  }

  {
    const e = ex("fertilityAt stays in [0, 1] and varies across the map");
    let lo = 1, hi = 0;
    for (let x = 0; x < MAP_SIZE; x++)
      for (let y = 0; y < MAP_SIZE; y++) {
        const f = fertilityAt(7, x, y);
        lo = Math.min(lo, f);
        hi = Math.max(hi, f);
      }
    e(lo >= 0 && hi <= 1, "range").toBe(true);
    e(hi - lo > 0.4, "spread").toBe(true);
  }
});
