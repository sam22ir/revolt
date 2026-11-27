import { advance } from "./advance.ts";
import type { BaseState, MarchOutcome, MarchState } from "./base-state.ts";
import { carryCapacity } from "./battle.ts";
import { CARE_COST, CARE_INFIRMARY_LEVEL, LABOR_MS, LABOR_TROOPS, type NeedKind } from "./data/villages.ts";
import type { World } from "./liberation.ts";
import { startMarch, type MarchBlockReason } from "./march.ts";
import { canAfford, mapResources, subtractResources, ZERO_RESOURCES, type Resources } from "./resources.ts";
import { totalTroops, ZERO_TROOPS, type Troops } from "./troops.ts";
import type { VillageKind } from "./data/villages.ts";
import { helpVillage, needAmount, NO_TRUST, trustAt, trustLevel, type VillageTrust } from "./villages.ts";
import type { LessonId } from "./data/villages.ts";

export const AID_BLOCK_REASONS = [
  "no_such_village",
  "already_helped_today",
  "already_on_the_way",
  "not_this_need",
  "not_enough_carry",
  "insufficient",
  "infirmary_level",
  "labor_troops",
] as const;
export type AidBlockReason = (typeof AID_BLOCK_REASONS)[number];

/** A village as the aid rules need it. */
export interface AidVillage {
  readonly id: string;
  readonly kind: VillageKind;
}

/** What answering `need` carries (paid at departure) and how long the troops stay at the village, at trust level `t`. */
export const aidPlan = (need: NeedKind, t: number): { cost: Resources; stayMs: number } => {
  if (need === "food") return { cost: { ...ZERO_RESOURCES, food: needAmount("food", t) }, stayMs: 0 };
  if (need === "funds") return { cost: { ...ZERO_RESOURCES, funds: needAmount("funds", t) }, stayMs: 0 };
  if (need === "care") return { cost: { ...ZERO_RESOURCES, ...CARE_COST }, stayMs: 0 };
  return { cost: ZERO_RESOURCES, stayMs: need === "labor" ? LABOR_MS : 0 };
};

/** The player's record with a village (nothing yet: no trust). */
export const trustWith = (state: BaseState, villageId: string): VillageTrust => state.villages[villageId] ?? NO_TRUST;

/** The player's trust level with a village at `now`. */
export const trustLevelWith = (state: BaseState, villageId: string, now: number): number => trustLevel(trustAt(trustWith(state, villageId), now));

/**
 * Why an aid march answering `need` with `troops` cannot leave now, or null. Checked against an already-advanced state; `day` is
 * today's village day. Protection is answered by a battle near the village, never by an aid march.
 */
export const checkAid = (state: BaseState, village: AidVillage, need: NeedKind, troops: Troops, day: number, now: number): AidBlockReason | null => {
  if (need === "protection") return "not_this_need";
  if (trustWith(state, village.id).helpedDay === day) return "already_helped_today";
  if (state.marches.some((m) => m.aid?.village === village.id && m.aid.day === day)) return "already_on_the_way";
  const { cost } = aidPlan(need, trustLevelWith(state, village.id, now));
  const load = cost.food + cost.funds + cost.materiel + cost.support;
  if ((need === "food" || need === "funds") && carryCapacity(troops) < load) return "not_enough_carry";
  if (need === "care" && state.levels.infirmary < CARE_INFIRMARY_LEVEL) return "infirmary_level";
  if (need === "labor" && totalTroops(troops) < LABOR_TROOPS) return "labor_troops";
  if (!canAfford(state.resources, cost)) return "insufficient";
  return null;
};

/** Sends an aid march (its id, target, timing and `aid` decided by the map server): the troops leave and the aid's cost is paid now. */
export type AidStartResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: MarchBlockReason | AidBlockReason; readonly state: BaseState };

export const startAid = (state: BaseState, march: Omit<MarchState, "outcome" | "heroes"> & { aid: NonNullable<MarchState["aid"]> }, now: number, world: World): AidStartResult => {
  const s = advance(state, now, world);
  if (!canAfford(s.resources, march.aid.cost)) return { ok: false, reason: "insufficient", state: s };
  const r = startMarch(s, march, now, world);
  return r.ok ? { ok: true, state: { ...r.state, resources: subtractResources(r.state.resources, march.aid.cost) } } : r;
};


/**
 * Credits one answered need to the player at `at` (the aid march's arrival, or the battle that protected the village): trust rises,
 * and every trust level reached for the first time teaches its lesson. Unchanged when the village was already helped that day.
 */
export const recordHelp = (state: BaseState, village: AidVillage, day: number, at: number): { state: BaseState; credited: boolean; taught: readonly LessonId[] } => {
  const r = helpVillage(trustWith(state, village.id), village.kind, at, day);
  if (!r.ok) return { state, credited: false, taught: [] };
  const lessonsTaught = [...state.lessonsTaught, ...r.taught.filter((id) => !state.lessonsTaught.includes(id))];
  return { state: { ...state, villages: { ...state.villages, [village.id]: r.record }, lessonsTaught }, credited: true, taught: r.taught };
};

/** What an aid march brings home: everyone unharmed, and the goods back if the village was already helped (nothing is wasted). */
export const aidOutcome = (troops: Troops, cost: Resources, credited: boolean): MarchOutcome => ({
  result: "victory",
  survivors: troops,
  wounded: ZERO_TROOPS,
  lost: ZERO_TROOPS,
  loot: credited ? ZERO_RESOURCES : mapResources((id) => cost[id]),
});
