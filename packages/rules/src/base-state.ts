import type { BuildingId } from "./building-id.ts";
import { START_LEVELS, START_RESOURCES } from "./data/start.ts";
import type { Resources } from "./resources.ts";

export interface UpgradeJob {
  readonly building: BuildingId;
  readonly toLevel: number;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Epoch ms. */
  readonly endsAt: number;
}

export interface BaseState {
  readonly resources: Resources;
  readonly levels: Readonly<Record<BuildingId, number>>;
  /** One build queue in M1. */
  readonly queue: UpgradeJob | null;
  /** Epoch ms up to which production has been settled. Never moves backwards. */
  readonly lastUpdated: number;
}

export const createBaseState = (now: number): BaseState => ({
  resources: START_RESOURCES,
  levels: START_LEVELS,
  queue: null,
  lastUpdated: now,
});
