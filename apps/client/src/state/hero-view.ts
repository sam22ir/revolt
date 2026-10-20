import {
  busyHeroes,
  chapterStatus,
  checkLevelUp,
  checkRecruit,
  currentChapter,
  HERO_IDS,
  heroLevelCap,
  heroMods,
  HEROES,
  levelUpCost,
  MAX_HERO_LEVEL,
  TROOP_IDS,
  type BaseState,
  type HeroBlockReason,
  type HeroDef,
  type HeroId,
  type HeroLevelUpCost,
  type HeroProgress,
  type StoryChapter,
} from "@revolt/rules";

/** Everything the heroes panel shows about one hero, decided by the shared rules (never by the DOM). */
export interface HeroCard {
  readonly id: HeroId;
  readonly def: HeroDef;
  readonly progress: HeroProgress;
  readonly recruited: boolean;
  /** Away with a march. */
  readonly busy: boolean;
  /** Why Recruit is off, or null when it can be pressed. Only meaningful while not recruited. */
  readonly recruit: HeroBlockReason | null;
  /** Why Level up is off, or null. Only meaningful while recruited. */
  readonly levelUp: HeroBlockReason | null;
  /** Cost of the next level, or null at the top. */
  readonly nextCost: HeroLevelUpCost | null;
  /** Highest level the hero hall allows now. */
  readonly cap: number;
}

export const heroCard = (state: BaseState, id: HeroId): HeroCard => {
  const progress = state.heroes[id];
  const recruited = progress.level > 0;
  return {
    id,
    def: HEROES[id],
    progress,
    recruited,
    busy: busyHeroes(state).has(id),
    recruit: recruited ? "already_recruited" : checkRecruit(state, id),
    levelUp: recruited ? checkLevelUp(state, id) : "not_recruited",
    nextCost: recruited && progress.level < MAX_HERO_LEVEL ? levelUpCost(progress.level) : null,
    cap: heroLevelCap(state.levels.hero_hall),
  };
};

/** Recruited heroes first, then the rest, each group in table order. */
export const heroCards = (state: BaseState): HeroCard[] => {
  const cards = HERO_IDS.map((id) => heroCard(state, id));
  return [...cards.filter((c) => c.recruited), ...cards.filter((c) => !c.recruited)];
};

/** Heroes that can lead or join a march now: recruited and not already out. */
export const availableHeroes = (state: BaseState): HeroId[] => {
  const busy = busyHeroes(state);
  return HERO_IDS.filter((id) => state.heroes[id].level > 0 && !busy.has(id));
};

export interface BonusSummary {
  readonly attack: number;
  readonly hp: number;
  readonly carry: number;
}

/** The squad's best bonus in whole percent, over the troop types it helps. All zero for an empty squad. */
export const bonusSummary = (state: BaseState, ids: readonly HeroId[]): BonusSummary => {
  const mods = heroMods(ids.map((id) => ({ id, level: state.heroes[id].level })));
  const best = (pick: (id: (typeof TROOP_IDS)[number]) => number): number => Math.round(Math.max(...TROOP_IDS.map(pick)) * 100 - 100);
  return { attack: best((id) => mods.attack[id]), hp: best((id) => mods.hp[id]), carry: Math.round(mods.carry * 100 - 100) };
};

export interface StoryView {
  /** The chapter the player is on, or null once every chapter is claimed. */
  readonly chapter: StoryChapter | null;
  readonly status: "in_progress" | "ready" | "complete";
  /** Chapters already claimed, oldest first, for replay. */
  readonly claimed: number;
}

export const storyView = (state: BaseState): StoryView => ({
  chapter: currentChapter(state),
  status: chapterStatus(state),
  claimed: state.story.chapter,
});

/** A chapter reward is waiting: the HUD badge. */
export const storyClaimable = (state: BaseState): boolean => chapterStatus(state) === "ready";
