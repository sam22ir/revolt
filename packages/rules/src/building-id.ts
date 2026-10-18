export const BUILDING_IDS = ["hq", "farm", "armory", "treasury"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];
