import type { BackgroundId } from "../background.ts";
import type { BuildingId } from "../building-id.ts";
import type { Reward } from "../reward.ts";

/**
 * Daily missions and the beginner quest chain (GDD §4.8). Names and goal texts are i18n keys `mission.<id>` and
 * `quest.<id>`. Placeholder balance: every reward is small, earnable by every player, and fills storage only up to the
 * HQ's cap (GDD §8).
 */

// --- Daily missions --------------------------------------------------------------------------------------------

/** What the server counts toward daily missions. Each count is a row per source (an intent, a battle, a help), never a counter. */
export const MISSION_METRICS = ["upgrades_started", "troops_trained", "npc_victories", "helps_given"] as const;
export type MissionMetric = (typeof MISSION_METRICS)[number];

export const DAILY_MISSION_IDS = ["daily_build", "daily_train", "daily_fight", "daily_help"] as const;
export type DailyMissionId = (typeof DAILY_MISSION_IDS)[number];

export const isDailyMissionId = (v: unknown): v is DailyMissionId => DAILY_MISSION_IDS.some((id) => id === v);

export interface DailyMissionDef {
  readonly metric: MissionMetric;
  /** Count needed today. */
  readonly target: number;
  readonly reward: Reward;
  /** Battle pass XP added to the running season when the mission is claimed. */
  readonly passXp: number;
}

const res = (food: number, materiel: number, funds: number): Reward["resources"] => ({ food, materiel, funds });

export const DAILY_MISSIONS: Readonly<Record<DailyMissionId, DailyMissionDef>> = {
  daily_build: { metric: "upgrades_started", target: 2, reward: { resources: res(200, 200, 300) }, passXp: 30 },
  daily_train: { metric: "troops_trained", target: 20, reward: { resources: res(300, 200, 100) }, passXp: 30 },
  daily_fight: { metric: "npc_victories", target: 3, reward: { resources: res(200, 300, 200), shards: 1 }, passXp: 40 },
  daily_help: { metric: "helps_given", target: 3, reward: { speedupTokens: 1 }, passXp: 30 },
};

/**
 * The daily reset is at local midnight of the background's country, so it does not land mid-afternoon for anyone:
 * Algeria is UTC+1 and Vietnam UTC+7, neither with daylight saving time.
 */
export const DAILY_RESET_OFFSET_MS: Readonly<Record<BackgroundId, number>> = {
  algeria: 1 * 60 * 60_000,
  vietnam: 7 * 60 * 60_000,
};

// --- Beginner quests -------------------------------------------------------------------------------------------

/** A quest's goal, checked against the base (and whether the player is in an alliance), never against a counter. */
export type QuestGoal =
  | { readonly kind: "building_level"; readonly building: BuildingId; readonly level: number }
  | { readonly kind: "troops_total"; readonly count: number }
  | { readonly kind: "heroes_owned"; readonly count: number }
  | { readonly kind: "hero_victories"; readonly count: number }
  | { readonly kind: "chapters_claimed"; readonly count: number }
  | { readonly kind: "in_alliance" };

export const QUEST_IDS = [
  "first_farm",
  "first_armory",
  "first_treasury",
  "first_troops",
  "first_barracks",
  "first_hero",
  "first_victory",
  "first_chapter",
  "first_alliance",
  "first_hq",
] as const;
export type QuestId = (typeof QUEST_IDS)[number];

export const isQuestId = (v: unknown): v is QuestId => QUEST_IDS.some((id) => id === v);

export interface QuestDef {
  readonly goal: QuestGoal;
  readonly reward: Reward;
}

/** In chain order: a quest can be claimed only once every quest before it is claimed. */
export const QUESTS: Readonly<Record<QuestId, QuestDef>> = {
  first_farm: { goal: { kind: "building_level", building: "farm", level: 2 }, reward: { resources: res(300, 200, 200) } },
  first_armory: { goal: { kind: "building_level", building: "armory", level: 2 }, reward: { resources: res(200, 300, 200) } },
  first_treasury: { goal: { kind: "building_level", building: "treasury", level: 2 }, reward: { resources: res(200, 200, 300) } },
  first_troops: { goal: { kind: "troops_total", count: 20 }, reward: { resources: res(400, 200, 0) } },
  first_barracks: { goal: { kind: "building_level", building: "barracks", level: 2 }, reward: { resources: res(300, 400, 300) } },
  first_hero: { goal: { kind: "heroes_owned", count: 1 }, reward: { resources: res(300, 300, 300) } },
  first_victory: { goal: { kind: "hero_victories", count: 1 }, reward: { resources: res(400, 400, 200), shards: 2 } },
  first_chapter: { goal: { kind: "chapters_claimed", count: 1 }, reward: { resources: res(400, 400, 400) } },
  first_alliance: { goal: { kind: "in_alliance" }, reward: { speedupTokens: 2 } },
  first_hq: { goal: { kind: "building_level", building: "hq", level: 3 }, reward: { resources: res(600, 600, 600), speedupTokens: 2 } },
};
