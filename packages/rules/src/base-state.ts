import type { BuildingId } from "./building-id.ts";
import { HERO_IDS, type HeroId } from "./hero-id.ts";
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

/** One hero's progress. Level 0 means not recruited; shards can be held before recruiting. */
export interface HeroProgress {
  readonly level: number;
  readonly shards: number;
}

/** A hero as a march carries it: the level frozen at send time, so the battle on arrival is reproducible. */
export interface SquadMember {
  readonly id: HeroId;
  readonly level: number;
}

/** Story progress for the player's background: chapters claimed, and victories won with a hero. */
export interface StoryProgress {
  readonly chapter: number;
  readonly victories: number;
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
  /** Heroes leading this march: lead first, then up to two deputies. A hero away with a march is busy. */
  readonly heroes?: readonly SquadMember[];
  /** The rally this march belongs to, if it joined one. Its timing is the rally's. */
  readonly rallyId?: string;
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
  /** Marches out on the map. */
  readonly marches: readonly MarchState[];
  /** Every hero's level and shards (GDD §4.4). */
  readonly heroes: Readonly<Record<HeroId, HeroProgress>>;
  /** Campaign progress (GDD §4.8). */
  readonly story: StoryProgress;
  /** Epoch ms up to which production has been settled. Never moves backwards. */
  readonly lastUpdated: number;
}

export const START_HEROES: Readonly<Record<HeroId, HeroProgress>> = Object.fromEntries(
  HERO_IDS.map((id) => [id, { level: 0, shards: 0 }]),
) as Record<HeroId, HeroProgress>;

export const START_STORY: StoryProgress = { chapter: 0, victories: 0 };

export const createBaseState = (now: number): BaseState => ({
  resources: START_RESOURCES,
  levels: START_LEVELS,
  queue: null,
  troops: START_TROOPS,
  wounded: ZERO_TROOPS,
  training: null,
  marches: [],
  heroes: START_HEROES,
  story: START_STORY,
  lastUpdated: now,
});
