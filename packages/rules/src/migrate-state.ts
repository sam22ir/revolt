import { START_STORY } from "./base-state.ts";
import { EMPTY_HERO_ROSTER } from "./hero-roster.ts";
import { START_LEVELS } from "./data/start.ts";
import { ZERO_TROOPS } from "./troops.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Brings a stored or saved base from an older shape up to the current one, filling only
 * what is missing: M2-era bases have no barracks, troops, training, marches or hero hall; bases before the watchtower and
 * infirmary have neither, nor a healing batch. Runs
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
      watchtower: v.levels.watchtower ?? START_LEVELS.watchtower,
      infirmary: v.levels.infirmary ?? START_LEVELS.infirmary,
    },
    heroes: v.heroes ?? EMPTY_HERO_ROSTER,
    story: v.story ?? START_STORY,
    troops: v.troops ?? ZERO_TROOPS,
    wounded: v.wounded ?? ZERO_TROOPS,
    training: v.training === undefined ? null : v.training,
    healing: v.healing === undefined ? null : v.healing,
    marches: v.marches ?? [],
  };
};
