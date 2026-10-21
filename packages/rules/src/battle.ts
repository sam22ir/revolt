import { COUNTER_BONUS, LOST_SHARE, MAX_BATTLE_ROUNDS, TROOPS } from "./data/troops.ts";
import { RESOURCE_IDS } from "./resource-id.ts";
import { mapResources, ZERO_RESOURCES, type Resources } from "./resources.ts";
import { seededRng } from "./rng.ts";
import { COMBAT_TROOP_IDS, TROOP_IDS, type TroopId } from "./troop-id.ts";
import { mapTroops, subtractTroops, totalTroops, ZERO_TROOPS, type Troops } from "./troops.ts";

export interface BattleRound {
  /** Units of each side killed in this round. */
  readonly attackerKilled: Troops;
  readonly defenderKilled: Troops;
}

export interface BattleResult {
  readonly victory: boolean;
  readonly rounds: readonly BattleRound[];
  /** Attacking units killed, split into wounded (come home) and lost. */
  readonly attackerWounded: Troops;
  readonly attackerLost: Troops;
  readonly attackerSurvivors: Troops;
  readonly defenderKilled: Troops;
  /** Loot carried home; zero unless victorious. */
  readonly loot: Resources;
}

/**
 * Hero effects on one side of a battle. `attack` multiplies each troop type's damage (1 = none);
 * `damageTaken` multiplies the damage this side takes (1 = none). Built by `heroBattleModifier`.
 */
export interface BattleModifier {
  readonly attack: Readonly<Record<TroopId, number>>;
  readonly damageTaken: number;
}

export const NO_BATTLE_MODIFIER: BattleModifier = {
  attack: { infantry: 1, scouts: 1, heavy: 1, porters: 1 },
  damageTaken: 1,
};

/** Damage multiplier of `from` against a whole force: the counter bonus, weighted by how much of `to` it counters. */
export const counterFactor = (from: TroopId, to: Troops): number => {
  const total = totalTroops(to);
  const countered = TROOPS[from].counters;
  if (total === 0 || countered === null) return 1;
  return 1 + (COUNTER_BONUS - 1) * (to[countered] / total);
};

/** One side's damage this round. Draws exactly one random number per troop type, in `TROOP_IDS` order. */
const damage = (from: Troops, to: Troops, rng: () => number, attack: BattleModifier["attack"]): number => {
  let sum = 0;
  for (const id of TROOP_IDS) {
    const roll = 0.9 + 0.2 * rng();
    sum += from[id] * TROOPS[id].attack * attack[id] * counterFactor(id, to) * roll;
  }
  return sum;
};

/** Spreads damage over a force by unit share; kills are floored and never exceed what is there. */
const kills = (dmg: number, to: Troops): Troops => {
  const total = totalTroops(to);
  if (total === 0) return ZERO_TROOPS;
  return mapTroops((id) => Math.min(to[id], Math.floor((dmg * (to[id] / total)) / TROOPS[id].hp)));
};

const hasCombat = (t: Troops): boolean => COMBAT_TROOP_IDS.some((id) => t[id] > 0);

const carryCapacity = (t: Troops): number => TROOP_IDS.reduce((n, id) => n + t[id] * TROOPS[id].carry, 0);

/** Loot up to `capacity`, scaled evenly across resources and floored. */
export const takeLoot = (available: Resources, capacity: number): Resources => {
  const total = RESOURCE_IDS.reduce((n, id) => n + available[id], 0);
  if (total <= 0 || capacity <= 0) return ZERO_RESOURCES;
  const scale = Math.min(1, capacity / total);
  return mapResources((id) => Math.floor(available[id] * scale));
};

/**
 * Deterministic battle: same forces and seed, same result, on client and server (GDD §4.6).
 * Up to MAX_BATTLE_ROUNDS simultaneous rounds. The attacker wins only by clearing every defender.
 * `attackerModifier` (hero effects) changes numbers only, never the random draws.
 */
export const resolveBattle = (
  attacker: Troops,
  defender: Troops,
  available: Resources,
  seed: number,
  attackerModifier: BattleModifier = NO_BATTLE_MODIFIER,
): BattleResult => {
  const rng = seededRng(seed);
  let a = attacker;
  let d = defender;
  const rounds: BattleRound[] = [];
  for (let r = 0; r < MAX_BATTLE_ROUNDS && hasCombat(a) && totalTroops(d) > 0; r++) {
    const toDefender = damage(a, d, rng, attackerModifier.attack);
    const toAttacker = damage(d, a, rng, NO_BATTLE_MODIFIER.attack) * attackerModifier.damageTaken;
    const defenderKilled = kills(toDefender, d);
    const attackerKilled = kills(toAttacker, a);
    a = subtractTroops(a, attackerKilled);
    d = subtractTroops(d, defenderKilled);
    rounds.push({ attackerKilled, defenderKilled });
  }
  const killed = subtractTroops(attacker, a);
  const attackerLost = mapTroops((id) => Math.floor(killed[id] * LOST_SHARE));
  const victory = totalTroops(d) === 0 && totalTroops(a) > 0;
  return {
    victory,
    rounds,
    attackerWounded: subtractTroops(killed, attackerLost),
    attackerLost,
    attackerSurvivors: a,
    defenderKilled: subtractTroops(defender, d),
    loot: victory ? takeLoot(available, carryCapacity(a)) : ZERO_RESOURCES,
  };
};
