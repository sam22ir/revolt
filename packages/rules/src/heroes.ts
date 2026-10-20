import { advance } from "./advance.ts";
import type { BaseState, SquadMember } from "./base-state.ts";
import { NO_MODS, type BattleMods } from "./battle.ts";
import {
  DEPUTY_WEIGHT,
  HERO_LEVEL_UP,
  HERO_LEVELS_PER_HALL_LEVEL,
  HEROES,
  LEAD_WEIGHT,
  MAX_HERO_LEVEL,
  MAX_MOD_UNITS,
  MAX_SQUAD,
  type HeroLevelUpCost,
  type HeroSkill,
} from "./data/heroes.ts";
import { replaceHero } from "./hero-progress.ts";
import { isHeroId, type HeroId } from "./hero-id.ts";
import { canAfford, subtractResources } from "./resources.ts";
import { TROOP_IDS, type TroopId } from "./troop-id.ts";

export const HERO_BLOCK_REASONS = [
  "unknown_hero",
  "already_recruited",
  "not_recruited",
  "not_enough_shards",
  "hall_level",
  "max_level",
  "insufficient",
] as const;

export type HeroBlockReason = (typeof HERO_BLOCK_REASONS)[number];

export type HeroResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: HeroBlockReason; readonly state: BaseState };

/** Highest level a hero may reach with the hero hall at `hallLevel`. */
export const heroLevelCap = (hallLevel: number): number => Math.min(MAX_HERO_LEVEL, Math.max(0, hallLevel) * HERO_LEVELS_PER_HALL_LEVEL);

/** Cost to go from `level` to the next, or null at the top level or when not recruited. */
export const levelUpCost = (level: number): HeroLevelUpCost | null => (level < 1 ? null : (HERO_LEVEL_UP[level - 1] ?? null));

/** Whole percent a skill gives a hero of `level`; 0 while locked. */
export const skillPct = (skill: HeroSkill, level: number): number =>
  level < skill.unlockLevel ? 0 : skill.base + skill.perLevel * (level - skill.unlockLevel);

/** Checks recruiting against an already-advanced state. */
export const checkRecruit = (state: BaseState, id: HeroId): HeroBlockReason | null => {
  if (!isHeroId(id)) return "unknown_hero";
  const have = state.heroes[id];
  const def = HEROES[id];
  if (have.level > 0) return "already_recruited";
  if (have.shards < def.recruitShards) return "not_enough_shards";
  if (state.resources.support < def.recruitSupport) return "insufficient";
  return null;
};

/** Spends shards and support to recruit a hero at level 1 (deterministic: no draws yet, see docs/server-dev.md). */
export const recruitHero = (state: BaseState, id: HeroId, now: number): HeroResult => {
  const s = advance(state, now);
  const reason = checkRecruit(s, id);
  if (reason !== null) return { ok: false, reason, state: s };
  const def = HEROES[id];
  const next = replaceHero(s, id, 1, s.heroes[id].shards - def.recruitShards);
  return { ok: true, state: { ...next, resources: { ...next.resources, support: next.resources.support - def.recruitSupport } } };
};

/** Checks a level-up against an already-advanced state. */
export const checkLevelUp = (state: BaseState, id: HeroId): HeroBlockReason | null => {
  if (!isHeroId(id)) return "unknown_hero";
  const have = state.heroes[id];
  if (have.level < 1) return "not_recruited";
  const cost = levelUpCost(have.level);
  if (cost === null || have.level >= MAX_HERO_LEVEL) return "max_level";
  if (have.level >= heroLevelCap(state.levels.hero_hall)) return "hall_level";
  if (have.shards < cost.shards) return "not_enough_shards";
  if (!canAfford(state.resources, cost.resources)) return "insufficient";
  return null;
};

export const levelUpHero = (state: BaseState, id: HeroId, now: number): HeroResult => {
  const s = advance(state, now);
  const reason = checkLevelUp(s, id);
  if (reason !== null) return { ok: false, reason, state: s };
  const have = s.heroes[id];
  const cost = levelUpCost(have.level);
  if (cost === null) return { ok: false, reason: "max_level", state: s };
  const next = replaceHero(s, id, have.level + 1, have.shards - cost.shards);
  return { ok: true, state: { ...next, resources: subtractResources(next.resources, cost.resources) } };
};

/** Heroes away with a march. */
export const busyHeroes = (state: BaseState): ReadonlySet<HeroId> => {
  const busy = new Set<HeroId>();
  for (const m of state.marches) for (const h of m.heroes ?? []) busy.add(h.id);
  return busy;
};

export const SQUAD_BLOCK_REASONS = ["bad_squad", "hero_not_owned", "hero_busy"] as const;
export type SquadBlockReason = (typeof SQUAD_BLOCK_REASONS)[number];

/** Checks a lead-first list of hero ids against an already-advanced state. */
export const checkSquad = (state: BaseState, ids: readonly HeroId[]): SquadBlockReason | null => {
  if (ids.length > MAX_SQUAD || !ids.every(isHeroId) || new Set(ids).size !== ids.length) return "bad_squad";
  if (ids.some((id) => state.heroes[id].level < 1)) return "hero_not_owned";
  const busy = busyHeroes(state);
  if (ids.some((id) => busy.has(id))) return "hero_busy";
  return null;
};

/** The squad as it stands now: ids with their current levels. Frozen onto the march when it leaves. */
export const squadSnapshot = (state: BaseState, ids: readonly HeroId[]): SquadMember[] =>
  ids.map((id) => ({ id, level: state.heroes[id].level }));

/** Hero bonus in half-percent units, before the cap: lead counts double, deputies once. */
export interface ModUnits {
  readonly attack: Readonly<Record<TroopId, number>>;
  readonly hp: Readonly<Record<TroopId, number>>;
  readonly carry: number;
}

export const NO_UNITS: ModUnits = {
  attack: { infantry: 0, scouts: 0, heavy: 0, porters: 0 },
  hp: { infantry: 0, scouts: 0, heavy: 0, porters: 0 },
  carry: 0,
};

/** Whole numbers only, so adding squads (a rally) is exact and independent of order. */
export const heroUnits = (squad: readonly SquadMember[]): ModUnits => {
  const attack: Record<TroopId, number> = { ...NO_UNITS.attack };
  const hp: Record<TroopId, number> = { ...NO_UNITS.hp };
  let carry = 0;
  squad.slice(0, MAX_SQUAD).forEach((member, i) => {
    const def = HEROES[member.id];
    const weight = i === 0 ? LEAD_WEIGHT : DEPUTY_WEIGHT;
    for (const skill of def.skills) {
      const units = skillPct(skill, member.level) * weight;
      if (skill.kind === "attack_pct") attack[def.specialty] += units;
      else if (skill.kind === "hp_pct") hp[def.specialty] += units;
      else carry += units;
    }
  });
  return { attack, hp, carry };
};

export const addUnits = (a: ModUnits, b: ModUnits): ModUnits => ({
  attack: Object.fromEntries(TROOP_IDS.map((id) => [id, a.attack[id] + b.attack[id]])) as Record<TroopId, number>,
  hp: Object.fromEntries(TROOP_IDS.map((id) => [id, a.hp[id] + b.hp[id]])) as Record<TroopId, number>,
  carry: a.carry + b.carry,
});

const toMultiplier = (units: number): number => 1 + Math.min(Math.max(0, units), MAX_MOD_UNITS) / 200;

/** Capped battle multipliers from summed units. */
export const unitsToMods = (u: ModUnits): BattleMods => ({
  attack: Object.fromEntries(TROOP_IDS.map((id) => [id, toMultiplier(u.attack[id])])) as Record<TroopId, number>,
  hp: Object.fromEntries(TROOP_IDS.map((id) => [id, toMultiplier(u.hp[id])])) as Record<TroopId, number>,
  carry: toMultiplier(u.carry),
});

/** Battle multipliers for one march's squad. An empty squad gives exactly `NO_MODS`. */
export const heroMods = (squad: readonly SquadMember[]): BattleMods => (squad.length === 0 ? NO_MODS : unitsToMods(heroUnits(squad)));
