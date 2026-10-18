import { START_LEVELS } from "./data/start.ts";
import { ZERO_TROOPS } from "./troops.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Brings a stored or saved base from an older shape up to the current one, filling only
 * what is missing: M2-era bases have no barracks, troops, training or marches. Runs
 * before `isBaseState`; anything it cannot recognise is returned unchanged for that check to refuse.
 */
export const migrateBaseState = (v: unknown): unknown => {
  if (!isRecord(v) || !isRecord(v.levels)) return v;
  return {
    ...v,
    levels: { ...v.levels, barracks: v.levels.barracks ?? START_LEVELS.barracks },
    troops: v.troops ?? ZERO_TROOPS,
    wounded: v.wounded ?? ZERO_TROOPS,
    training: v.training === undefined ? null : v.training,
    marches: v.marches ?? [],
  };
};
