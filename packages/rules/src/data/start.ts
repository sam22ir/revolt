import type { BuildingId } from "../building-id.ts";
import type { Resources } from "../resources.ts";

export const START_RESOURCES: Resources = { food: 500, materiel: 500, funds: 500, support: 0 };

export const START_LEVELS: Readonly<Record<BuildingId, number>> = {
  hq: 1,
  farm: 1,
  armory: 1,
  treasury: 1,
};
