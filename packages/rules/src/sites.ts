import type { BaseState } from "./base-state.ts";
import { carryCapacity } from "./battle.ts";
import { type Geography, GEO_OASIS, GEO_OASIS_RING, GEO_ROAD, GEO_WADI } from "./geography.ts";
import {
  OPEN_SITE_KINDS,
  SITE_LEVEL_BANDS,
  SITE_LEVEL_FALLBACK,
  SITE_MAX_HARVEST_MS,
  SITE_MIN_SPACING,
  SITE_RATE_PER_HOUR,
  SITE_TILES_PER_SITE,
  type SiteKind,
  type SiteLevel,
} from "./data/sites.ts";
import { ZONE_CARRY_MULTIPLIER, ZONE_CLEARANCE, ZONE_HEART, ZONE_MAX_HARVEST_MS, ZONE_SITE_KINDS, ZONE_SITE_SPACING, ZONE_SITES } from "./data/zones.ts";
import { checkMarch, MARCH_BLOCK_REASONS } from "./march.ts";
import { regionsOf } from "./regions.ts";
import { hash32 } from "./rng.ts";
import { terrainAt } from "./terrain.ts";
import type { Troops } from "./troops.ts";
import { zonesOf } from "./zones.ts";

/**
 * A resource site on the map. Outside zones `id` is `${kind}:${index}`, index counted per kind in scan order; in zone z it is
 * `${kind}:z${z}.${j}`. `zone` is the contested zone's id, or null.
 */
export interface MapSite {
  readonly id: string;
  readonly kind: SiteKind;
  readonly level: SiteLevel;
  readonly x: number;
  readonly y: number;
  readonly zone: number | null;
}

/** What the harvest maths needs of a site. */
type SiteRef = { readonly kind: SiteKind; readonly level: SiteLevel; readonly zone?: number | null };

/** How long a harvest may stay on a site: longer in a contested zone. */
export const maxHarvestMs = (site: { readonly zone?: number | null }): number => (site.zone == null ? SITE_MAX_HARVEST_MS : ZONE_MAX_HARVEST_MS);

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
/** Sites per geography object (geographyOf hands back the same object for the same map), so a map's sites are placed once. */
const placed = new WeakMap<Geography, { seed: number; sites: readonly MapSite[] }>();

export const placeSites = (seed: number, geography: Geography): readonly MapSite[] => {
  const hit = placed.get(geography);
  if (hit !== undefined && hit.seed === seed) return hit.sites;
  const sites = placeSitesNow(seed, geography);
  placed.set(geography, { seed, sites });
  return sites;
};

const placeSitesNow = (seed: number, geography: Geography): readonly MapSite[] => {
  const size = geography.size;
  const centres = regionsOf(seed, size).map((r) => ({ tile: { x: clampTile(r.site.x, size), y: clampTile(r.site.y, size) }, site: r.site }));
  const centreKeys = new Set(centres.map((c) => c.tile.y * size + c.tile.x));
  const zones = zonesOf(seed, size);
  const nearZone = (x: number, y: number): boolean => zones.some((z) => Math.hypot(z.x - x, z.y - y) <= z.radius + ZONE_CLEARANCE);

  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (((geography.flags[i] ?? 0) & BLOCKED_FLAGS) !== 0) continue;
      if (centreKeys.has(i)) continue;
      if (terrainAt(seed, x, y) === "mountain") continue;
      if (nearZone(x, y)) continue;
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
  const open = picks.map((p, scan): MapSite => {
    const kind = OPEN_SITE_KINDS[scan % OPEN_SITE_KINDS.length]!;
    const index = perKind.get(kind) ?? 0;
    perKind.set(kind, index + 1);
    const nearest = centres.reduce((best, c) => Math.min(best, Math.hypot(p.x - c.site.x, p.y - c.site.y)), Number.POSITIVE_INFINITY);
    return { id: `${kind}:${index}`, kind, level: levelFor(nearest), x: p.x, y: p.y, zone: null };
  });
  return [...open, ...zones.flatMap((z) => zoneSites(seed, geography, z))];
};

/** A zone's rich sites: ZONE_SITES tiles inside it in a seeded order, kept apart; level 5 near its heart, 4 further out. */
const zoneSites = (seed: number, geography: Geography, zone: { readonly id: number; readonly x: number; readonly y: number; readonly radius: number }): MapSite[] => {
  const size = geography.size;
  const candidates: { x: number; y: number; order: number }[] = [];
  for (let y = zone.y - zone.radius; y <= zone.y + zone.radius; y++)
    for (let x = zone.x - zone.radius; x <= zone.x + zone.radius; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size || Math.hypot(zone.x - x, zone.y - y) > zone.radius - 1) continue;
      if (((geography.flags[y * size + x] ?? 0) & BLOCKED_FLAGS) !== 0 || terrainAt(seed, x, y) === "mountain") continue;
      candidates.push({ x, y, order: hash32(seed, ORDER_SALT + 1, x, y) });
    }
  candidates.sort((a, b) => a.order - b.order || a.y - b.y || a.x - b.x);
  const picks: { x: number; y: number }[] = [];
  for (const c of candidates) {
    if (picks.length >= ZONE_SITES) break;
    if (picks.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < ZONE_SITE_SPACING)) continue;
    picks.push(c);
  }
  picks.sort((a, b) => a.y - b.y || a.x - b.x);
  return picks.map((p, j) => {
    const kind = ZONE_SITE_KINDS[j % ZONE_SITE_KINDS.length]!;
    return { id: `${kind}:z${zone.id}.${j}`, kind, level: Math.hypot(zone.x - p.x, zone.y - p.y) <= ZONE_HEART ? 5 : 4, x: p.x, y: p.y, zone: zone.id };
  });
};

/**
 * Yield a site has accrued by `now`: rate × time on site, capped by the carry room and by
 * `SITE_MAX_HARVEST_MS`. Zero before arrival and for no carry. Never ticked; computed from timestamps.
 */
export const harvestedAt = (site: SiteRef, carry: number, arriveAt: number, now: number): number => {
  if (!(carry > 0)) return 0;
  const elapsed = Math.min(Math.max(0, now - arriveAt), maxHarvestMs(site));
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
export const harvestTiming = (site: SiteRef, carry: number, arriveAt: number, travelLegMs: number): HarvestTiming => {
  const rate = SITE_RATE_PER_HOUR[site.kind][site.level];
  const fill = carry > 0 ? Math.ceil((carry * HOUR_MS) / rate) : 0;
  const leaveSiteAt = arriveAt + Math.min(fill, maxHarvestMs(site));
  return { arriveAt, leaveSiteAt, returnAt: leaveSiteAt + travelLegMs };
};

export type RecallResult = { readonly ok: true; readonly leaveSiteAt: number; readonly returnAt: number } | { readonly ok: false; readonly reason: "not_at_site" };

/**
 * Recall sets the march leaving now (or at the harvest window's end, if that came first) and home one leg later.
 * Refused before the march has arrived. The server must also refuse a recall after the scheduled leave.
 */
export const recallTiming = (arriveAt: number, now: number, travelLegMs: number, maxMs: number = SITE_MAX_HARVEST_MS): RecallResult => {
  if (now < arriveAt) return { ok: false, reason: "not_at_site" };
  const leaveSiteAt = Math.min(now, arriveAt + maxMs);
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

/** Carry the troops can take home from a site: the capacity a battle loot uses, ZONE_CARRY_MULTIPLIER times that from a zone's site. */
export const harvestCarry = (troops: Troops, site: { readonly zone?: number | null } = {}): number =>
  carryCapacity(troops) * (site.zone == null ? 1 : ZONE_CARRY_MULTIPLIER);
