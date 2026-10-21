import type { BackgroundId } from "../background.ts";
import type { BuildingId } from "../building-id.ts";
import type { HeroId } from "../hero-id.ts";
import type { Resources } from "../resources.ts";

/**
 * Story chapters per background (GDD §4.8). EVERY chapter here is placeholder, pending historian review (GDD §6):
 * `reviewed` stays false until a historian signs the text off (see docs/story-review.md). Chapter text lives in i18n
 * as `story.<background>.<chapterId>.title` and `.scene1` … `.scene<scenes>`, each starting with the draft marker.
 * Objectives use only existing mechanics, and the content is neutral scene-setting: no dates, battles or real names.
 */

export type Objective =
  | { readonly kind: "building_level"; readonly building: BuildingId; readonly level: number }
  /** Troops owned, at home or out on a march. */
  | { readonly kind: "troops_owned"; readonly count: number }
  /** `hero: null` means any hero. */
  | { readonly kind: "hero_recruited"; readonly hero: HeroId | null }
  | { readonly kind: "hero_level"; readonly hero: HeroId | null; readonly level: number }
  /** Victories won with a hero leading the march. */
  | { readonly kind: "victories"; readonly count: number };

export interface ChapterReward {
  readonly resources: Resources;
  /** Shards for the first owned hero of the background roster; none if the player owns no hero yet. */
  readonly shards: number;
}

export interface StoryChapter {
  readonly id: string;
  /** Number of scenes; scene `n` is the i18n key `story.<background>.<id>.scene<n>`. */
  readonly scenes: number;
  readonly objectives: readonly Objective[];
  readonly reward: ChapterReward;
  /** True only after a historian has reviewed the chapter's text. Always false in M5. */
  readonly reviewed: boolean;
}

const r = (food: number, materiel: number, funds: number, support: number): Resources => ({ food, materiel, funds, support });

// Placeholder balance for M5. Chapter 1 can be finished from the starting resources, and its reward pays for the first
// recruit draw (funds), so a new player needs no other source.
export const STORY: Readonly<Record<BackgroundId, readonly StoryChapter[]>> = {
  algeria: [
    {
      id: "ch1",
      scenes: 2,
      objectives: [{ kind: "building_level", building: "hq", level: 2 }],
      reward: { resources: r(100, 100, 300, 30), shards: 10 },
      reviewed: false,
    },
    {
      id: "ch2",
      scenes: 2,
      objectives: [
        { kind: "hero_recruited", hero: null },
        { kind: "troops_owned", count: 20 },
      ],
      reward: { resources: r(200, 200, 200, 20), shards: 20 },
      reviewed: false,
    },
    {
      id: "ch3",
      scenes: 2,
      objectives: [
        { kind: "victories", count: 1 },
        { kind: "hero_level", hero: null, level: 2 },
      ],
      reward: { resources: r(400, 400, 400, 40), shards: 10 },
      reviewed: false,
    },
  ],
  // Placeholder for M6, pending historian review (GDD §6, docs/story-review.md). Same mechanics and balance as Algeria's
  // chapters; the first hero (a trail scout) is paid for by chapter 1, as the courier is there.
  vietnam: [
    {
      id: "ch1",
      scenes: 2,
      objectives: [{ kind: "building_level", building: "hq", level: 2 }],
      reward: { resources: r(100, 100, 300, 30), shards: 10 },
      reviewed: false,
    },
    {
      id: "ch2",
      scenes: 2,
      objectives: [
        { kind: "hero_recruited", hero: null },
        { kind: "troops_owned", count: 20 },
      ],
      reward: { resources: r(200, 200, 200, 20), shards: 20 },
      reviewed: false,
    },
    {
      id: "ch3",
      scenes: 2,
      objectives: [
        { kind: "victories", count: 1 },
        { kind: "hero_level", hero: null, level: 2 },
      ],
      reward: { resources: r(400, 400, 400, 40), shards: 10 },
      reviewed: false,
    },
  ],
};
