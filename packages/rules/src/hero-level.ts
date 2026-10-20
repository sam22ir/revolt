import type { BaseState } from "./base-state.ts";
import type { HeroId } from "./hero-id.ts";
import { HERO_LEVELS_PER_HALL_LEVEL, HERO_SHARDS_PER_LEVEL, MAX_HERO_LEVEL } from "./data/hero-progression.ts";

export const HERO_LEVEL_BLOCK_REASONS = ["not_owned", "max_level", "hall_cap", "not_enough_shards"] as const;
export type HeroLevelBlockReason = (typeof HERO_LEVEL_BLOCK_REASONS)[number];

export type HeroLevelResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: HeroLevelBlockReason; readonly state: BaseState };

/** Highest level the hero hall allows right now. */
export const heroLevelCap = (hallLevel: number): number => Math.min(MAX_HERO_LEVEL, hallLevel * HERO_LEVELS_PER_HALL_LEVEL);

/** Shards needed to go from `level` to `level + 1`, or null at the top level. */
export const shardsToNextLevel = (level: number): number | null => {
  const row = HERO_SHARDS_PER_LEVEL[level - 1];
  return level >= MAX_HERO_LEVEL || row === undefined ? null : row;
};

/** Spends shards to raise an owned hero one level, within the hall's cap. Instant, so it takes no clock. */
export const levelUpHero = (state: BaseState, heroId: HeroId): HeroLevelResult => {
  const entry = state.heroes.owned[heroId];
  if (entry === undefined) return { ok: false, reason: "not_owned", state };
  const cost = shardsToNextLevel(entry.level);
  if (cost === null) return { ok: false, reason: "max_level", state };
  if (entry.level >= heroLevelCap(state.levels.hero_hall)) return { ok: false, reason: "hall_cap", state };
  if (entry.shards < cost) return { ok: false, reason: "not_enough_shards", state };
  const owned = { ...state.heroes.owned, [heroId]: { level: entry.level + 1, shards: entry.shards - cost } };
  return { ok: true, state: { ...state, heroes: { ...state.heroes, owned } } };
};
