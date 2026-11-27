import type { BackgroundId } from "./background.ts";
import type { BaseState } from "./base-state.ts";
import {
  DAILY_MISSION_IDS,
  DAILY_MISSIONS,
  DAILY_RESET_OFFSET_MS,
  QUEST_IDS,
  QUESTS,
  type DailyMissionId,
  type MissionMetric,
  type QuestGoal,
  type QuestId,
} from "./data/missions.ts";
import { DAY_MS } from "./data/events.ts";
import { totalTroops } from "./troops.ts";

export const MISSION_BLOCK_REASONS = ["unknown_mission", "not_done", "already_claimed", "not_current"] as const;
export type MissionBlockReason = (typeof MISSION_BLOCK_REASONS)[number];

// --- Days ------------------------------------------------------------------------------------------------------

/** The mission day containing `now` for this background: day 0 starts at local midnight of 1 Jan 1970. */
export const missionDay = (now: number, background: BackgroundId): number => Math.floor((now + DAILY_RESET_OFFSET_MS[background]) / DAY_MS);

/** Epoch ms at which mission day `day` starts (and the previous day's missions reset). */
export const missionDayStart = (day: number, background: BackgroundId): number => day * DAY_MS - DAILY_RESET_OFFSET_MS[background];

/** The ledger key a metric's rows are summed under for one day: `daily:<day>:<metric>`. */
export const metricKey = (day: number, metric: MissionMetric): string => `daily:${day}:${metric}`;

/** The one-time claim key of a daily mission on one day. */
export const dailyClaimKey = (day: number, id: DailyMissionId): string => `daily:${day}:${id}`;

export const questClaimKey = (id: QuestId): string => `quest:${id}`;

/** One row the server writes for a counted action. `source` is unique per action, so a retry cannot count twice. */
export interface MissionTick {
  readonly source: string;
  readonly key: string;
  readonly points: number;
}

/** The tick for one counted action at `at`, or null when it counts nothing. */
export const missionTick = (background: BackgroundId, at: number, metric: MissionMetric, source: string, points: number): MissionTick | null => {
  const p = Math.floor(points);
  return p > 0 && Number.isFinite(at) ? { source, key: metricKey(missionDay(at, background), metric), points: p } : null;
};

// --- Daily missions --------------------------------------------------------------------------------------------

export interface DailyMissionStatus {
  readonly id: DailyMissionId;
  readonly metric: MissionMetric;
  readonly target: number;
  /** Today's count, capped at the target. */
  readonly progress: number;
  readonly done: boolean;
  readonly claimed: boolean;
}

/** Today's missions from the day's metric sums and the ids already claimed today. */
export const dailyMissions = (sums: Readonly<Partial<Record<MissionMetric, number>>>, claimed: ReadonlySet<DailyMissionId>): DailyMissionStatus[] =>
  DAILY_MISSION_IDS.map((id) => {
    const def = DAILY_MISSIONS[id];
    const raw = Math.max(0, Math.floor(sums[def.metric] ?? 0));
    return { id, metric: def.metric, target: def.target, progress: Math.min(raw, def.target), done: raw >= def.target, claimed: claimed.has(id) };
  });

/** Why a daily mission cannot be claimed now, or null when it can. */
export const checkDailyClaim = (missions: readonly DailyMissionStatus[], id: unknown): MissionBlockReason | null => {
  const m = missions.find((x) => x.id === id);
  if (m === undefined) return "unknown_mission";
  if (m.claimed) return "already_claimed";
  if (!m.done) return "not_done";
  return null;
};

// --- Beginner quests -------------------------------------------------------------------------------------------

/** What a quest check may look at besides the base. */
export interface QuestContext {
  readonly inAlliance: boolean;
}

/** Troops the player has: at home, plus out on marches (wounded and in training do not count). */
const troopsOwned = (s: BaseState): number => totalTroops(s.troops) + s.marches.reduce((n, m) => n + (m.outcome === null ? totalTroops(m.troops) : totalTroops(m.outcome.survivors)), 0);

/** How far the player is toward a goal, from 0 up to `goalTarget(goal)`. */
export const goalProgress = (goal: QuestGoal, s: BaseState, ctx: QuestContext): number => {
  const raw = (() => {
    switch (goal.kind) {
      case "building_level":
        return s.levels[goal.building];
      case "troops_total":
        return troopsOwned(s);
      case "heroes_owned":
        return Object.keys(s.heroes.owned).length;
      case "hero_victories":
        return s.story.victories;
      case "chapters_claimed":
        return s.story.chapter;
      case "in_alliance":
        return ctx.inAlliance ? 1 : 0;
    }
  })();
  return Math.min(Math.max(0, Math.floor(raw)), goalTarget(goal));
};

export const goalTarget = (goal: QuestGoal): number => {
  switch (goal.kind) {
    case "building_level":
      return goal.level;
    case "troops_total":
    case "heroes_owned":
    case "hero_victories":
    case "chapters_claimed":
      return goal.count;
    case "in_alliance":
      return 1;
  }
};

export interface QuestStatus {
  readonly id: QuestId;
  readonly progress: number;
  readonly target: number;
  readonly done: boolean;
}

/** The first quest not yet claimed, with its progress, or null once the whole chain is claimed. */
export const currentQuest = (s: BaseState, ctx: QuestContext, claimed: ReadonlySet<QuestId>): QuestStatus | null => {
  const id = QUEST_IDS.find((q) => !claimed.has(q));
  if (id === undefined) return null;
  const goal = QUESTS[id].goal;
  const progress = goalProgress(goal, s, ctx);
  const target = goalTarget(goal);
  return { id, progress, target, done: progress >= target };
};

/** Why quest `id` cannot be claimed now, or null when it can. Quests are claimed in chain order. */
export const checkQuestClaim = (s: BaseState, ctx: QuestContext, claimed: ReadonlySet<QuestId>, id: unknown): MissionBlockReason | null => {
  if (!QUEST_IDS.some((q) => q === id)) return "unknown_mission";
  if (claimed.has(id as QuestId)) return "already_claimed";
  const cur = currentQuest(s, ctx, claimed);
  if (cur === null || cur.id !== id) return "not_current";
  return cur.done ? null : "not_done";
};
