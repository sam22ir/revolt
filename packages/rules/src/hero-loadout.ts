import type { BaseState, MarchHeroes } from "./base-state.ts";
import type { BattleModifier } from "./battle.ts";
import { NO_BATTLE_MODIFIER } from "./battle.ts";
import { HEROES } from "./data/heroes.ts";
import { HERO_LEVEL_EFFECT_STEP, HERO_MIN_DAMAGE_TAKEN } from "./data/hero-progression.ts";
import type { HeroId } from "./hero-id.ts";
import type { SkillDef } from "./data/heroes.ts";
import type { HeroRoster } from "./hero-roster.ts";
import type { TroopId } from "./troop-id.ts";

export const MAX_DEPUTIES = 2;

export const HERO_LOADOUT_BLOCK_REASONS = ["too_many_deputies", "not_owned", "duplicate_hero", "hero_busy"] as const;
export type HeroLoadoutBlockReason = (typeof HERO_LOADOUT_BLOCK_REASONS)[number];

/** Who a march takes: one lead (its command skill counts) and up to two deputies (passives only). */
export interface HeroLoadout {
  readonly lead: HeroId;
  readonly deputies: readonly HeroId[];
}

export const loadoutIds = (loadout: HeroLoadout): readonly HeroId[] => [loadout.lead, ...loadout.deputies];

/** Heroes that are out on a march right now (the marches list is advanced first, so returned heroes are free). */
export const heroesOnMarch = (state: BaseState): ReadonlySet<HeroId> => {
  const busy = new Set<HeroId>();
  for (const m of state.marches) for (const id of m.heroes ? loadoutIds(m.heroes) : []) busy.add(id);
  return busy;
};

/** Checks a loadout against an already-advanced state. */
export const checkLoadout = (state: BaseState, loadout: HeroLoadout): HeroLoadoutBlockReason | null => {
  if (loadout.deputies.length > MAX_DEPUTIES) return "too_many_deputies";
  const ids = loadoutIds(loadout);
  if (new Set(ids).size !== ids.length) return "duplicate_hero";
  if (ids.some((id) => state.heroes.owned[id] === undefined)) return "not_owned";
  const busy = heroesOnMarch(state);
  if (ids.some((id) => busy.has(id))) return "hero_busy";
  return null;
};

/** Freezes the loadout with the levels it has at departure, so a later level-up cannot change a march's battle. */
export const snapshotHeroes = (roster: HeroRoster, loadout: HeroLoadout): MarchHeroes => {
  const levels: Partial<Record<HeroId, number>> = {};
  for (const id of loadoutIds(loadout)) levels[id] = roster.owned[id]?.level ?? 1;
  return { lead: loadout.lead, deputies: [...loadout.deputies], levels };
};

const scaled = (skill: SkillDef, level: number): number => skill.value * (1 + HERO_LEVEL_EFFECT_STEP * (level - 1));

/**
 * The battle modifier for a march's heroes. `attack` raises only the damage of a hero's
 * specialty troops; `damageTaken` cuts what the whole force loses, floored at `HERO_MIN_DAMAGE_TAKEN`.
 * Pure: the same heroes and levels give the same numbers on client and server.
 */
export const heroBattleModifier = (heroes: MarchHeroes | undefined): BattleModifier => {
  if (heroes === undefined) return NO_BATTLE_MODIFIER;
  const attack: Record<TroopId, number> = { infantry: 1, scouts: 1, heavy: 1, porters: 1 };
  let reduction = 0;
  for (const [i, id] of loadoutIds(heroes).entries()) {
    const def = HEROES[id];
    const level = heroes.levels[id] ?? 1;
    const skills = i === 0 ? [def.command, ...def.passives] : [...def.passives];
    for (const skill of skills) {
      if (skill.stat === "attack") attack[def.specialty] += scaled(skill, level);
      else reduction += scaled(skill, level);
    }
  }
  return { attack, damageTaken: Math.max(HERO_MIN_DAMAGE_TAKEN, 1 - reduction) };
};
