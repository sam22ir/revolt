import { ZONE_CLEARANCE } from "./data/zones.ts";
import { zoneAt } from "./zones.ts";
import { LIBERATION_BONUS_CAP, LIBERATION_BONUS_PER_REGION } from "./data/liberation.ts";
import { MAP_SIZE } from "./data/map.ts";
import { regionAt, regionSite, type RegionId } from "./regions.ts";
import { terrainAt } from "./terrain.ts";

/**
 * A region held by the movement from `from` until `until` (null while it is still held), epoch ms.
 * Both are the time the server recorded the change, never an earlier one: a base already settled
 * past `from` must not be paid retroactively.
 */
export interface Liberation {
  readonly region: RegionId;
  readonly from: number;
  readonly until: number | null;
}

/** What a server-wide rule needs to know about the world. Passed in by the caller, like `now`. */
export interface World {
  readonly liberations: readonly Liberation[];
}

export const NO_WORLD: World = { liberations: [] };

const isActive = (l: Liberation, t: number): boolean => l.from <= t && (l.until === null || t < l.until);

/** The regions liberated at time `t`. The one place the from/until window is read. */
export const liberatedRegions = (world: World, t: number): ReadonlySet<RegionId> =>
  new Set(world.liberations.filter((l) => isActive(l, t)).map((l) => l.region));

/** Number of distinct regions liberated at time `t`. */
export const liberatedCount = (world: World, t: number): number => liberatedRegions(world, t).size;

/** Production multiplier at time `t`: `1 + bonus`, with the bonus capped. */
export const productionMultiplier = (world: World, t: number): number =>
  1 + Math.min(LIBERATION_BONUS_CAP, liberatedCount(world, t) * LIBERATION_BONUS_PER_REGION);

/** Times strictly inside `(from, to)` where the multiplier may change, ascending and without duplicates. */
export const multiplierBreakpoints = (world: World, from: number, to: number): number[] => {
  const points = new Set<number>();
  for (const l of world.liberations) {
    for (const p of [l.from, l.until]) if (p !== null && p > from && p < to) points.add(p);
  }
  return [...points].sort((a, b) => a - b);
};

/** What a stronghold must keep clear of: the tiles of bases, NPCs and HQs already on the map. */
export interface TakenTile {
  readonly x: number;
  readonly y: number;
}

/**
 * The tile for a region's stronghold: the nearest tile to the region's site that lies inside the
 * region, is not a mountain nor near a contested zone, and keeps `spacing` tiles from everything in `taken` (relaxed to "not on
 * the same tile" if the region is crowded). A pure function of the seed and the taken tiles; null only
 * if the region owns no usable tile.
 */
export const strongholdTile = (seed: number, region: RegionId, taken: readonly TakenTile[], spacing: number, size: number = MAP_SIZE): TakenTile | null => {
  const site = regionSite(seed, region, size);
  const sx = Math.floor(site.x);
  const sy = Math.floor(site.y);
  const usable = (x: number, y: number, gap: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && regionAt(seed, x, y, size) === region && terrainAt(seed, x, y) !== "mountain" &&
    zoneAt(seed, x, y, size, ZONE_CLEARANCE) === null && taken.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > gap);
  for (const gap of spacing > 0 ? [spacing, 0] : [0]) {
    for (let r = 0; r < size; r++) {
      for (let y = sy - r; y <= sy + r; y++) {
        for (let x = sx - r; x <= sx + r; x++) {
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) === r && usable(x, y, gap)) return { x, y };
        }
      }
    }
  }
  return null;
};
