import type { ResourceId } from "../resource-id.ts";

/**
 * Resource sites (GDD §4.5, docs/resource-sites-plan.md): farmland and quarries that a player's march
 * occupies and harvests, PvE only. Names and art are i18n keys and art ids `site.<kind>.*`.
 * Every number here is a placeholder to be tuned against building production.
 */
export const SITE_KINDS = ["farmland", "quarry"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const SITE_LEVELS = [1, 2, 3] as const;
export type SiteLevel = (typeof SITE_LEVELS)[number];

/** The resource a site yields. */
export const SITE_RESOURCE: Readonly<Record<SiteKind, ResourceId>> = {
  farmland: "food",
  quarry: "materiel",
};

/** Yield per hour of occupation, by kind and level. */
export const SITE_RATE_PER_HOUR: Readonly<Record<SiteKind, Readonly<Record<SiteLevel, number>>>> = {
  farmland: { 1: 300, 2: 600, 3: 1000 },
  quarry: { 1: 200, 2: 400, 3: 700 },
};

/** A harvest stops accruing after this long on site, even with carry room left. */
export const SITE_MAX_HARVEST_MS = 8 * 3_600_000;

/** About one site per this many map tiles. */
export const SITE_TILES_PER_SITE = 150;

/** Minimum Chebyshev tile distance between two sites. */
export const SITE_MIN_SPACING = 5;

/**
 * Level of a site from its distance to the nearest region centre: the first band whose
 * `maxDistance` it does not exceed. Farther than every band, it is `SITE_LEVEL_FALLBACK`.
 */
export const SITE_LEVEL_BANDS: readonly { readonly maxDistance: number; readonly level: SiteLevel }[] = [
  { maxDistance: 6, level: 3 },
  { maxDistance: 12, level: 2 },
];

export const SITE_LEVEL_FALLBACK: SiteLevel = 1;
