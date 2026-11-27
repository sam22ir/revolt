import type { BuildingId } from "./building-id.ts";
import type { HeroId } from "./hero-id.ts";
import { EMPTY_HERO_ROSTER, type HeroRoster } from "./hero-roster.ts";
import { START_LEVELS, START_RESOURCES, START_TROOPS } from "./data/start.ts";
import type { Resources } from "./resources.ts";
import type { TroopId } from "./troop-id.ts";
import { ZERO_TROOPS, type Troops } from "./troops.ts";
import type { LessonId, NeedKind } from "./data/villages.ts";
import type { VillageTrust } from "./villages.ts";

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

/** One academy study: `lesson` is learned for good at `endsAt`. */
export interface StudyJob {
  readonly lesson: LessonId;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Epoch ms. */
  readonly endsAt: number;
}

/** One infirmary batch: these wounded troops are being nursed and come home ready at `endsAt`. */
export interface HealingJob {
  readonly troops: Troops;
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

/** Story progress for the player's background: chapters claimed, and victories won with a hero. */
export interface StoryProgress {
  readonly chapter: number;
  readonly victories: number;
}

export const START_STORY: StoryProgress = { chapter: 0, victories: 0 };

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
  /** A harvest march: the resource site it holds (`target.npcId` is then the site id too, `target.level` is 0). */
  readonly siteId?: string;
  /**
   * An aid march to a village (docs/villages-plan.md): the need it answers, on which village day, and what it carried (paid at
   * departure; brought back if the village was already helped that day). `target.npcId` is the village id, `target.level` 0.
   */
  readonly aid?: { readonly village: string; readonly need: NeedKind; readonly day: number; readonly cost: Resources };
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
  /** Troops wounded in battle, waiting for the infirmary. */
  readonly wounded: Troops;
  /** One barracks queue, separate from the build queue. */
  readonly training: TrainingJob | null;
  /** One infirmary batch, separate from both. */
  readonly healing: HealingJob | null;
  /** Recruited heroes, their levels and shards, and the pity counter. */
  readonly heroes: HeroRoster;
  /** Campaign progress (GDD §4.8). */
  readonly story: StoryProgress;
  /** Marches out on the map. */
  readonly marches: readonly MarchState[];
  /** The player's trust with each village they have helped, by village id. */
  readonly villages: Readonly<Record<string, VillageTrust>>;
  /** Lessons the villages have taught, in the order taught: they can be studied at the academy. */
  readonly lessonsTaught: readonly LessonId[];
  /** Lessons studied: their effects apply (effects.ts). */
  readonly lessons: readonly LessonId[];
  /** The academy's one study in progress. */
  readonly study: StudyJob | null;
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
  healing: null,
  heroes: EMPTY_HERO_ROSTER,
  story: START_STORY,
  marches: [],
  villages: {},
  lessonsTaught: [],
  lessons: [],
  study: null,
  lastUpdated: now,
});
