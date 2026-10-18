import type { TroopId } from "../troop-id.ts";
import type { Resources } from "../resources.ts";

export interface TroopDef {
  /** Only tier 1 exists in M3; tiers 2–5 come with research (GDD §4.3). */
  readonly tier: number;
  /** Cost to train one unit. */
  readonly cost: Resources;
  readonly trainSecPerUnit: number;
  readonly attack: number;
  readonly hp: number;
  /** Map tiles per minute. A march moves at its slowest unit's speed. */
  readonly speed: number;
  /** Resources one surviving unit carries home. */
  readonly carry: number;
  /** The type this one deals bonus damage to (the counter triangle), or null. */
  readonly counters: TroopId | null;
}

const c = (food: number, materiel: number, funds: number): Resources => ({ food, materiel, funds, support: 0 });

// Placeholder balance for M3: round numbers, to be tuned.
export const TROOPS: Readonly<Record<TroopId, TroopDef>> = {
  infantry: { tier: 1, cost: c(20, 10, 5), trainSecPerUnit: 6, attack: 10, hp: 30, speed: 2, carry: 10, counters: "scouts" },
  scouts: { tier: 1, cost: c(15, 15, 5), trainSecPerUnit: 5, attack: 8, hp: 20, speed: 4, carry: 5, counters: "heavy" },
  heavy: { tier: 1, cost: c(30, 30, 10), trainSecPerUnit: 10, attack: 14, hp: 45, speed: 1, carry: 15, counters: "infantry" },
  porters: { tier: 1, cost: c(10, 0, 10), trainSecPerUnit: 4, attack: 0, hp: 15, speed: 1.5, carry: 60, counters: null },
};

/** Damage multiplier against the countered type. */
export const COUNTER_BONUS = 1.5;

/** Units one training batch may hold, per barracks level. */
export const TRAINING_BATCH_PER_LEVEL = 20;

/** Share of killed attackers that are lost; the rest come home wounded (GDD §4.3: mostly wounded). */
export const LOST_SHARE = 0.2;

export const MAX_BATTLE_ROUNDS = 4;
