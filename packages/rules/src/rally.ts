import type { MapPoint, MarchOutcome, SquadMember } from "./base-state.ts";
import { RALLY_GATHER_OPTIONS_MS, RALLY_SPEED } from "./data/alliance.ts";
import { addUnits, heroUnits, NO_UNITS, unitsToMods } from "./heroes.ts";
import { fightNpc } from "./npc-battle.ts";
import { RESOURCE_IDS } from "./resource-id.ts";
import { mapResources } from "./resources.ts";
import { TROOPS } from "./data/troops.ts";
import { TROOP_IDS, type TroopId } from "./troop-id.ts";
import { addTroops, mapTroops, ZERO_TROOPS, type Troops } from "./troops.ts";
import { tileDistance, type MarchTiming } from "./march.ts";

export const isGatherOption = (ms: unknown): ms is number => RALLY_GATHER_OPTIONS_MS.some((g) => g === ms);

/** The rally leaves for the target once the gathering ends, at the fixed rally speed, and returns the same way. */
export const rallyTiming = (from: MapPoint, to: MapPoint, gatherUntil: number): MarchTiming => {
  const leg = Math.max(1000, Math.ceil((tileDistance(from, to) / RALLY_SPEED) * 60_000));
  return { departAt: gatherUntil, arriveAt: gatherUntil + leg, returnAt: gatherUntil + 2 * leg };
};

export interface RallyParticipant {
  /** Any stable id; participants are ordered by it so splits do not depend on join order. */
  readonly id: string;
  readonly troops: Troops;
  /** The heroes this participant's march carries (levels as frozen at send time). */
  readonly heroes?: readonly SquadMember[];
}

export interface RallyShare {
  readonly id: string;
  readonly outcome: MarchOutcome;
}

/**
 * Splits `total` over `weights` in whole units, summing exactly to `total`: each gets the floor of its
 * proportional share, and the leftover units go to the largest remainders (ties by position).
 * All integer arithmetic below 2^53 for the sizes used (counts ≤ 1e6).
 */
export const apportion = (total: number, weights: readonly number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const parts = weights.map((w, i) => ({ i, floor: Math.floor((total * w) / sum), rem: (total * w) % sum }));
  let left = total - parts.reduce((a, p) => a + p.floor, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem || a.i - b.i)) {
    if (left <= 0) break;
    if (p.rem > 0) {
      p.floor += 1;
      left -= 1;
    }
  }
  return parts.map((p) => p.floor);
};

const sentOf = (ps: readonly RallyParticipant[], id: TroopId): number[] => ps.map((p) => p.troops[id]);

const carryOf = (t: Troops): number => TROOP_IDS.reduce((n, id) => n + t[id] * TROOPS[id].carry, 0);

/**
 * Shares one battle outcome among the rally's participants. For every participant and troop type,
 * survivors + wounded + lost equals what they sent. Losses are spread by troops sent, wounded by
 * what remains, and loot by the carrying capacity of each participant's survivors.
 */
export const splitOutcome = (outcome: MarchOutcome, participants: readonly RallyParticipant[]): RallyShare[] => {
  const ps = [...participants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lost = new Map<TroopId, number[]>();
  const wounded = new Map<TroopId, number[]>();
  for (const id of TROOP_IDS) {
    const sent = sentOf(ps, id);
    const lostParts = apportion(outcome.lost[id], sent);
    lost.set(id, lostParts);
    wounded.set(id, apportion(outcome.wounded[id], sent.map((s, i) => s - (lostParts[i] ?? 0))));
  }
  const shares = ps.map((p, i) => {
    const l = mapTroops((id) => lost.get(id)?.[i] ?? 0);
    const w = mapTroops((id) => wounded.get(id)?.[i] ?? 0);
    const survivors = mapTroops((id) => p.troops[id] - l[id] - w[id]);
    return { id: p.id, survivors, wounded: w, lost: l };
  });
  const weights = shares.map((s) => carryOf(s.survivors));
  const parts = new Map(RESOURCE_IDS.map((r) => [r, apportion(outcome.loot[r], weights)] as const));
  return shares.map((s, i) => ({
    id: s.id,
    outcome: {
      result: outcome.result,
      survivors: s.survivors,
      wounded: s.wounded,
      lost: s.lost,
      loot: mapResources((r) => parts.get(r)?.[i] ?? 0),
    },
  }));
};

/**
 * One battle for the whole rally against an NPC of `level`, then each participant's share.
 * Every participant's hero bonuses are added up and capped together, so the order of participants does not matter.
 */
export const resolveRally = (participants: readonly RallyParticipant[], level: number, seed: number) => {
  const total = participants.reduce((t, p) => addTroops(t, p.troops), ZERO_TROOPS);
  const units = participants.reduce((u, p) => addUnits(u, heroUnits(p.heroes ?? [])), NO_UNITS);
  const fought = fightNpc(total, level, seed, unitsToMods(units));
  return { total, battle: fought.battle, outcome: fought.outcome, shares: splitOutcome(fought.outcome, participants) };
};
