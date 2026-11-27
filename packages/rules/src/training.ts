import type { World } from "./liberation.ts";
import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { TRAINING_BATCH_PER_LEVEL, TROOPS } from "./data/troops.ts";
import { canAfford, mapResources, subtractResources, type Resources } from "./resources.ts";
import { lessonBonus } from "./effects.ts";
import type { TroopId } from "./troop-id.ts";

export const TRAINING_BLOCK_REASONS = ["training_busy", "barracks_level", "bad_count", "insufficient"] as const;

export type TrainingBlockReason = (typeof TRAINING_BLOCK_REASONS)[number];

export interface TrainingQuote {
  readonly cost: Resources;
  readonly durationMs: number;
}

export type TrainingResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: TrainingBlockReason; readonly state: BaseState };

/** What the smiths' lessons change in training: shares off the cost and the time, and a share more in a batch. */
export interface TrainingLessons {
  readonly cost: number;
  readonly time: number;
  readonly batch: number;
}

export const NO_TRAINING_LESSONS: TrainingLessons = { cost: 0, time: 0, batch: 0 };

export const trainingLessons = (state: Pick<BaseState, "lessons">): TrainingLessons => ({
  cost: lessonBonus(state, "train_cost"),
  time: lessonBonus(state, "train_time"),
  batch: lessonBonus(state, "train_batch"),
});

/** Largest batch the barracks at `level` can train at once (more with the smiths' batch lesson, rounded down). */
export const maxTrainingBatch = (barracksLevel: number, lessons: TrainingLessons = NO_TRAINING_LESSONS): number =>
  Math.floor(barracksLevel * TRAINING_BATCH_PER_LEVEL * (1 + lessons.batch));

/** Cost and time of a batch; with lessons, the cost is rounded up per resource and the time to the whole millisecond. */
export const trainingQuote = (troop: TroopId, count: number, lessons: TrainingLessons = NO_TRAINING_LESSONS): TrainingQuote => {
  const def = TROOPS[troop];
  const costShare = 1 - Math.min(0.9, lessons.cost);
  const timeShare = 1 - Math.min(0.9, lessons.time);
  return {
    cost: mapResources((id) => (lessons.cost > 0 ? Math.ceil(def.cost[id] * count * costShare - 1e-9) : def.cost[id] * count)),
    durationMs: lessons.time > 0 ? Math.round(def.trainSecPerUnit * 1000 * count * timeShare) : def.trainSecPerUnit * 1000 * count,
  };
};

/** Checks a training batch against an already-advanced state. */
export const checkTraining = (state: BaseState, troop: TroopId, count: number): TrainingBlockReason | null => {
  if (!Number.isInteger(count) || count < 1 || count > maxTrainingBatch(state.levels.barracks, trainingLessons(state))) return "bad_count";
  if (state.training !== null) return "training_busy";
  // Tier N needs barracks level N; only tier 1 exists in M3.
  if (state.levels.barracks < TROOPS[troop].tier) return "barracks_level";
  if (!canAfford(state.resources, trainingQuote(troop, count, trainingLessons(state)).cost)) return "insufficient";
  return null;
};

export const startTraining = (state: BaseState, troop: TroopId, count: number, now: number, world: World): TrainingResult => {
  const s = advance(state, now, world);
  const reason = checkTraining(s, troop, count);
  if (reason !== null) return { ok: false, reason, state: s };
  const { cost, durationMs } = trainingQuote(troop, count, trainingLessons(s));
  // As for upgrades: if the clock went backwards, `s.lastUpdated` is the latest time we trust.
  const startedAt = s.lastUpdated;
  return {
    ok: true,
    state: {
      ...s,
      resources: subtractResources(s.resources, cost),
      training: { troop, count, startedAt, endsAt: startedAt + durationMs },
    },
  };
};
