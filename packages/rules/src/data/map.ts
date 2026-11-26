/** One map per server (GDD §5). Placeholder size for M3. Tiles are 0..MAP_SIZE-1 on both axes. */
export const MAP_SIZE = 64;

/**
 * Tiles per region cell. Each cell holds one region site, so MAP_SIZE 64 gives
 * about 4x4 regions. Changing it changes every region id; treat it as a balance-level constant.
 */
export const REGION_CELL = 16;

/**
 * Roaming NPC targets alive at once, per level (index 0 = level 1). Level 4 has none: its
 * strongholds are fixed, one per region (see `strongholdTile`).
 */
export const NPC_COUNT_BY_LEVEL: readonly number[] = [16, 10, 6, 0];

/** Marches one player may have out at once. */
export const MAX_MARCHES = 2;

/** Minimum tile distance between a new base and anything already on the map. */
export const PLACEMENT_SPACING = 2;

/** Tiles along each map edge where no base or alliance HQ goes, so none stands against the frontier fence. */
export const BASE_EDGE_MARGIN = 3;

/** Tiles between a base or alliance HQ and the nearest mountain, so the rock never hides it. */
export const BASE_MOUNTAIN_CLEARANCE = 1;

/**
 * If a march has no battle outcome this long after it should have returned (the map
 * server lost it), its troops come home unharmed with no loot.
 */
export const MARCH_RESCUE_GRACE_MS = 60 * 60_000;
