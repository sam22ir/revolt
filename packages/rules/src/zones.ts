import { MAP_SIZE } from "./data/map.ts";
import { ZONE_COUNT, ZONE_EDGE_MARGIN, ZONE_RADIUS, ZONE_SITE_CENTRE_GAP, ZONE_SPACING_SHARE } from "./data/zones.ts";
import { regionsOf } from "./regions.ts";
import { hash32 } from "./rng.ts";
import { terrainAt } from "./terrain.ts";

/** A contested zone: the tiles within `radius` of its centre. `id` is its index, stable for a map's seed and size. */
export interface Zone {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

const ORDER_SALT = 91;
const STEP = 3;
const cache = new Map<string, readonly Zone[]>();

/**
 * The map's contested zones: a pure function of the seed and size. Centres are tried in a seeded order on a coarse grid; a centre is
 * on land (no mountain), off the edges and away from region centres, and far from the zones already taken. Fewer than ZONE_COUNT on a map
 * too small for them.
 */
export const zonesOf = (seed: number, size: number = MAP_SIZE): readonly Zone[] => {
  const key = `${seed}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const centres = regionsOf(seed, size).map((r) => r.site);
  const spacing = size * ZONE_SPACING_SHARE;
  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = ZONE_EDGE_MARGIN; y < size - ZONE_EDGE_MARGIN; y += STEP)
    for (let x = ZONE_EDGE_MARGIN; x < size - ZONE_EDGE_MARGIN; x += STEP) {
      if (terrainAt(seed, x, y) === "mountain") continue;
      if (centres.some((c) => Math.hypot(c.x - x - 0.5, c.y - y - 0.5) < ZONE_SITE_CENTRE_GAP)) continue;
      candidates.push({ x, y, order: hash32(seed, ORDER_SALT, x, y) });
    }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  const picks: { x: number; y: number }[] = [];
  for (const c of candidates) {
    if (picks.length >= ZONE_COUNT) break;
    if (picks.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < spacing)) continue;
    picks.push(c);
  }
  picks.sort((a, b) => a.y - b.y || a.x - b.x);
  const zones = picks.map((p, id) => ({ id, x: p.x, y: p.y, radius: ZONE_RADIUS }));
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, zones);
  return zones;
};

/** The zone tile (x, y) is in (within its radius, centre to centre), or null. `margin` widens every zone by that many tiles. */
export const zoneAt = (seed: number, x: number, y: number, size: number = MAP_SIZE, margin = 0): Zone | null =>
  zonesOf(seed, size).find((z) => Math.hypot(z.x - x, z.y - y) <= z.radius + margin) ?? null;
