import type { BaseState } from "./base-state.ts";
import { carryCapacity } from "./battle.ts";
import { type Geography, GEO_OASIS, GEO_OASIS_RING, GEO_ROAD, GEO_WADI } from "./geography.ts";
import {
  SITE_KINDS,
  SITE_LEVEL_BANDS,
  SITE_LEVEL_FALLBACK,
  SITE_MAX_HARVEST_MS,
  SITE_MIN_SPACING,
  SITE_RATE_PER_HOUR,
  SITE_TILES_PER_SITE,
  type SiteKind,
  type SiteLevel,
} from "./data/sites.ts";
import { checkMarch, MARCH_BLOCK_REASONS } from "./march.ts";
import { regionsOf } from "./regions.ts";
import { hash32 } from "./rng.ts";
import { terrainAt } from "./terrain.ts";
import type { Troops } from "./troops.ts";

/** A resource site on the map. `id` is `${kind}:${index}`, index counted per kind in scan order. */
export interface MapSite {
  readonly id: string;
  readonly kind: SiteKind;
  readonly level: SiteLevel;
  readonly x: number;
  readonly y: number;
}

const HOUR_MS = 3_600_000;

/** Landmarks a site may not sit on: roads, wadis, oases and their ring. */
const BLOCKED_FLAGS = GEO_WADI | GEO_ROAD | GEO_OASIS | GEO_OASIS_RING;

/** Salt for the placement order, kept clear of the salts `geography.ts` uses. */
const ORDER_SALT = 70;

const clampTile = (v: number, size: number): number => Math.min(size - 1, Math.max(0, Math.floor(v)));

const levelFor = (distance: number): SiteLevel => SITE_LEVEL_BANDS.find((b) => distance <= b.maxDistance)?.level ?? SITE_LEVEL_FALLBACK;

/**
 * Places the resource sites of a map. A pure function of the seed and the static geography, so it is
 * never stored or sent. Never depends on bases, HQs or NPCs. Candidates are ranked by a seeded hash and
 * taken greedily, so the set is fixed for a seed; picks are then numbered in row-major scan order.
 */
export const placeSites = (seed: number, geography: Geography): readonly MapSite[] => {
  const size = geography.size;
  const centres = regionsOf(seed, size).map((r) => ({ tile: { x: clampTile(r.site.x, size), y: clampTile(r.site.y, size) }, site: r.site }));
  const centreKeys = new Set(centres.map((c) => c.tile.y * size + c.tile.x));

  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (((geography.flags[i] ?? 0) & BLOCKED_FLAGS) !== 0) continue;
      if (centreKeys.has(i)) continue;
      if (terrainAt(seed, x, y) === "mountain") continue;
      candidates.push({ x, y, order: hash32(seed, ORDER_SALT, x, y) });
    }
  }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);

  const target = Math.round((size * size) / SITE_TILES_PER_SITE);
  const picks: { x: number; y: number }[] = [];
  for (const c of candidates) {
    if (picks.length >= target) break;
    if (picks.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < SITE_MIN_SPACING)) continue;
    picks.push({ x: c.x, y: c.y });
  }
  picks.sort((a, b) => a.y - b.y || a.x - b.x);

  const perKind = new Map<SiteKind, number>();
  return picks.map((p, scan) => {
    const kind = SITE_KINDS[scan % SITE_KINDS.length]!;
    const index = perKind.get(kind) ?? 0;
    perKind.set(kind, index + 1);
    const nearest = centres.reduce((best, c) => Math.min(best, Math.hypot(p.x - c.site.x, p.y - c.site.y)), Number.POSITIVE_INFINITY);
    return { id: `${kind}:${index}`, kind, level: levelFor(nearest), x: p.x, y: p.y };
  });
};

/**
 * Yield a site has accrued by `now`: rate × time on site, capped by the carry room and by
 * `SITE_MAX_HARVEST_MS`. Zero before arrival and for no carry. Never ticked; computed from timestamps.
 */
export const harvestedAt = (site: { readonly kind: SiteKind; readonly level: SiteLevel }, carry: number, arriveAt: number, now: number): number => {
  if (!(carry > 0)) return 0;
  const elapsed = Math.min(Math.max(0, now - arriveAt), SITE_MAX_HARVEST_MS);
  const rate = SITE_RATE_PER_HOUR[site.kind][site.level];
  return Math.min(Math.floor(carry), Math.floor((rate * elapsed) / HOUR_MS));
};

export interface HarvestTiming {
  readonly arriveAt: number;
  /** The march comes home full, or at the harvest window's end, whichever is first. */
  readonly leaveSiteAt: number;
  readonly returnAt: number;
}

/** Fixed at send time, as for every march: fill time capped by `SITE_MAX_HARVEST_MS`, then the trip home. */
export const harvestTiming = (site: { readonly kind: SiteKind; readonly level: SiteLevel }, carry: number, arriveAt: number, travelLegMs: number): HarvestTiming => {
  const rate = SITE_RATE_PER_HOUR[site.kind][site.level];
  const fill = carry > 0 ? Math.ceil((carry * HOUR_MS) / rate) : 0;
  const leaveSiteAt = arriveAt + Math.min(fill, SITE_MAX_HARVEST_MS);
  return { arriveAt, leaveSiteAt, returnAt: leaveSiteAt + travelLegMs };
};

export type RecallResult = { readonly ok: true; readonly leaveSiteAt: number; readonly returnAt: number } | { readonly ok: false; readonly reason: "not_at_site" };

/**
 * Recall sets the march leaving now (or at the harvest window's end, if that came first) and home one leg later.
 * Refused before the march has arrived. The server must also refuse a recall after the scheduled leave.
 */
export const recallTiming = (arriveAt: number, now: number, travelLegMs: number): RecallResult => {
  if (now < arriveAt) return { ok: false, reason: "not_at_site" };
  const leaveSiteAt = Math.min(now, arriveAt + SITE_MAX_HARVEST_MS);
  return { ok: true, leaveSiteAt, returnAt: leaveSiteAt + travelLegMs };
};

export const HARVEST_BLOCK_REASONS = ["no_such_site", "site_taken", "not_at_site", ...MARCH_BLOCK_REASONS] as const;
export type HarvestBlockReason = (typeof HARVEST_BLOCK_REASONS)[number];

/**
 * Checks a harvest march against an already-advanced state. `takenSiteIds` are the sites other marches
 * occupy (server data). Troop checks are `checkMarch`'s, so a porters-only harvest is refused as `no_troops`.
 */
export const checkHarvest = (state: BaseState, troops: Troops, site: MapSite | undefined, takenSiteIds: ReadonlySet<string>): HarvestBlockReason | null => {
  if (site === undefined) return "no_such_site";
  if (takenSiteIds.has(site.id)) return "site_taken";
  return checkMarch(state, troops);
};

/** Carry the troops can take home from a site: the same capacity a battle loot uses. */
export const harvestCarry = (troops: Troops): number => carryCapacity(troops);
