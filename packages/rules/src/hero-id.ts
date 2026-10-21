import { type BackgroundId, DEFAULT_BACKGROUND } from "./background.ts";

/**
 * Role-only heroes (GDD §4.4, §6): "inspired by" the kinds of people who took part, never named real figures.
 * Names and descriptions are i18n keys `hero.<id>.*`. Each background has its own roster; `HERO_IDS` lists both,
 * so a base keeps progress for every id and a saved base never changes shape when a background is added.
 */
export const HERO_IDS = [
  "courier",
  "medic",
  "organizer",
  "quartermaster",
  "mountain_guide",
  "field_commander",
  "trail_scout",
  "field_medic",
  "propagandist",
  "porter_chief",
  "tunnel_engineer",
  "column_commander",
] as const;

export type HeroId = (typeof HERO_IDS)[number];

export const isHeroId = (v: unknown): v is HeroId => HERO_IDS.some((id) => id === v);

/** The heroes a player of each background can recruit. The two rosters never overlap. */
export const HEROES_BY_BACKGROUND: Readonly<Record<BackgroundId, readonly HeroId[]>> = {
  algeria: ["courier", "medic", "organizer", "quartermaster", "mountain_guide", "field_commander"],
  vietnam: ["trail_scout", "field_medic", "propagandist", "porter_chief", "tunnel_engineer", "column_commander"],
};

export const heroesFor = (background: BackgroundId = DEFAULT_BACKGROUND): readonly HeroId[] => HEROES_BY_BACKGROUND[background];

export const isHeroOf = (background: BackgroundId, id: HeroId): boolean => HEROES_BY_BACKGROUND[background].includes(id);
