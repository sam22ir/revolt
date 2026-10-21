import { advance } from "./advance.ts";
import type { BaseState, MapPoint, MarchOutcome, MarchState } from "./base-state.ts";
import { MAX_MARCHES } from "./data/map.ts";
import { TROOPS } from "./data/troops.ts";
import { checkLoadout, HERO_LOADOUT_BLOCK_REASONS, type HeroLoadout, snapshotHeroes } from "./hero-loadout.ts";
import { COMBAT_TROOP_IDS, TROOP_IDS } from "./troop-id.ts";
import { hasTroops, subtractTroops, type Troops } from "./troops.ts";

export const MARCH_BLOCK_REASONS = [
  "no_troops",
  "not_enough_troops",
  "too_many_marches",
  "rally_only",
  ...HERO_LOADOUT_BLOCK_REASONS,
] as const;

export type MarchBlockReason = (typeof MARCH_BLOCK_REASONS)[number];

export type MarchStartResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: MarchBlockReason; readonly state: BaseState };

export const tileDistance = (a: MapPoint, b: MapPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Tiles per minute of the slowest unit sent; 0 if nothing is sent. */
export const marchSpeed = (troops: Troops): number => {
  let speed = Infinity;
  for (const id of TROOP_IDS) if (troops[id] > 0) speed = Math.min(speed, TROOPS[id].speed);
  return speed === Infinity ? 0 : speed;
};

/** One-way travel time in whole milliseconds; at least one second. */
export const travelMs = (from: MapPoint, to: MapPoint, troops: Troops): number => {
  const speed = marchSpeed(troops);
  if (speed === 0) return Infinity;
  return Math.max(1000, Math.ceil((tileDistance(from, to) / speed) * 60_000));
};

export interface MarchTiming {
  readonly departAt: number;
  readonly arriveAt: number;
  readonly returnAt: number;
}

/** Leaves at `now`, fights on arrival, comes back the same way at the same speed. */
export const planMarch = (from: MapPoint, to: MapPoint, troops: Troops, now: number): MarchTiming => {
  const leg = travelMs(from, to, troops);
  return { departAt: now, arriveAt: now + leg, returnAt: now + 2 * leg };
};

/** Checks a march against an already-advanced state. `loadout` is the heroes it takes, if any. */
export const checkMarch = (state: BaseState, troops: Troops, loadout: HeroLoadout | null = null): MarchBlockReason | null => {
  if (!COMBAT_TROOP_IDS.some((id) => troops[id] > 0)) return "no_troops";
  if (!hasTroops(state.troops, troops)) return "not_enough_troops";
  if (state.marches.length >= MAX_MARCHES) return "too_many_marches";
  return loadout === null ? null : checkLoadout(state, loadout);
};

/**
 * Sends `march` (its id, target and timing decided by the map server) at `now`, with the heroes
 * in `loadout` if any: its troops leave home until it returns, and the heroes stay out with it.
 */
export const startMarch = (
  state: BaseState,
  march: Omit<MarchState, "outcome" | "heroes">,
  now: number,
  loadout: HeroLoadout | null = null,
): MarchStartResult => {
  const s = advance(state, now);
  const reason = checkMarch(s, march.troops, loadout);
  if (reason !== null) return { ok: false, reason, state: s };
  const heroes = loadout === null ? undefined : snapshotHeroes(s.heroes, loadout);
  const entry: MarchState = { ...march, ...(heroes === undefined ? {} : { heroes }), outcome: null };
  return { ok: true, state: { ...s, troops: subtractTroops(s.troops, march.troops), marches: [...s.marches, entry] } };
};

/**
 * Records the battle outcome on the march. Idempotent: a march that is gone or already
 * has an outcome is left alone (`changed: false`).
 */
export const settleMarch = (state: BaseState, marchId: string, outcome: MarchOutcome): { state: BaseState; changed: boolean } => {
  const i = state.marches.findIndex((m) => m.id === marchId);
  const m = state.marches[i];
  if (m === undefined || m.outcome !== null) return { state, changed: false };
  const marches = [...state.marches];
  marches[i] = { ...m, outcome };
  return { state: { ...state, marches }, changed: true };
};
