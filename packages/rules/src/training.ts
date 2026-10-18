import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { TRAINING_BATCH_PER_LEVEL, TROOPS } from "./data/troops.ts";
import { canAfford, mapResources, subtractResources, type Resources } from "./resources.ts";
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

/** Largest batch the barracks at `level` can train at once. */
export const maxTrainingBatch = (barracksLevel: number): number => barracksLevel * TRAINING_BATCH_PER_LEVEL;

export const trainingQuote = (troop: TroopId, count: number): TrainingQuote => {
  const def = TROOPS[troop];
  return { cost: mapResources((id) => def.cost[id] * count), durationMs: def.trainSecPerUnit * 1000 * count };
};

/** Checks a training batch against an already-advanced state. */
export const checkTraining = (state: BaseState, troop: TroopId, count: number): TrainingBlockReason | null => {
  if (!Number.isInteger(count) || count < 1 || count > maxTrainingBatch(state.levels.barracks)) return "bad_count";
  if (state.training !== null) return "training_busy";
  // Tier N needs barracks level N; only tier 1 exists in M3.
  if (state.levels.barracks < TROOPS[troop].tier) return "barracks_level";
  if (!canAfford(state.resources, trainingQuote(troop, count).cost)) return "insufficient";
  return null;
};

export const startTraining = (state: BaseState, troop: TroopId, count: number, now: number): TrainingResult => {
  const s = advance(state, now);
  const reason = checkTraining(s, troop, count);
  if (reason !== null) return { ok: false, reason, state: s };
  const { cost, durationMs } = trainingQuote(troop, count);
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
