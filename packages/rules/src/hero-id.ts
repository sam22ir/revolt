/**
 * Role-only heroes (GDD §4.4, §6): "inspired by" the kinds of people who took part, never named real figures.
 * Names and descriptions are i18n keys `hero.<id>.*`.
 */
export const HERO_IDS = ["courier", "medic", "organizer", "quartermaster", "mountain_guide", "field_commander"] as const;

export type HeroId = (typeof HERO_IDS)[number];

export const isHeroId = (v: unknown): v is HeroId => HERO_IDS.some((id) => id === v);
