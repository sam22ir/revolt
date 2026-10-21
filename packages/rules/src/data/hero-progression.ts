import type { HeroRarity } from "../hero-id.ts";
import type { Resources } from "../resources.ts";

/** Highest level any hero can reach. */
export const MAX_HERO_LEVEL = 10;

/** A hero's level cap is the hero hall level times this, never above `MAX_HERO_LEVEL`. */
export const HERO_LEVELS_PER_HALL_LEVEL = 2;

/** Shards to go from level `i + 1` to level `i + 2`. Row `i` is the step into level `i + 2`. */
export const HERO_SHARDS_PER_LEVEL: readonly number[] = [2, 3, 4, 6, 8, 11, 14, 18, 23];

/** Each extra level adds this fraction to a skill's value (level 1 is the base value). */
export const HERO_LEVEL_EFFECT_STEP = 0.03;

/** Shards credited when a draw repeats a hero already owned. */
export const SHARDS_PER_DUPLICATE = 4;

/** Lowest hero hall level at which recruitment opens. */
export const HERO_DRAW_MIN_HALL = 2;

/** Cost of one recruitment draw. */
export const HERO_DRAW_COST: Resources = { food: 0, materiel: 0, funds: 200, support: 0 };

/**
 * Published odds of a draw. Weights are relative; a draw picks a rarity by weight, then a hero of
 * that rarity uniformly. The probability of rarity `r` is `weight / total`.
 */
export const HERO_DRAW_ODDS: Readonly<Record<HeroRarity, number>> = { common: 700, rare: 220, legendary: 80 };

/**
 * Pity: the draw that would make `PITY_DRAWS` draws in a row without a rare or better is
 * forced to draw from rare or better. Rarer-than-common draws reset the counter.
 */
export const PITY_DRAWS = 10;

/** Damage taken can never drop below this share, however many defensive skills stack. */
export const HERO_MIN_DAMAGE_TAKEN = 0.5;
