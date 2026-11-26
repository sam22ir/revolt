/**
 * Contested zones (GDD §5, docs/contested-zones-plan.md): a few neutral areas with very rich resource sites, where columns of
 * different alliances may fight over a site. No base, HQ or colonial target stands in or near one. Placeholders to be tuned.
 */

/** Zones on a map. */
export const ZONE_COUNT = 4;
/** A zone is the tiles within this distance of its centre. */
export const ZONE_RADIUS = 5;
/** Tiles between a zone's edge and the nearest base, alliance HQ or colonial target. */
export const ZONE_CLEARANCE = 2;
/** A zone's centre keeps this far from the map's edges and from every region's centre. */
export const ZONE_EDGE_MARGIN = 16;
export const ZONE_SITE_CENTRE_GAP = 10;
/** Zone centres keep at least this share of the map's side apart. */
export const ZONE_SPACING_SHARE = 0.25;

/** Sites in a zone, the kinds they take in turn, and how far apart they keep. */
export const ZONE_SITES = 5;
export const ZONE_SITE_KINDS = ["farmland", "quarry", "depot", "farmland", "quarry"] as const;
export const ZONE_SITE_SPACING = 2;
/** Sites this close to the centre are level 5, the rest level 4. */
export const ZONE_HEART = 2.5;

/** Troops carry this many times as much from a zone site (the user's choice: "very rich" is bigger loads, not only faster ones). */
export const ZONE_CARRY_MULTIPLIER = 3;
/** A harvest in a zone may stay this long. */
export const ZONE_MAX_HARVEST_MS = 12 * 3_600_000;
