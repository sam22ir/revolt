/**
 * Plain-data export for the Godot client, which cannot import this package.
 * Pure: builds JSON-able objects; `scripts/export-godot.mjs` writes them to `apps/godot/data/`
 * and a test fails when the committed files are stale.
 */
import { accrue, productionPerHour, storageCap } from "../production.ts";
import type { BaseState } from "../base-state.ts";
import { createBaseState } from "../base-state.ts";
import { BUILDING_IDS, type BuildingId } from "../building-id.ts";
import { BUILDINGS, MAX_BUILDING_LEVEL } from "../data/buildings.ts";
import { COSMETIC_IDS } from "../data/cosmetics.ts";
import { EVENTS } from "../data/events.ts";
import { HEROES } from "../data/heroes.ts";
import { MAP_SIZE, MARCH_RESCUE_GRACE_MS, MAX_MARCHES, NPC_COUNT_BY_LEVEL, PLACEMENT_SPACING } from "../data/map.ts";
import { NPC_LEVELS, NPC_RESPAWN_MS } from "../data/npcs.ts";
import { PASS_TIERS, PASS_TIER_COUNT } from "../data/battle-pass.ts";
import { START_LEVELS, START_RESOURCES, START_TROOPS } from "../data/start.ts";
import { STORAGE_CAPS } from "../data/storage.ts";
import { PRODUCTS } from "../data/store.ts";
import { STORY } from "../data/story.ts";
import { COUNTER_BONUS, LOST_SHARE, MAX_BATTLE_ROUNDS, TRAINING_BATCH_PER_LEVEL, TROOPS } from "../data/troops.ts";
import { RESOURCE_IDS } from "../resource-id.ts";
import { TROOP_IDS } from "../troop-id.ts";
import type { Resources } from "../resources.ts";

/** Everything the client displays from balance tables. Keyed by mechanical id. */
export const buildGodotBalance = (): unknown => ({
  resourceIds: [...RESOURCE_IDS],
  buildingIds: [...BUILDING_IDS],
  troopIds: [...TROOP_IDS],
  cosmeticIds: [...COSMETIC_IDS],
  maxBuildingLevel: MAX_BUILDING_LEVEL,
  buildings: BUILDINGS,
  storageCaps: STORAGE_CAPS,
  start: { levels: START_LEVELS, resources: START_RESOURCES, troops: START_TROOPS },
  troops: TROOPS,
  trainingBatchPerLevel: TRAINING_BATCH_PER_LEVEL,
  battle: { counterBonus: COUNTER_BONUS, lostShare: LOST_SHARE, maxRounds: MAX_BATTLE_ROUNDS },
  heroes: HEROES,
  npcLevels: NPC_LEVELS,
  npcRespawnMs: NPC_RESPAWN_MS,
  map: {
    size: MAP_SIZE,
    marchRescueGraceMs: MARCH_RESCUE_GRACE_MS,
    maxMarches: MAX_MARCHES,
    npcCountByLevel: NPC_COUNT_BY_LEVEL,
    placementSpacing: PLACEMENT_SPACING,
  },
  story: STORY,
  events: EVENTS,
  passTierCount: PASS_TIER_COUNT,
  passTiers: PASS_TIERS,
  products: PRODUCTS,
});

const HOUR_MS = 3_600_000;
const t0 = 1_700_000_000_000;

const res = (food: number, materiel: number, funds: number, support: number): Resources => ({ food, materiel, funds, support });

const levels = (hq: number, farm: number, armory: number, treasury: number): Record<BuildingId, number> => ({
  ...START_LEVELS,
  hq,
  farm,
  armory,
  treasury,
});

interface DisplayCase {
  readonly name: string;
  /** The slice of `BaseState` the display needs. */
  readonly state: Pick<BaseState, "resources" | "levels" | "lastUpdated">;
  readonly now: number;
}

const CASES: readonly DisplayCase[] = [
  { name: "fresh base, one hour", state: { resources: START_RESOURCES, levels: START_LEVELS, lastUpdated: t0 }, now: t0 + HOUR_MS },
  { name: "no time passed", state: { resources: START_RESOURCES, levels: START_LEVELS, lastUpdated: t0 }, now: t0 },
  { name: "time going backwards keeps the amounts", state: { resources: res(500, 400, 300, 20), levels: START_LEVELS, lastUpdated: t0 }, now: t0 - 5 * HOUR_MS },
  { name: "cap reached on one resource only", state: { resources: res(1990, 100, 100, 10), levels: START_LEVELS, lastUpdated: t0 }, now: t0 + 10 * HOUR_MS },
  { name: "amount above the cap is kept, never clamped down", state: { resources: res(9000, 2500, 2001, 400), levels: START_LEVELS, lastUpdated: t0 }, now: t0 + 3 * HOUR_MS },
  { name: "amount exactly at the cap", state: { resources: res(2000, 2000, 2000, 300), levels: START_LEVELS, lastUpdated: t0 }, now: t0 + HOUR_MS },
  { name: "ten years offline", state: { resources: res(0, 0, 0, 0), levels: levels(4, 3, 3, 3), lastUpdated: t0 }, now: t0 + 10 * 365 * 24 * HOUR_MS },
  { name: "mid levels, fractional hours", state: { resources: res(120.5, 80, 10, 3), levels: levels(5, 6, 4, 7), lastUpdated: t0 }, now: t0 + Math.round(2.37 * HOUR_MS) },
  { name: "max levels", state: { resources: res(1, 2, 3, 4), levels: levels(MAX_BUILDING_LEVEL, MAX_BUILDING_LEVEL, MAX_BUILDING_LEVEL, MAX_BUILDING_LEVEL), lastUpdated: t0 }, now: t0 + 7 * HOUR_MS },
];

/**
 * Golden cases for the client's display math: rate, cap and accrual computed by the real rules.
 * The GDScript test must reproduce `expected` and `rate`/`cap` from `balance.json` alone.
 */
export const buildGodotDisplayFixtures = (): unknown => ({
  cases: CASES.map((c) => {
    const base: BaseState = { ...createBaseState(c.state.lastUpdated), ...c.state };
    return {
      name: c.name,
      resources: c.state.resources,
      levels: c.state.levels,
      lastUpdated: c.state.lastUpdated,
      now: c.now,
      ratePerHour: productionPerHour(c.state.levels),
      cap: storageCap(c.state.levels.hq),
      expected: accrue(base, c.now).resources,
    };
  }),
});
