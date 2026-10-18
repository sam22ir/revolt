import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import type { BuildingId } from "./building-id.ts";
import { BUILDINGS, MAX_BUILDING_LEVEL } from "./data/buildings.ts";
import { canAfford, subtractResources, type Resources } from "./resources.ts";

export const UPGRADE_BLOCK_REASONS = ["queue_busy", "max_level", "hq_gate", "insufficient"] as const;

export type UpgradeBlockReason = (typeof UPGRADE_BLOCK_REASONS)[number];

export interface UpgradeQuote {
  readonly toLevel: number;
  readonly cost: Resources;
  readonly durationMs: number;
}

export type UpgradeCheck =
  | ({ readonly ok: true } & UpgradeQuote)
  | ({ readonly ok: false; readonly reason: UpgradeBlockReason } & Partial<UpgradeQuote>);

export type UpgradeResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: UpgradeBlockReason; readonly state: BaseState };

/** Cost and duration of the next level, or null at max level. */
export const nextLevelQuote = (building: BuildingId, currentLevel: number): UpgradeQuote | null => {
  const toLevel = currentLevel + 1;
  const row = BUILDINGS[building].levels[toLevel - 1];
  if (toLevel > MAX_BUILDING_LEVEL || row === undefined) return null;
  return { toLevel, cost: row.cost, durationMs: row.durationSec * 1000 };
};

/** Checks an upgrade against an already-advanced state. */
export const checkUpgrade = (state: BaseState, building: BuildingId): UpgradeCheck => {
  const quote = nextLevelQuote(building, state.levels[building]);
  if (quote === null) return { ok: false, reason: "max_level" };
  if (state.queue !== null) return { ok: false, reason: "queue_busy", ...quote };
  // Gated by the HQ's current level, not a level it may be upgrading to.
  if (building !== "hq" && quote.toLevel > state.levels.hq) return { ok: false, reason: "hq_gate", ...quote };
  if (!canAfford(state.resources, quote.cost)) return { ok: false, reason: "insufficient", ...quote };
  return { ok: true, ...quote };
};

export const startUpgrade = (state: BaseState, building: BuildingId, now: number): UpgradeResult => {
  const s = advance(state, now);
  const check = checkUpgrade(s, building);
  if (!check.ok) return { ok: false, reason: check.reason, state: s };
  // If the clock went backwards, `s.lastUpdated` is the latest time we trust.
  const startedAt = s.lastUpdated;
  return {
    ok: true,
    state: {
      ...s,
      resources: subtractResources(s.resources, check.cost),
      queue: { building, toLevel: check.toLevel, startedAt, endsAt: startedAt + check.durationMs },
    },
  };
};

export const remainingMs = (state: BaseState, now: number): number =>
  state.queue === null ? 0 : Math.max(0, state.queue.endsAt - now);
