export const BUILDING_IDS = ["hq", "farm", "armory", "treasury", "barracks"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];
