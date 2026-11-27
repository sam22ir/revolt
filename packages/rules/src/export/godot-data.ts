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
import { checkUpgrade, nextLevelQuote } from "../upgrade.ts";
import { BUILDING_IDS, type BuildingId } from "../building-id.ts";
import { BUILDINGS, MAX_BUILDING_LEVEL } from "../data/buildings.ts";
import { COSMETIC_IDS } from "../data/cosmetics.ts";
import { EVENTS } from "../data/events.ts";
import { HEROES } from "../data/heroes.ts";
import {
  HERO_DRAW_COST,
  HERO_DRAW_MIN_HALL,
  HERO_DRAW_ODDS,
  HERO_LEVEL_EFFECT_STEP,
  HERO_LEVELS_PER_HALL_LEVEL,
  HERO_MIN_DAMAGE_TAKEN,
  HERO_SHARDS_PER_LEVEL,
  MAX_HERO_LEVEL,
  PITY_DRAWS,
  SHARDS_PER_DUPLICATE,
} from "../data/hero-progression.ts";
import { HEROES_BY_BACKGROUND } from "../hero-id.ts";
import { MAX_DEPUTIES } from "../hero-loadout.ts";
import { ALLIANCE_RANKS, canPerform } from "../alliance.ts";
import { RALLY_GATHER_OPTIONS_MS, RALLY_SPEED } from "../data/alliance.ts";
import { DEFAULT_BACKGROUND } from "../background.ts";
import { SITE_KINDS, SITE_LEVELS, SITE_MAX_HARVEST_MS, SITE_RATE_PER_HOUR, SITE_RESOURCE } from "../data/sites.ts";
import { BASE_EDGE_MARGIN, BASE_MOUNTAIN_CLEARANCE, MAP_SIZE, MARCH_RESCUE_GRACE_MS, MAX_MARCHES, NPC_COUNT_BY_LEVEL, PLACEMENT_SPACING, REGION_CELL } from "../data/map.ts";
import { hash32 } from "../rng.ts";
import { regionAt, regionSite } from "../regions.ts";
import { baseSiteOk } from "../base-site.ts";
import { ZONE_CARRY_MULTIPLIER, ZONE_CLEARANCE, ZONE_MAX_HARVEST_MS } from "../data/zones.ts";
import { zonesOf } from "../zones.ts";
import { terrainAt, valueNoise, type TerrainId } from "../terrain.ts";
import { NPC_LEVELS, NPC_RESPAWN_MS } from "../data/npcs.ts";
import { PASS_TIERS, PASS_TIER_COUNT } from "../data/battle-pass.ts";
import { START_LEVELS, START_RESOURCES, START_TROOPS } from "../data/start.ts";
import { STORAGE_CAPS } from "../data/storage.ts";
import { PRODUCTS } from "../data/store.ts";
import { STORY } from "../data/story.ts";
import { COUNTER_BONUS, HEAL_BATCH_PER_LEVEL, HEAL_COST_SHARE, HEAL_TIME_SHARE, LOST_SHARE, MAX_BATTLE_ROUNDS, TRAINING_BATCH_PER_LEVEL, TROOPS } from "../data/troops.ts";
import { checkHealing, healingQuote, planHealing } from "../healing.ts";
import { FORECAST_CHANCE_LEVEL, FORECAST_LOSSES_LEVEL } from "../data/watchtower.ts";
import { CARE_COST, CARE_INFIRMARY_LEVEL, LABOR_MS, LABOR_TROOPS, LESSON_IDS, LESSONS, NEED_FOOD, NEED_FUNDS, PROTECTION_RADIUS, TRUST_DECAY_PER_DAY, TRUST_LEVELS, TRUST_MAX, VILLAGE_KINDS } from "../data/villages.ts";
import { ACADEMY_LEVEL_FOR, STUDY_COST, STUDY_MS } from "../data/academy.ts";
import { RESOURCE_IDS } from "../resource-id.ts";
import { COMBAT_TROOP_IDS, TROOP_IDS } from "../troop-id.ts";
import type { Resources } from "../resources.ts";

/** Everything the client displays from balance tables. Keyed by mechanical id. */
export const buildGodotBalance = (): unknown => ({
  resourceIds: [...RESOURCE_IDS],
  buildingIds: [...BUILDING_IDS],
  troopIds: [...TROOP_IDS],
  combatTroopIds: [...COMBAT_TROOP_IDS],
  cosmeticIds: [...COSMETIC_IDS],
  maxBuildingLevel: MAX_BUILDING_LEVEL,
  liberation: { bonusPerRegion: LIBERATION_BONUS_PER_REGION, bonusCap: LIBERATION_BONUS_CAP },
  buildings: BUILDINGS,
  storageCaps: STORAGE_CAPS,
  start: { levels: START_LEVELS, resources: START_RESOURCES, troops: START_TROOPS },
  troops: TROOPS,
  trainingBatchPerLevel: TRAINING_BATCH_PER_LEVEL,
  healing: { batchPerLevel: HEAL_BATCH_PER_LEVEL, costShare: HEAL_COST_SHARE, timeShare: HEAL_TIME_SHARE },
  forecast: { lossesLevel: FORECAST_LOSSES_LEVEL, chanceLevel: FORECAST_CHANCE_LEVEL },
  villages: { kinds: [...VILLAGE_KINDS], trustLevels: [...TRUST_LEVELS], trustMax: TRUST_MAX, trustDecayPerDay: TRUST_DECAY_PER_DAY, protectionRadius: PROTECTION_RADIUS, laborTroops: LABOR_TROOPS, laborMs: LABOR_MS, needFoodPerLevel: NEED_FOOD(0), needFundsPerLevel: NEED_FUNDS(0), careInfirmaryLevel: CARE_INFIRMARY_LEVEL, careCost: CARE_COST },
  lessons: LESSONS,
  lessonIds: [...LESSON_IDS],
  study: { cost: STUDY_COST, ms: STUDY_MS, academyLevel: ACADEMY_LEVEL_FOR },
  battle: { counterBonus: COUNTER_BONUS, lostShare: LOST_SHARE, maxRounds: MAX_BATTLE_ROUNDS },
  heroes: HEROES,
  heroesByBackground: HEROES_BY_BACKGROUND,
  defaultBackground: DEFAULT_BACKGROUND,
  heroProgression: {
    maxLevel: MAX_HERO_LEVEL,
    levelsPerHallLevel: HERO_LEVELS_PER_HALL_LEVEL,
    shardsPerLevel: HERO_SHARDS_PER_LEVEL,
    levelEffectStep: HERO_LEVEL_EFFECT_STEP,
    minDamageTaken: HERO_MIN_DAMAGE_TAKEN,
    maxDeputies: MAX_DEPUTIES,
    shardsPerDuplicate: SHARDS_PER_DUPLICATE,
    drawMinHall: HERO_DRAW_MIN_HALL,
    drawCost: HERO_DRAW_COST,
    drawOdds: HERO_DRAW_ODDS,
    pityDraws: PITY_DRAWS,
  },
  hqRanks: ALLIANCE_RANKS.filter((r) => canPerform(r, "set_hq")),
  rally: { gatherOptionsMs: [...RALLY_GATHER_OPTIONS_MS], speed: RALLY_SPEED, startRanks: ALLIANCE_RANKS.filter((r) => canPerform(r, "start_rally")) },
  npcLevels: NPC_LEVELS,
  npcRespawnMs: NPC_RESPAWN_MS,
  map: {
    size: MAP_SIZE,
    regionCell: REGION_CELL,
    marchRescueGraceMs: MARCH_RESCUE_GRACE_MS,
    maxMarches: MAX_MARCHES,
    npcCountByLevel: NPC_COUNT_BY_LEVEL,
    placementSpacing: PLACEMENT_SPACING,
    baseEdgeMargin: BASE_EDGE_MARGIN,
    baseMountainClearance: BASE_MOUNTAIN_CLEARANCE,
    zoneClearance: ZONE_CLEARANCE,
  },
  story: STORY,
  events: EVENTS,
  passTierCount: PASS_TIER_COUNT,
  passTiers: PASS_TIERS,
  products: PRODUCTS,
  sites: {
    kinds: [...SITE_KINDS],
    levels: [...SITE_LEVELS],
    maxHarvestMs: SITE_MAX_HARVEST_MS,
    siteResource: SITE_RESOURCE,
    /** Per kind, keyed by level as a string (JSON object keys): units of the site's resource per hour on site. */
    ratePerHour: SITE_RATE_PER_HOUR,
    /** In a contested zone: troops carry this many times as much, and may stay this long. */
    zoneCarryMultiplier: ZONE_CARRY_MULTIPLIER,
    zoneMaxHarvestMs: ZONE_MAX_HARVEST_MS,
  },
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

interface UpgradeCase {
  readonly name: string;
  readonly building: BuildingId;
  readonly levels: Record<BuildingId, number>;
  readonly resources: Resources;
  readonly queue: BaseState["queue"];
}

const resourcesOf = (v: number): Resources => ({ food: v, materiel: v, funds: v, support: v });

/** Upgrade checks over every building, level, HQ level and wallet that matters: the GDScript display check must match `checkUpgrade`. */
const upgradeCases = (): UpgradeCase[] => {
  const out: UpgradeCase[] = [];
  const at = (building: BuildingId, level: number, hq: number): Record<BuildingId, number> => ({ ...START_LEVELS, hq, [building]: level });
  for (const building of BUILDING_IDS)
    for (const level of [1, 2, 9, MAX_BUILDING_LEVEL])
      for (const hq of [1, MAX_BUILDING_LEVEL])
        for (const [wallet, resources] of [["none", resourcesOf(0)], ["rich", resourcesOf(1_000_000)]] as const)
          out.push({ name: `${building} L${level} hq${hq} ${wallet}`, building, levels: at(building, level, hq), resources, queue: null });
  // The wallet exactly at the price, and one short on the first priced resource.
  for (const building of BUILDING_IDS)
    for (const level of [1, 2, 9]) {
      const levels = at(building, level, MAX_BUILDING_LEVEL);
      const quote = nextLevelQuote(building, levels[building]);
      if (quote === null) continue;
      out.push({ name: `${building} L${level} exact`, building, levels, resources: { ...quote.cost }, queue: null });
      const short = { ...quote.cost };
      const first = RESOURCE_IDS.find((r) => short[r] > 0);
      if (first !== undefined) short[first] -= 1;
      out.push({ name: `${building} L${level} short by one`, building, levels, resources: short, queue: null });
    }
  // Another upgrade running (the queue holds one job).
  for (const building of BUILDING_IDS)
    out.push({
      name: `${building} while the queue is busy`,
      building,
      levels: at(building, 1, MAX_BUILDING_LEVEL),
      resources: resourcesOf(1_000_000),
      queue: { building: building === "farm" ? "armory" : "farm", toLevel: 2, startedAt: 1000, endsAt: 31_000 },
    });
  return out;
};

/** Golden cases for `UpgradeView.check` (GDScript): inputs are an already-advanced base, expected is the real `checkUpgrade`. */
export const buildGodotUpgradeFixtures = (): unknown => ({
  cases: upgradeCases().map((c) => {
    const state: BaseState = { ...createBaseState(0), levels: c.levels, resources: c.resources, queue: c.queue };
    return { name: c.name, building: c.building, levels: c.levels, resources: c.resources, queue: c.queue, expected: checkUpgrade(state, c.building) };
  }),
});

/**
 * Golden cases for `HealModel` (GDScript): an already-advanced base (infirmary level, wounded, resources, a batch in or not), and
 * what the real `planHealing`, `healingQuote` and `checkHealing` say about it.
 */
export const buildGodotHealFixtures = (): unknown => {
  const t = (infantry: number, scouts: number, heavy: number, porters: number) => ({ infantry, scouts, heavy, porters });
  const r = (food: number, materiel: number, funds: number) => ({ food, materiel, funds, support: 0 });
  const inputs = [
    { name: "nobody wounded", infirmary: 1, wounded: t(0, 0, 0, 0), resources: r(500, 500, 500), busy: false },
    { name: "a few, plenty of resources", infirmary: 1, wounded: t(6, 2, 0, 0), resources: r(5000, 5000, 5000), busy: false },
    { name: "more than one batch", infirmary: 1, wounded: t(10, 8, 30, 4), resources: r(5000, 5000, 5000), busy: false },
    { name: "a bigger infirmary", infirmary: 4, wounded: t(10, 8, 30, 4), resources: r(5000, 5000, 5000), busy: false },
    { name: "resources pay for some", infirmary: 3, wounded: t(20, 10, 10, 0), resources: r(97.6, 41.2, 13.9), busy: false },
    { name: "nothing can be paid", infirmary: 2, wounded: t(5, 0, 0, 0), resources: r(3, 1, 0), busy: false },
    { name: "a batch is already in", infirmary: 2, wounded: t(5, 0, 0, 0), resources: r(5000, 5000, 5000), busy: true },
    { name: "porters only", infirmary: 1, wounded: t(0, 0, 0, 9), resources: r(5000, 0, 5000), busy: false },
  ];
  return {
    cases: inputs.map((c) => {
      const state: BaseState = {
        ...createBaseState(0),
        levels: { ...createBaseState(0).levels, infirmary: c.infirmary },
        wounded: c.wounded,
        resources: c.resources,
        healing: c.busy ? { troops: t(1, 0, 0, 0), startedAt: 0, endsAt: 1 } : null,
      };
      const plan = planHealing(state);
      return { ...c, expected: { plan, quote: healingQuote(plan), reason: checkHealing(state) } };
    }),
  };
};

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
 * Grids are one character per tile, row-major by y: terrain p/h/f/m, regions as a hex digit, base sites 1/0.
 */
export const buildGodotMapFixtures = (): unknown => {
  // Golden data stays at 64 tiles: the functions take the size, and the full map would make the fixtures nine times bigger.
  const size = 64;
  const cells = Math.ceil(size / REGION_CELL);
  if (cells * cells > 16) throw new Error("region ids no longer fit one hex digit: change the map fixture encoding");
  return {
    size,
    hash: HASH_INPUTS.map((inputs) => ({ inputs, out: hash32(...inputs) })),
    noise: NOISE_SAMPLES.map(([seed, x, y, cell]) => ({ seed, x, y, cell, out: valueNoise(seed, x, y, cell) })),
    seeds: MAP_SEEDS.map((seed) => {
      const terrain: string[] = [];
      const regions: string[] = [];
      const baseSites: string[] = [];
      for (let y = 0; y < size; y++) {
        let t = "";
        let r = "";
        let b = "";
        for (let x = 0; x < size; x++) {
          t += TERRAIN_LETTER[terrainAt(seed, x, y)];
          r += regionAt(seed, x, y, size).toString(16);
          b += baseSiteOk(seed, x, y, size) ? "1" : "0";
        }
        terrain.push(t);
        regions.push(r);
        baseSites.push(b);
      }
      const sites = Array.from({ length: cells * cells }, (_, id) => regionSite(seed, id, size));
      const zones = zonesOf(seed, size).map((z) => ({ x: z.x, y: z.y, radius: z.radius }));
      return { seed, terrain, regions, baseSites, sites, zones };
    }),
  };
};
