import type { BackgroundId } from "../background.ts";

/**
 * Villages on the world map (docs/villages-plan.md). Players earn a village's trust by answering its daily need; trust fades slowly
 * when a village is left alone, and each trust level teaches one lesson for good. Names are i18n keys `village.<kind>.*`,
 * `need.<kind>.*` and `lesson.<id>.*`. Villages are never attacked or punished by anyone (GDD §6). Every number is a placeholder.
 */
export const VILLAGE_KINDS = ["shepherds", "smiths", "healers", "weavers", "messengers"] as const;
export type VillageKind = (typeof VILLAGE_KINDS)[number];

export const isVillageKind = (v: unknown): v is VillageKind => VILLAGE_KINDS.some((k) => k === v);

export const NEED_KINDS = ["food", "funds", "care", "labor", "protection"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

/** Trust earned by answering one day's need. */
export const TRUST_PER_HELP = 30;
/** Trust lost per day while a village is left alone (it fades continuously, not in steps). */
export const TRUST_DECAY_PER_DAY = 10;
export const TRUST_MAX = 300;
/** The trust at which levels 1, 2 and 3 are reached. */
export const TRUST_LEVELS = [60, 150, 270] as const;
export const MAX_TRUST_LEVEL = TRUST_LEVELS.length;

/** A village's day starts at local midnight of the background's country (Algeria UTC+1, Vietnam UTC+7; no daylight saving time). */
export const VILLAGE_DAY_OFFSET_MS: Readonly<Record<BackgroundId, number>> = {
  algeria: 1 * 60 * 60_000,
  vietnam: 7 * 60 * 60_000,
};

/** What a need asks, at the player's current trust level `t` (0 to 3): deliveries grow with trust, the rest stay put. */
export const NEED_FOOD = (t: number): number => 300 * (t + 1);
export const NEED_FUNDS = (t: number): number => 200 * (t + 1);
/** Care comes from the infirmary: it needs this level, and costs this much. */
export const CARE_INFIRMARY_LEVEL = 2;
export const CARE_COST = { food: 150, funds: 150 } as const;
/** Labor: this many troops lent for this long; they come back unharmed. */
export const LABOR_TROOPS = 20;
export const LABOR_MS = 2 * 60 * 60_000;
/** Protection: beating any colonial target within this many tiles (Chebyshev) of the village answers it. */
export const PROTECTION_RADIUS = 6;

/** Placement: about one village per this many map tiles, this far apart, and this far from any resource site. */
export const VILLAGE_TILES_PER_VILLAGE = 900;
export const VILLAGE_MIN_SPACING = 10;
export const VILLAGE_SITE_CLEARANCE = 4;

/** What a lesson does once studied (applied in slice 3). Fractions are shares (0.06 = 6%); counts are whole numbers. */
export const LESSON_STATS = [
  "march_speed",
  "train_cost",
  "train_time",
  "train_batch",
  "heal_cost",
  "heal_batch_per_level",
  "heal_time",
  "porter_carry",
  "storage",
  "forecast_levels",
  "help_time",
  "support_rate",
] as const;
export type LessonStat = (typeof LESSON_STATS)[number];

export interface LessonDef {
  readonly village: VillageKind;
  /** The trust level that teaches it. */
  readonly level: 1 | 2 | 3;
  readonly stat: LessonStat;
  readonly value: number;
}

export const LESSON_IDS = [
  "hidden_paths",
  "night_marches",
  "high_passes",
  "repair_work",
  "metal_craft",
  "master_smith",
  "herbal_remedies",
  "bone_setting",
  "convalescence",
  "strong_packs",
  "grain_sacks",
  "woven_stores",
  "lookout_network",
  "relay_runners",
  "safe_houses",
] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export const isLessonId = (v: unknown): v is LessonId => LESSON_IDS.some((id) => id === v);

export const LESSONS: Readonly<Record<LessonId, LessonDef>> = {
  hidden_paths: { village: "shepherds", level: 1, stat: "march_speed", value: 0.06 },
  night_marches: { village: "shepherds", level: 2, stat: "march_speed", value: 0.06 },
  high_passes: { village: "shepherds", level: 3, stat: "march_speed", value: 0.08 },
  // Troop tiers 2-4 were planned here, but only tier-1 troops exist yet: the smiths make training cheaper, faster and bigger instead.
  repair_work: { village: "smiths", level: 1, stat: "train_cost", value: 0.1 },
  metal_craft: { village: "smiths", level: 2, stat: "train_time", value: 0.15 },
  master_smith: { village: "smiths", level: 3, stat: "train_batch", value: 0.25 },
  herbal_remedies: { village: "healers", level: 1, stat: "heal_cost", value: 0.15 },
  bone_setting: { village: "healers", level: 2, stat: "heal_batch_per_level", value: 5 },
  convalescence: { village: "healers", level: 3, stat: "heal_time", value: 0.2 },
  strong_packs: { village: "weavers", level: 1, stat: "porter_carry", value: 0.15 },
  grain_sacks: { village: "weavers", level: 2, stat: "storage", value: 0.1 },
  woven_stores: { village: "weavers", level: 3, stat: "storage", value: 0.1 },
  lookout_network: { village: "messengers", level: 1, stat: "forecast_levels", value: 1 },
  relay_runners: { village: "messengers", level: 2, stat: "help_time", value: 0.2 },
  safe_houses: { village: "messengers", level: 3, stat: "support_rate", value: 0.15 },
};
