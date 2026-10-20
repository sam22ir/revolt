export const BUILDING_IDS = ["hq", "farm", "armory", "treasury", "barracks", "hero_hall"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];
