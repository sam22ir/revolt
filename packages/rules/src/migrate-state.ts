import { START_HEROES, START_STORY } from "./base-state.ts";
import { START_LEVELS } from "./data/start.ts";
import { ZERO_TROOPS } from "./troops.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Brings a stored or saved base from an older shape up to the current one, filling only
 * what is missing: M2-era bases have no barracks, troops, training or marches, and pre-M5 bases no hero hall, heroes or story. Runs
 * before `isBaseState`; anything it cannot recognise is returned unchanged for that check to refuse.
 */
export const migrateBaseState = (v: unknown): unknown => {
  if (!isRecord(v) || !isRecord(v.levels)) return v;
  return {
    ...v,
    levels: { ...v.levels, barracks: v.levels.barracks ?? START_LEVELS.barracks, hero_hall: v.levels.hero_hall ?? START_LEVELS.hero_hall },
    troops: v.troops ?? ZERO_TROOPS,
    wounded: v.wounded ?? ZERO_TROOPS,
    training: v.training === undefined ? null : v.training,
    marches: v.marches ?? [],
    heroes: isRecord(v.heroes) ? { ...START_HEROES, ...v.heroes } : (v.heroes ?? START_HEROES),
    story: v.story ?? START_STORY,
  };
};
