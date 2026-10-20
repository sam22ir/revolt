import type { BaseState } from "./base-state.ts";
import { MAX_HERO_SHARDS } from "./data/heroes.ts";
import type { HeroId } from "./hero-id.ts";

export const replaceHero = (state: BaseState, id: HeroId, level: number, shards: number): BaseState => ({
  ...state,
  heroes: { ...state.heroes, [id]: { level, shards } },
});

/** Adds whole shards to a hero, capped at MAX_HERO_SHARDS. */
export const addShards = (state: BaseState, id: HeroId, shards: number): BaseState => {
  if (!(shards > 0)) return state;
  const have = state.heroes[id];
  return replaceHero(state, id, have.level, Math.min(MAX_HERO_SHARDS, have.shards + Math.floor(shards)));
};
