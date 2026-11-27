import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { HEAL_BATCH_PER_LEVEL, HEAL_COST_SHARE, HEAL_TIME_SHARE, TROOPS } from "./data/troops.ts";
import type { World } from "./liberation.ts";
import { canAfford, mapResources, subtractResources, type Resources, ZERO_RESOURCES } from "./resources.ts";
import { RESOURCE_IDS } from "./resource-id.ts";
import { TROOP_IDS, type TroopId } from "./troop-id.ts";
import { subtractTroops, totalTroops, ZERO_TROOPS, type Troops } from "./troops.ts";

export const HEALING_BLOCK_REASONS = ["infirmary_busy", "no_wounded", "insufficient"] as const;
export type HealingBlockReason = (typeof HEALING_BLOCK_REASONS)[number];

export type HealingResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: HealingBlockReason; readonly state: BaseState };

/** Most wounded one batch can hold at this infirmary level. */
export const maxHealingBatch = (infirmaryLevel: number): number => Math.max(0, Math.floor(infirmaryLevel)) * HEAL_BATCH_PER_LEVEL;

/** What healing one unit of each type costs: a share of training it, rounded up so it is never free. */
const unitCost = (troop: (typeof TROOP_IDS)[number]): Resources => mapResources((id) => Math.ceil(TROOPS[troop].cost[id] * HEAL_COST_SHARE));

/** The cost and time of healing exactly `troops`. */
export const healingQuote = (troops: Troops): { cost: Resources; durationMs: number } => {
  let cost = ZERO_RESOURCES;
  let ms = 0;
  for (const id of TROOP_IDS) {
    const n = troops[id];
    if (n <= 0) continue;
    const per = unitCost(id);
    cost = mapResources((r) => cost[r] + per[r] * n);
    ms += Math.round(TROOPS[id].trainSecPerUnit * HEAL_TIME_SHARE * 1000) * n;
  }
  return { cost, durationMs: ms };
};

/**
 * The batch a press of Heal takes, from an already-advanced state: wounded in troop order, up to the infirmary's batch size and as
 * many as the resources pay for (a unit at a time). Empty when nobody is wounded or nothing can be paid.
 */
export const planHealing = (state: BaseState): Troops => {
  let room = maxHealingBatch(state.levels.infirmary);
  let left = state.resources;
  const take: Record<TroopId, number> = { ...ZERO_TROOPS };
  for (const id of TROOP_IDS) {
    const per = unitCost(id);
    const affordable = Math.min(...RESOURCE_IDS.map((r) => (per[r] > 0 ? Math.floor(left[r] / per[r]) : Infinity)));
    const n = Math.max(0, Math.min(state.wounded[id], room, affordable));
    if (n === 0) continue;
    take[id] = n;
    room -= n;
    left = subtractResources(left, mapResources((r) => per[r] * n));
  }
  return take;
};

/** Why Heal is off now, or null. Checked against an already-advanced state. */
export const checkHealing = (state: BaseState): HealingBlockReason | null => {
  if (state.healing !== null) return "infirmary_busy";
  if (totalTroops(state.wounded) === 0) return "no_wounded";
  if (totalTroops(planHealing(state)) === 0) return "insufficient";
  return null;
};

/** Starts nursing the batch `planHealing` picks: those wounded leave the wounded list now and come home at the batch's end. */
export const startHealing = (state: BaseState, now: number, world: World): HealingResult => {
  const s = advance(state, now, world);
  const reason = checkHealing(s);
  if (reason !== null) return { ok: false, reason, state: s };
  const troops = planHealing(s);
  const { cost, durationMs } = healingQuote(troops);
  if (!canAfford(s.resources, cost)) return { ok: false, reason: "insufficient", state: s };
  // As for upgrades and training: if the clock went backwards, `s.lastUpdated` is the latest time we trust.
  const startedAt = s.lastUpdated;
  return {
    ok: true,
    state: { ...s, resources: subtractResources(s.resources, cost), wounded: subtractTroops(s.wounded, troops), healing: { troops, startedAt, endsAt: startedAt + durationMs } },
  };
};
