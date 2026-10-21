export const TROOP_IDS = ["infantry", "scouts", "heavy", "porters"] as const;

export type TroopId = (typeof TROOP_IDS)[number];

/** Troops that fight. Porters only carry (GDD §4.3). */
export const COMBAT_TROOP_IDS = ["infantry", "scouts", "heavy"] as const satisfies readonly TroopId[];

export type CombatTroopId = (typeof COMBAT_TROOP_IDS)[number];
