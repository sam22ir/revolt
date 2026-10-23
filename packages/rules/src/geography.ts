import { regionNeighbors, regionSite, regionsOf, type RegionId } from "./regions.ts";
import { hash32 } from "./rng.ts";
import { terrainAt, valueNoise, type TerrainId } from "./terrain.ts";

/**
 * Landmarks laid over the terrain (GDD §4.5, §7): dry riverbeds (oueds), dirt roads between the region strongholds,
 * and oases. A pure function of the map seed like `terrainAt`, so it is never stored or sent. Cosmetic for now:
 * placement and travel ignore it.
 */

export interface GeoTile {
  readonly x: number;
  readonly y: number;
}

/** Per-tile flags in `Geography.flags`. */
export const GEO_WADI = 1;
export const GEO_ROAD = 2;
export const GEO_OASIS = 4;
/** Next to a wadi (orthogonally), not on it. */
export const GEO_BANK = 8;
/** Within two tiles of an oasis, not on it. */
export const GEO_OASIS_RING = 16;
/** One tile from an oasis (also GEO_OASIS_RING): the damp shore, kept low so trees do not hide the water. */
export const GEO_OASIS_SHORE = 32;

export interface Geography {
  readonly size: number;
  /** Each wadi is an ordered, 4-connected run of tiles from one map edge to another. */
  readonly wadis: readonly (readonly GeoTile[])[];
  /** Each road is an ordered, 4-connected run of tiles between two neighbouring region sites. */
  readonly roads: readonly (readonly GeoTile[])[];
  readonly oases: readonly GeoTile[];
  /** GEO_* bits per tile, row-major (index = y * size + x). */
  readonly flags: Uint8Array;
}

/** How green a tile's ground is, 0 (bare sand) to 1 (olive country). Low-frequency, so groves and open ground come in patches. */
export const fertilityAt = (seed: number, x: number, y: number): number =>
  0.7 * valueNoise(seed + 30, x, y, 7) + 0.3 * valueNoise(seed + 31, x, y, 3);

const ROAD_COST: Readonly<Record<TerrainId, number>> = { plain: 1, hills: 2, forest: 3, mountain: 8 };

/**
 * Cheapest 4-connected path from `from` to `to` (both included). `cost(x, y)` is the price of stepping onto a tile, at least `minCost`.
 * Ties break on tile index, so the result is deterministic.
 */
const cheapestPath = (size: number, from: GeoTile, to: GeoTile, cost: (x: number, y: number) => number, minCost: number): GeoTile[] => {
  const n = size * size;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const start = from.y * size + from.x;
  const goal = to.y * size + to.x;
  const h = (i: number): number => (Math.abs((i % size) - to.x) + Math.abs(Math.floor(i / size) - to.y)) * minCost;
  // Binary heap of [priority, index].
  const heap: [number, number][] = [];
  const less = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };
  dist[start] = 0;
  push([h(start), start]);
  while (heap.length > 0) {
    const [, i] = pop();
    if (done[i] === 1) continue;
    done[i] = 1;
    if (i === goal) break;
    const x = i % size;
    const y = Math.floor(i / size);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      const d = dist[i]! + cost(nx, ny);
      if (d < dist[j]!) {
        dist[j] = d;
        prev[j] = i;
        push([d + h(j), j]);
      }
    }
  }
  const path: GeoTile[] = [];
  for (let i = goal; i !== -1; i = prev[i]!) path.push({ x: i % size, y: Math.floor(i / size) });
  return path.reverse();
};

/** A point on one edge of the map, kept away from the corners. `side` 0..3 = top (y 0), right (x max), bottom (y max), left (x 0). */
const edgePoint = (size: number, side: number, t: number): GeoTile => {
  const along = Math.floor(size * (0.2 + 0.6 * t));
  if (side === 0) return { x: along, y: 0 };
  if (side === 1) return { x: size - 1, y: along };
  if (side === 2) return { x: along, y: size - 1 };
  return { x: 0, y: along };
};

const unit = (seed: number, ...v: number[]): number => hash32(seed, ...v) / 0x100000000;

/** One wadi per 32 tiles of map side (at least one), each crossing the map between opposite edges and meandering through low noise. */
const makeWadis = (seed: number, size: number): GeoTile[][] => {
  const count = Math.max(1, Math.floor(size / 32));
  const wadis: GeoTile[][] = [];
  for (let k = 0; k < count; k++) {
    // Alternate the axis so two wadis cross each other's direction rather than running side by side.
    const side = (k + (hash32(seed, 50) & 1)) % 2;
    const from = edgePoint(size, side, unit(seed, 51, k));
    const to = edgePoint(size, side + 2, unit(seed, 52, k));
    // The noise field is the valley floor the riverbed follows; mountains are dear so it winds around ranges.
    const cost = (x: number, y: number): number => 1 + 6 * valueNoise(seed + 53 + k, x, y, 6) + (terrainAt(seed, x, y) === "mountain" ? 6 : 0);
    wadis.push(cheapestPath(size, from, to, cost, 1));
  }
  return wadis;
};

/** Region links of a minimum spanning tree over neighbouring regions, by site distance (Kruskal, ties by id). */
const regionTree = (seed: number, size: number): [RegionId, RegionId][] => {
  const neighbours = regionNeighbors(seed, size);
  const edges: { a: RegionId; b: RegionId; d: number }[] = [];
  for (const [a, list] of neighbours) {
    for (const b of list) {
      if (b <= a) continue;
      const sa = regionSite(seed, a, size);
      const sb = regionSite(seed, b, size);
      edges.push({ a, b, d: Math.hypot(sa.x - sb.x, sa.y - sb.y) });
    }
  }
  edges.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  const parent = new Map<RegionId, RegionId>();
  const find = (r: RegionId): RegionId => {
    let p = parent.get(r) ?? r;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    return p;
  };
  const out: [RegionId, RegionId][] = [];
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    out.push([e.a, e.b]);
  }
  return out;
};

const siteTile = (seed: number, id: RegionId, size: number): GeoTile => {
  const s = regionSite(seed, id, size);
  return { x: Math.min(size - 1, Math.max(0, Math.floor(s.x))), y: Math.min(size - 1, Math.max(0, Math.floor(s.y))) };
};

/** One oasis per 1500 tiles: bare plain, at least 3 tiles from any wadi, road or region site, and far from each other. */
const pickOases = (seed: number, size: number, flags: Uint8Array, sites: readonly GeoTile[]): GeoTile[] => {
  const want = Math.max(1, Math.round((size * size) / 1500));
  const near = (x: number, y: number, mask: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && ((flags[ny * size + nx] ?? 0) & mask) !== 0) return true;
      }
    return false;
  };
  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = 3; y < size - 3; y++)
    for (let x = 3; x < size - 3; x++) {
      if (terrainAt(seed, x, y) !== "plain" || fertilityAt(seed, x, y) > 0.5) continue;
      if (near(x, y, GEO_WADI | GEO_ROAD, 3)) continue;
      if (sites.some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) < 4)) continue;
      candidates.push({ x, y, order: hash32(seed, 60, x, y) });
    }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  const out: GeoTile[] = [];
  const gap = Math.max(8, Math.floor(size / 5));
  for (const c of candidates) {
    if (out.length >= want) break;
    if (out.some((o) => Math.max(Math.abs(o.x - c.x), Math.abs(o.y - c.y)) < gap)) continue;
    out.push({ x: c.x, y: c.y });
  }
  return out;
};

const build = (seed: number, size: number): Geography => {
  const flags = new Uint8Array(size * size);
  const wadis = makeWadis(seed, size);
  for (const w of wadis) for (const t of w) flags[t.y * size + t.x]! |= GEO_WADI;

  const sites = regionsOf(seed, size).map((r) => siteTile(seed, r.id, size));
  const roads: GeoTile[][] = [];
  // Existing road is cheap, so later roads join earlier ones instead of running beside them.
  const roadCost = (x: number, y: number): number => {
    const f = flags[y * size + x] ?? 0;
    if ((f & GEO_ROAD) !== 0) return 0.35;
    return ROAD_COST[terrainAt(seed, x, y)] + ((f & GEO_WADI) !== 0 ? 2 : 0);
  };
  for (const [a, b] of regionTree(seed, size)) {
    const road = cheapestPath(size, siteTile(seed, a, size), siteTile(seed, b, size), roadCost, 0.35);
    for (const t of road) flags[t.y * size + t.x]! |= GEO_ROAD;
    roads.push(road);
  }

  const oases = pickOases(seed, size, flags, sites);
  for (const o of oases) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        flags[y * size + x]! |= d === 0 ? GEO_OASIS : d === 1 ? GEO_OASIS_RING | GEO_OASIS_SHORE : GEO_OASIS_RING;
      }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if ((flags[i]! & GEO_WADI) !== 0) continue;
      const wet = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
        ([nx, ny]) => nx! >= 0 && ny! >= 0 && nx! < size && ny! < size && (flags[ny! * size + nx!]! & GEO_WADI) !== 0,
      );
      if (wet) flags[i]! |= GEO_BANK;
    }
  return { size, wadis, roads, oases, flags };
};

let cached: { seed: number; size: number; geo: Geography } | null = null;

/** The landmarks of a map. Costs a few path searches: memoised on the last seed and size. */
export const geographyOf = (seed: number, size: number): Geography => {
  if (cached === null || cached.seed !== seed || cached.size !== size) cached = { seed, size, geo: build(seed, size) };
  return cached.geo;
};
