/**
 * Plain-data export for the Godot client, which cannot import this package.
 * Pure: builds JSON-able objects; `scripts/export-godot.mjs` writes them to `apps/godot/data/`
 * and a test fails when the committed files are stale.
 */
import { accrue, productionPerHour, storageCap } from "../production.ts";
import { LIBERATION_BONUS_CAP, LIBERATION_BONUS_PER_REGION } from "../data/liberation.ts";
import { liberatedCount, productionMultiplier, type Liberation, type World } from "../liberation.ts";
import type { BaseState } from "../base-state.ts";
import { createBaseState } from "../base-state.ts";
import { BUILDING_IDS, type BuildingId } from "../building-id.ts";
import { BUILDINGS, MAX_BUILDING_LEVEL } from "../data/buildings.ts";
import { COSMETIC_IDS } from "../data/cosmetics.ts";
import { EVENTS } from "../data/events.ts";
import { HEROES } from "../data/heroes.ts";
import { MAP_SIZE, MARCH_RESCUE_GRACE_MS, MAX_MARCHES, NPC_COUNT_BY_LEVEL, PLACEMENT_SPACING, REGION_CELL } from "../data/map.ts";
import { hash32 } from "../rng.ts";
import { regionAt, regionSite } from "../regions.ts";
import { terrainAt, valueNoise, type TerrainId } from "../terrain.ts";
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
  liberation: { bonusPerRegion: LIBERATION_BONUS_PER_REGION, bonusCap: LIBERATION_BONUS_CAP },
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
    regionCell: REGION_CELL,
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
  /** The server-wide liberations the snapshot carried. */
  readonly liberations?: readonly Liberation[];
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
  {
    name: "liberation held the whole span",
    state: { resources: res(0, 0, 0, 0), levels: levels(3, 3, 3, 3), lastUpdated: t0 },
    now: t0 + 2 * HOUR_MS,
    liberations: [{ region: 1, from: t0 - HOUR_MS, until: null }],
  },
  {
    name: "liberation starts mid-span",
    state: { resources: res(0, 0, 0, 0), levels: levels(3, 3, 3, 3), lastUpdated: t0 },
    now: t0 + 4 * HOUR_MS,
    liberations: [{ region: 1, from: t0 + HOUR_MS, until: null }, { region: 2, from: t0 + 3 * HOUR_MS, until: null }],
  },
  {
    name: "liberation ends mid-span",
    state: { resources: res(0, 0, 0, 0), levels: levels(3, 3, 3, 3), lastUpdated: t0 },
    now: t0 + 3 * HOUR_MS,
    liberations: [{ region: 1, from: t0 - HOUR_MS, until: t0 + HOUR_MS }],
  },
  {
    name: "time before lastUpdated is never paid retroactively",
    state: { resources: res(10, 10, 10, 1), levels: START_LEVELS, lastUpdated: t0 },
    now: t0 + HOUR_MS,
    liberations: [{ region: 5, from: t0 - 10 * HOUR_MS, until: t0 - 5 * HOUR_MS }],
  },
  {
    name: "same region liberated twice counts once",
    state: { resources: res(0, 0, 0, 0), levels: levels(3, 3, 3, 3), lastUpdated: t0 },
    now: t0 + HOUR_MS,
    liberations: [{ region: 7, from: t0 - 3 * HOUR_MS, until: t0 - HOUR_MS }, { region: 7, from: t0 - 2 * HOUR_MS, until: null }],
  },
  {
    name: "bonus capped at many regions",
    state: { resources: res(0, 0, 0, 0), levels: levels(6, 6, 6, 6), lastUpdated: t0 },
    now: t0 + HOUR_MS,
    liberations: Array.from({ length: 40 }, (_, i): Liberation => ({ region: i, from: t0 - HOUR_MS, until: null })),
  },
];

/**
 * Golden cases for the client's display math, computed by the real rules.
 * The GDScript test must reproduce `expected`, `baseRatePerHour`, `cap` and the multiplier from `balance.json`
 * and the case's `liberations` alone.
 */
export const buildGodotDisplayFixtures = (): unknown => ({
  cases: CASES.map((c) => {
    const base: BaseState = { ...createBaseState(c.state.lastUpdated), ...c.state };
    const world: World = { liberations: c.liberations ?? [] };
    return {
      name: c.name,
      resources: c.state.resources,
      levels: c.state.levels,
      lastUpdated: c.state.lastUpdated,
      now: c.now,
      liberations: world.liberations,
      baseRatePerHour: productionPerHour(c.state.levels, 1),
      cap: storageCap(c.state.levels.hq),
      liberatedCountAtLastUpdated: liberatedCount(world, c.state.lastUpdated),
      multiplierAtLastUpdated: productionMultiplier(world, c.state.lastUpdated),
      expected: accrue(base, c.now, world).resources,
    };
  }),
});

const TERRAIN_LETTER: Readonly<Record<TerrainId, string>> = { plain: "p", hills: "h", forest: "f", mountain: "m" };

/** Seeds include the edges of the unsigned 32-bit range: `seed + 1` and `seed + 7919` wrap there. */
const MAP_SEEDS = [0, 1, 7, 12345, 987654321, 4294967294, 4294967295] as const;

const HASH_INPUTS: readonly (readonly number[])[] = [
  [0],
  [1, 2, 3],
  [12345, 4, 5],
  [4294967295, 63, 63],
  [4294967296, -1, -1],
  [7, -3, 9],
  [987654321 + 7919, 3, 3, 2],
  [4294967295 + 7919, 0, 0, 1],
  [5, 2147483648, 4294967295],
];

const NOISE_SAMPLES: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 8],
  [1, 5, 9, 3],
  [12345, 31, 17, 8],
  [12345, 63, 63, 3],
  [4294967295, 10, 20, 8],
  [4294967295 + 1, 10, 20, 3],
  [7, -5, -2, 8],
];

/**
 * Golden data for the client's port of the seed-derived map math (hash, value noise, terrain, regions).
 * Grids are one character per tile, row-major by y: terrain p/h/f/m, regions as a hex digit.
 */
export const buildGodotMapFixtures = (): unknown => {
  const size = MAP_SIZE;
  const cells = Math.ceil(size / REGION_CELL);
  if (cells * cells > 16) throw new Error("region ids no longer fit one hex digit: change the map fixture encoding");
  return {
    size,
    hash: HASH_INPUTS.map((inputs) => ({ inputs, out: hash32(...inputs) })),
    noise: NOISE_SAMPLES.map(([seed, x, y, cell]) => ({ seed, x, y, cell, out: valueNoise(seed, x, y, cell) })),
    seeds: MAP_SEEDS.map((seed) => {
      const terrain: string[] = [];
      const regions: string[] = [];
      for (let y = 0; y < size; y++) {
        let t = "";
        let r = "";
        for (let x = 0; x < size; x++) {
          t += TERRAIN_LETTER[terrainAt(seed, x, y)];
          r += regionAt(seed, x, y, size).toString(16);
        }
        terrain.push(t);
        regions.push(r);
      }
      const sites = Array.from({ length: cells * cells }, (_, id) => regionSite(seed, id, size));
      return { seed, terrain, regions, sites };
    }),
  };
};
