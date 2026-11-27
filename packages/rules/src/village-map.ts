import { VILLAGE_KINDS, VILLAGE_MIN_SPACING, VILLAGE_SITE_CLEARANCE, VILLAGE_TILES_PER_VILLAGE, type VillageKind } from "./data/villages.ts";
import { ZONE_CLEARANCE } from "./data/zones.ts";
import { GEO_OASIS, GEO_OASIS_RING, GEO_ROAD, GEO_WADI, type Geography } from "./geography.ts";
import type { MapPoint } from "./base-state.ts";
import { regionsOf } from "./regions.ts";
import { hash32 } from "./rng.ts";
import { terrainAt } from "./terrain.ts";
import { zonesOf } from "./zones.ts";

/** A village on the map. `id` is `village:<index>`, numbered in row-major scan order. */
export interface MapVillage {
  readonly id: string;
  readonly kind: VillageKind;
  readonly x: number;
  readonly y: number;
}

const BLOCKED_FLAGS = GEO_WADI | GEO_ROAD | GEO_OASIS | GEO_OASIS_RING;
/** Salt for the placement order, kept clear of the salts sites and geography use. */
const ORDER_SALT = 90;

const chebyshev = (a: MapPoint, b: MapPoint): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * Places the villages of a map: a pure function of the seed, the static geography and the resource sites, so it is never stored.
 * Never on roads, wadis, oases, mountains, region centres or in contested zones; VILLAGE_MIN_SPACING apart and clear of sites.
 * Kinds take turns in scan order, so every kind is spread over the map.
 */
export const placeVillages = (seed: number, geography: Geography, sites: readonly MapPoint[]): MapVillage[] => {
  const size = geography.size;
  const centres = new Set(regionsOf(seed, size).map((r) => Math.min(size - 1, Math.max(0, Math.floor(r.site.y))) * size + Math.min(size - 1, Math.max(0, Math.floor(r.site.x)))));
  const zones = zonesOf(seed, size);
  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (((geography.flags[i] ?? 0) & BLOCKED_FLAGS) !== 0 || centres.has(i) || terrainAt(seed, x, y) === "mountain") continue;
      if (zones.some((z) => Math.hypot(z.x - x, z.y - y) <= z.radius + ZONE_CLEARANCE)) continue;
      if (sites.some((s) => chebyshev(s, { x, y }) < VILLAGE_SITE_CLEARANCE)) continue;
      candidates.push({ x, y, order: hash32(seed, ORDER_SALT, x, y) });
    }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  const target = Math.round((size * size) / VILLAGE_TILES_PER_VILLAGE);
  const picks: MapPoint[] = [];
  for (const c of candidates) {
    if (picks.length >= target) break;
    if (picks.some((p) => chebyshev(p, c) < VILLAGE_MIN_SPACING)) continue;
    picks.push({ x: c.x, y: c.y });
  }
  picks.sort((a, b) => a.y - b.y || a.x - b.x);
  return picks.map((p, i) => ({ id: `village:${i}`, kind: VILLAGE_KINDS[i % VILLAGE_KINDS.length]!, x: p.x, y: p.y }));
};
