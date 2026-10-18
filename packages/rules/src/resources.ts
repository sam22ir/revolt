import { RESOURCE_IDS, type ResourceId } from "./resource-id.ts";

export type Resources = Readonly<Record<ResourceId, number>>;

export const ZERO_RESOURCES: Resources = { food: 0, materiel: 0, funds: 0, support: 0 };

export const mapResources = (fn: (id: ResourceId) => number): Resources => {
  const out: Record<ResourceId, number> = { ...ZERO_RESOURCES };
  for (const id of RESOURCE_IDS) out[id] = fn(id);
  return out;
};

export const canAfford = (have: Resources, cost: Resources): boolean =>
  RESOURCE_IDS.every((id) => have[id] >= cost[id]);

export const subtractResources = (a: Resources, b: Resources): Resources =>
  mapResources((id) => a[id] - b[id]);
