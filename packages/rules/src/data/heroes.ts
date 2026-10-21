import type { HeroId, HeroRarity, HeroSpecialty, SkillId } from "../hero-id.ts";

/** What a skill does. `attack` raises damage of the hero's specialty troops; `defense` cuts damage taken by the whole force. */
export interface SkillDef {
  readonly id: SkillId;
  readonly stat: "attack" | "defense";
  /** Fraction at level 1, e.g. 0.15 is +15% attack or 15% less damage taken. */
  readonly value: number;
}

export interface HeroDef {
  readonly rarity: HeroRarity;
  readonly specialty: HeroSpecialty;
  /** Used only while the hero leads a march. */
  readonly command: SkillDef;
  /** Used by the lead and by deputies. */
  readonly passives: readonly [SkillDef, SkillDef];
}

// Placeholder roster: two common, one rare, one legendary (GDD §4.4). Ids and numbers only.
export const HEROES: Readonly<Record<HeroId, HeroDef>> = {
  mountain_guide: {
    rarity: "common",
    specialty: "scouts",
    command: { id: "ridge_signal", stat: "attack", value: 0.15 },
    passives: [
      { id: "night_march", stat: "defense", value: 0.05 },
      { id: "local_knowledge", stat: "attack", value: 0.05 },
    ],
  },
  dock_foreman: {
    rarity: "common",
    specialty: "infantry",
    command: { id: "crowd_rush", stat: "attack", value: 0.15 },
    passives: [
      { id: "union_discipline", stat: "defense", value: 0.05 },
      { id: "steady_hands", stat: "attack", value: 0.05 },
    ],
  },
  iron_quartermaster: {
    rarity: "rare",
    specialty: "heavy",
    command: { id: "breach_charge", stat: "attack", value: 0.25 },
    passives: [
      { id: "shield_wall", stat: "defense", value: 0.08 },
      { id: "heavy_stock", stat: "attack", value: 0.05 },
    ],
  },
  hill_commander: {
    rarity: "legendary",
    specialty: "infantry",
    command: { id: "last_stand", stat: "attack", value: 0.35 },
    passives: [
      { id: "iron_line", stat: "defense", value: 0.1 },
      { id: "veteran_drill", stat: "attack", value: 0.1 },
    ],
  },
  // Vietnam's roster (M6): the same shape and balance as the Algeria roster, role for role. Roles only, no real people.
  trail_scout: {
    rarity: "common",
    specialty: "scouts",
    command: { id: "jungle_signal", stat: "attack", value: 0.15 },
    passives: [
      { id: "paddy_cover", stat: "defense", value: 0.05 },
      { id: "tunnel_sense", stat: "attack", value: 0.05 },
    ],
  },
  field_medic: {
    rarity: "common",
    specialty: "infantry",
    command: { id: "stretcher_run", stat: "defense", value: 0.1 },
    passives: [
      { id: "field_dressing", stat: "defense", value: 0.05 },
      { id: "calm_under_fire", stat: "attack", value: 0.05 },
    ],
  },
  porter_chief: {
    rarity: "rare",
    specialty: "heavy",
    command: { id: "bearer_march", stat: "attack", value: 0.25 },
    passives: [
      { id: "load_sharing", stat: "defense", value: 0.08 },
      { id: "river_crossing", stat: "attack", value: 0.05 },
    ],
  },
  column_commander: {
    rarity: "legendary",
    specialty: "infantry",
    command: { id: "forward_command", stat: "attack", value: 0.35 },
    passives: [
      { id: "dug_in", stat: "defense", value: 0.1 },
      { id: "campaign_drill", stat: "attack", value: 0.1 },
    ],
  },
};
