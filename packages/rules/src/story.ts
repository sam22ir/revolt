import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { DEFAULT_BACKGROUND, STORY, type BackgroundId, type Objective, type StoryChapter } from "./data/story.ts";
import { addShards } from "./hero-progress.ts";
import { HERO_IDS } from "./hero-id.ts";
import { storageCap } from "./production.ts";
import { mapResources } from "./resources.ts";
import { totalTroops } from "./troops.ts";

export const STORY_BLOCK_REASONS = ["objectives_unmet", "story_complete"] as const;
export type StoryBlockReason = (typeof STORY_BLOCK_REASONS)[number];

export type StoryResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: StoryBlockReason; readonly state: BaseState };

export const chaptersFor = (background: BackgroundId = DEFAULT_BACKGROUND): readonly StoryChapter[] => STORY[background];

/** The chapter the player is on, or null when the campaign is finished. */
export const currentChapter = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): StoryChapter | null =>
  chaptersFor(background)[state.story.chapter] ?? null;

export interface ObjectiveProgress {
  readonly done: boolean;
  readonly have: number;
  readonly need: number;
}

const ownedTroops = (state: BaseState): number => totalTroops(state.troops) + state.marches.reduce((n, m) => n + totalTroops(m.troops), 0);

const bestHeroLevel = (state: BaseState, hero: string | null): number =>
  HERO_IDS.reduce((best, id) => (hero === null || hero === id ? Math.max(best, state.heroes[id].level) : best), 0);

/** Progress on one objective, computed only from `state`. */
export const objectiveProgress = (state: BaseState, o: Objective): ObjectiveProgress => {
  let have: number;
  let need: number;
  switch (o.kind) {
    case "building_level":
      have = state.levels[o.building];
      need = o.level;
      break;
    case "troops_owned":
      have = ownedTroops(state);
      need = o.count;
      break;
    case "hero_recruited":
      have = bestHeroLevel(state, o.hero) > 0 ? 1 : 0;
      need = 1;
      break;
    case "hero_level":
      have = bestHeroLevel(state, o.hero);
      need = o.level;
      break;
    case "victories":
      have = state.story.victories;
      need = o.count;
      break;
  }
  return { done: have >= need, have: Math.min(have, need), need };
};

export type ChapterStatus = "in_progress" | "ready" | "complete";

/** Where the current chapter stands: objectives under way, all met and waiting to be claimed, or the campaign is done. */
export const chapterStatus = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): ChapterStatus => {
  const chapter = currentChapter(state, background);
  if (chapter === null) return "complete";
  return chapter.objectives.every((o) => objectiveProgress(state, o).done) ? "ready" : "in_progress";
};

/** Claims the current chapter's reward once its objectives are met and moves on to the next chapter. */
export const claimChapter = (state: BaseState, now: number, background: BackgroundId = DEFAULT_BACKGROUND): StoryResult => {
  const s = advance(state, now);
  const chapter = currentChapter(s, background);
  if (chapter === null) return { ok: false, reason: "story_complete", state: s };
  if (!chapter.objectives.every((o) => objectiveProgress(s, o).done)) return { ok: false, reason: "objectives_unmet", state: s };
  const cap = storageCap(s.levels.hq);
  // Like loot: fills storage up to the cap, and never lowers an amount already above it.
  const resources = mapResources((id) => Math.max(s.resources[id], Math.min(cap[id], s.resources[id] + chapter.reward.resources[id])));
  let next: BaseState = { ...s, resources, story: { ...s.story, chapter: s.story.chapter + 1 } };
  for (const id of HERO_IDS) next = addShards(next, id, chapter.reward.shards[id] ?? 0);
  return { ok: true, state: next };
};
