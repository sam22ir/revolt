import { START_STORY } from "./base-state.ts";
import { EMPTY_HERO_ROSTER } from "./hero-roster.ts";
import { START_LEVELS } from "./data/start.ts";
import { ZERO_TROOPS } from "./troops.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Brings a stored or saved base from an older shape up to the current one, filling only
 * what is missing: M2-era bases have no barracks, troops, training, marches or hero hall. Runs
 * before `isBaseState`; anything it cannot recognise is returned unchanged for that check to refuse.
 */
export const migrateBaseState = (v: unknown): unknown => {
  if (!isRecord(v) || !isRecord(v.levels)) return v;
  return {
    ...v,
    levels: {
      ...v.levels,
      barracks: v.levels.barracks ?? START_LEVELS.barracks,
      hero_hall: v.levels.hero_hall ?? START_LEVELS.hero_hall,
    },
    heroes: v.heroes ?? EMPTY_HERO_ROSTER,
    story: v.story ?? START_STORY,
    troops: v.troops ?? ZERO_TROOPS,
    wounded: v.wounded ?? ZERO_TROOPS,
    training: v.training === undefined ? null : v.training,
    marches: v.marches ?? [],
  };
};
