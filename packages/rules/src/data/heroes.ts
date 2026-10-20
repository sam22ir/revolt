import type { HeroId } from "../hero-id.ts";
import type { Resources } from "../resources.ts";
import type { TroopId } from "../troop-id.ts";

export const HERO_RARITIES = ["common", "rare", "legendary"] as const;
export type HeroRarity = (typeof HERO_RARITIES)[number];

/** What a skill improves. Attack and hp apply to the hero's specialty troop type; carry to every unit. */
export const SKILL_KINDS = ["attack_pct", "hp_pct", "carry_pct"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

export interface HeroSkill {
  /** The command skill is there from level 1; passives unlock at higher levels. */
  readonly slot: "command" | "passive";
  readonly kind: SkillKind;
  readonly unlockLevel: number;
  /** Whole percent at `unlockLevel`. */
  readonly base: number;
  /** Whole percent gained per hero level above `unlockLevel`. */
  readonly perLevel: number;
}

export interface HeroDef {
  readonly rarity: HeroRarity;
  /** The combat troop type this hero commands best. */
  readonly specialty: TroopId;
  /** Shards to recruit (spent), plus popular support (GDD §2.3). */
  readonly recruitShards: number;
  readonly recruitSupport: number;
  /** One command skill and two passives. */
  readonly skills: readonly HeroSkill[];
}

export const MAX_HERO_LEVEL = 10;

/** A hero's level is capped at this many levels per hero hall level. */
export const HERO_LEVELS_PER_HALL_LEVEL = 2;

/** One lead hero plus up to two deputies (GDD §4.4). */
export const MAX_SQUAD = 3;

/** Deputies lend half of what the lead does. Weights are in halves so sums stay whole numbers. */
export const LEAD_WEIGHT = 2;
export const DEPUTY_WEIGHT = 1;

/** Most a march (or a whole rally) can gain from heroes, in half-percent units: 100 = +50%. */
export const MAX_MOD_UNITS = 100;

export interface HeroLevelUpCost {
  readonly shards: number;
  readonly resources: Resources;
}

const r = (food: number, materiel: number, funds: number): Resources => ({ food, materiel, funds, support: 0 });

/** Placeholder balance for M5. Row `i` is the cost to go from level `i + 1` to `i + 2`. */
export const HERO_LEVEL_UP: readonly HeroLevelUpCost[] = [
  { shards: 5, resources: r(50, 50, 50) },
  { shards: 10, resources: r(100, 100, 100) },
  { shards: 15, resources: r(200, 200, 200) },
  { shards: 25, resources: r(400, 400, 400) },
  { shards: 40, resources: r(700, 700, 700) },
  { shards: 60, resources: r(1100, 1100, 1100) },
  { shards: 90, resources: r(1700, 1700, 1700) },
  { shards: 130, resources: r(2600, 2600, 2600) },
  { shards: 190, resources: r(4000, 4000, 4000) },
];

/** Shards the lead hero finds on a victorious return, by target NPC level. Row `i` is level `i + 1`. Placeholder. */
export const NPC_SHARD_DROP: readonly number[] = [2, 4, 8, 16];

/** Largest shard count kept per hero; keeps arithmetic far from float precision limits. */
export const MAX_HERO_SHARDS = 1_000_000;

const skill = (slot: HeroSkill["slot"], kind: SkillKind, unlockLevel: number, base: number, perLevel: number): HeroSkill => ({
  slot,
  kind,
  unlockLevel,
  base,
  perLevel,
});

// Placeholder balance for M5; roles only, no real people (GDD §6).
export const HEROES: Readonly<Record<HeroId, HeroDef>> = {
  courier: {
    rarity: "common",
    specialty: "scouts",
    recruitShards: 10,
    recruitSupport: 20,
    skills: [skill("command", "attack_pct", 1, 6, 1), skill("passive", "carry_pct", 3, 4, 1), skill("passive", "hp_pct", 6, 4, 1)],
  },
  medic: {
    rarity: "common",
    specialty: "infantry",
    recruitShards: 10,
    recruitSupport: 20,
    skills: [skill("command", "hp_pct", 1, 6, 1), skill("passive", "attack_pct", 3, 3, 1), skill("passive", "carry_pct", 6, 3, 1)],
  },
  organizer: {
    rarity: "rare",
    specialty: "infantry",
    recruitShards: 20,
    recruitSupport: 40,
    skills: [skill("command", "attack_pct", 1, 8, 1), skill("passive", "hp_pct", 3, 5, 1), skill("passive", "carry_pct", 6, 4, 1)],
  },
  quartermaster: {
    rarity: "rare",
    specialty: "heavy",
    recruitShards: 20,
    recruitSupport: 40,
    skills: [skill("command", "carry_pct", 1, 10, 2), skill("passive", "hp_pct", 3, 5, 1), skill("passive", "attack_pct", 6, 4, 1)],
  },
  mountain_guide: {
    rarity: "rare",
    specialty: "scouts",
    recruitShards: 20,
    recruitSupport: 40,
    skills: [skill("command", "attack_pct", 1, 8, 1), skill("passive", "carry_pct", 3, 5, 1), skill("passive", "hp_pct", 6, 5, 1)],
  },
  field_commander: {
    rarity: "legendary",
    specialty: "heavy",
    recruitShards: 40,
    recruitSupport: 80,
    skills: [skill("command", "attack_pct", 1, 10, 2), skill("passive", "hp_pct", 3, 6, 1), skill("passive", "carry_pct", 6, 5, 1)],
  },
};
