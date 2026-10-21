import { DEFAULT_BACKGROUND, type BackgroundId } from "./background.ts";
import type { CombatTroopId } from "./troop-id.ts";

/** Hero rarities, lowest first. The draw odds and the pity guarantee are in `data/hero-draw.ts`. */
export const HERO_RARITIES = ["common", "rare", "legendary"] as const;
export type HeroRarity = (typeof HERO_RARITIES)[number];

/** Invented placeholder heroes, "inspired by" roles (GDD §4.4, §6). Display names are i18n keys. */
export const HERO_IDS = [
  "mountain_guide",
  "dock_foreman",
  "iron_quartermaster",
  "hill_commander",
  "trail_scout",
  "field_medic",
  "porter_chief",
  "column_commander",
] as const;
export type HeroId = (typeof HERO_IDS)[number];

/** Command skills and passives. Each id is a mechanical key; its name and text come from i18n. */
export const SKILL_IDS = [
  "ridge_signal",
  "night_march",
  "local_knowledge",
  "crowd_rush",
  "union_discipline",
  "steady_hands",
  "breach_charge",
  "shield_wall",
  "heavy_stock",
  "last_stand",
  "iron_line",
  "veteran_drill",
  "jungle_signal",
  "paddy_cover",
  "tunnel_sense",
  "stretcher_run",
  "field_dressing",
  "calm_under_fire",
  "bearer_march",
  "load_sharing",
  "river_crossing",
  "forward_command",
  "dug_in",
  "campaign_drill",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** A hero's troop-type specialty: the combat types only (porters do not fight). */
export type HeroSpecialty = CombatTroopId;

export const isHeroId = (v: unknown): v is HeroId => HERO_IDS.some((id) => id === v);

/** The heroes a player of each background can recruit. The two rosters never overlap; the draw pools by background. */
export const HEROES_BY_BACKGROUND: Readonly<Record<BackgroundId, readonly HeroId[]>> = {
  algeria: ["mountain_guide", "dock_foreman", "iron_quartermaster", "hill_commander"],
  vietnam: ["trail_scout", "field_medic", "porter_chief", "column_commander"],
};

export const heroesFor = (background: BackgroundId = DEFAULT_BACKGROUND): readonly HeroId[] => HEROES_BY_BACKGROUND[background];

export const isHeroOf = (background: BackgroundId, id: HeroId): boolean => HEROES_BY_BACKGROUND[background].includes(id);
