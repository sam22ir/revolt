import type { BuildingId } from "./building-id.ts";
import type { HeroId } from "./hero-id.ts";
import { EMPTY_HERO_ROSTER, type HeroRoster } from "./hero-roster.ts";
import { START_LEVELS, START_RESOURCES, START_TROOPS } from "./data/start.ts";
import type { Resources } from "./resources.ts";
import type { TroopId } from "./troop-id.ts";
import { ZERO_TROOPS, type Troops } from "./troops.ts";

export interface UpgradeJob {
  readonly building: BuildingId;
  readonly toLevel: number;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Epoch ms. */
  readonly endsAt: number;
}

/** One barracks batch: `count` units of one type, all ready at `endsAt`. */
export interface TrainingJob {
  readonly troop: TroopId;
  readonly count: number;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Epoch ms. */
  readonly endsAt: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export const MARCH_RESULTS = ["victory", "defeat", "target_gone"] as const;
export type MarchResult = (typeof MARCH_RESULTS)[number];

/** What came of a march at its target. `survivors + wounded + lost` equals the troops sent. */
export interface MarchOutcome {
  readonly result: MarchResult;
  readonly survivors: Troops;
  readonly wounded: Troops;
  readonly lost: Troops;
  readonly loot: Resources;
}

/** The heroes a march took, frozen at departure: who, and the level each had then. */
export interface MarchHeroes {
  readonly lead: HeroId;
  readonly deputies: readonly HeroId[];
  readonly levels: Readonly<Partial<Record<HeroId, number>>>;
}

/** A march as the player's base sees it: troops away, timing, and the outcome once the battle happened. */
export interface MarchState {
  readonly id: string;
  readonly target: { readonly npcId: string; readonly level: number } & MapPoint;
  readonly from: MapPoint;
  readonly troops: Troops;
  /** Epoch ms. */
  readonly departAt: number;
  readonly arriveAt: number;
  readonly returnAt: number;
  /** The rally this march belongs to, if it joined one. Its timing is the rally's. */
  readonly rallyId?: string;
  /** Heroes leading the march, if any. Their battle effects use the levels recorded here. */
  readonly heroes?: MarchHeroes;
  /** Set by the map server when the march arrives; the march comes home lazily at `returnAt`. */
  readonly outcome: MarchOutcome | null;
}

export interface BaseState {
  readonly resources: Resources;
  readonly levels: Readonly<Record<BuildingId, number>>;
  /** One build queue. */
  readonly queue: UpgradeJob | null;
  /** Troops at home, ready to march. */
  readonly troops: Troops;
  /** Troops wounded in battle. Healing comes with the infirmary (later milestone). */
  readonly wounded: Troops;
  /** One barracks queue, separate from the build queue. */
  readonly training: TrainingJob | null;
  /** Recruited heroes, their levels and shards, and the pity counter. */
  readonly heroes: HeroRoster;
  /** Marches out on the map. */
  readonly marches: readonly MarchState[];
  /** Epoch ms up to which production has been settled. Never moves backwards. */
  readonly lastUpdated: number;
}

export const createBaseState = (now: number): BaseState => ({
  resources: START_RESOURCES,
  levels: START_LEVELS,
  queue: null,
  troops: START_TROOPS,
  wounded: ZERO_TROOPS,
  training: null,
  heroes: EMPTY_HERO_ROSTER,
  marches: [],
  lastUpdated: now,
});
