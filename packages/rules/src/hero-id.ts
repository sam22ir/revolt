import type { CombatTroopId } from "./troop-id.ts";

/** Hero rarities, lowest first. The draw odds and the pity guarantee are in `data/hero-draw.ts`. */
export const HERO_RARITIES = ["common", "rare", "legendary"] as const;
export type HeroRarity = (typeof HERO_RARITIES)[number];

/** Invented placeholder heroes, "inspired by" roles (GDD §4.4, §6). Display names are i18n keys. */
export const HERO_IDS = ["mountain_guide", "dock_foreman", "iron_quartermaster", "hill_commander"] as const;
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
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** A hero's troop-type specialty: the combat types only (porters do not fight). */
export type HeroSpecialty = CombatTroopId;
