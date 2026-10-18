import type { BaseState } from "./base-state.ts";
import { BUILDING_IDS } from "./building-id.ts";
import { MAX_BUILDING_LEVEL } from "./data/buildings.ts";
import { RESOURCE_IDS } from "./resource-id.ts";

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isLevel = (v: unknown): boolean => isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= MAX_BUILDING_LEVEL;

/** Shape check for untrusted data (a local save, a stored row). Says nothing about plausibility. */
export const isBaseState = (v: unknown): v is BaseState => {
  if (!isRecord(v) || !isRecord(v.resources) || !isRecord(v.levels) || !isFiniteNumber(v.lastUpdated)) return false;
  const { resources, levels, queue } = v;
  if (!RESOURCE_IDS.every((id) => isFiniteNumber(resources[id]) && resources[id] >= 0)) return false;
  if (!BUILDING_IDS.every((id) => isLevel(levels[id]))) return false;
  if (queue === null) return true;
  return (
    isRecord(queue) &&
    BUILDING_IDS.some((id) => id === queue.building) &&
    isLevel(queue.toLevel) &&
    isFiniteNumber(queue.startedAt) &&
    isFiniteNumber(queue.endsAt)
  );
};
