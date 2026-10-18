/** One map per server (GDD §5). Placeholder size for M3. Tiles are 0..MAP_SIZE-1 on both axes. */
export const MAP_SIZE = 64;

/** NPC targets alive at once, per level (index 0 = level 1). */
export const NPC_COUNT_BY_LEVEL: readonly number[] = [16, 10, 6];

/** Marches one player may have out at once. */
export const MAX_MARCHES = 2;

/** Minimum tile distance between a new base and anything already on the map. */
export const PLACEMENT_SPACING = 2;

/**
 * If a march has no battle outcome this long after it should have returned (the map
 * server lost it), its troops come home unharmed with no loot.
 */
export const MARCH_RESCUE_GRACE_MS = 60 * 60_000;
