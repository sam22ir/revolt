export const RESOURCE_IDS = ["food", "materiel", "funds", "support"] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];
