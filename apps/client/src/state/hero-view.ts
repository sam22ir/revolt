import {
  canAfford,
  chapterStatus,
  currentChapter,
  DEFAULT_BACKGROUND,
  heroBattleModifier,
  heroesFor,
  heroesOnMarch,
  heroLevelCap,
  HERO_DRAW_COST,
  HERO_DRAW_MIN_HALL,
  HEROES,
  levelUpHero,
  shardsToNextLevel,
  snapshotHeroes,
  TROOP_IDS,
  type BackgroundId,
  type BaseState,
  type HeroDef,
  type HeroDrawBlockReason,
  type HeroEntry,
  type HeroId,
  type HeroLevelBlockReason,
  type HeroLoadout,
  type StoryChapter,
} from "@revolt/rules";

/** Everything the heroes panel shows about one hero, decided by the shared rules (never by the DOM). */
export interface HeroCard {
  readonly id: HeroId;
  readonly def: HeroDef;
  /** The player's entry for this hero, or null while not recruited. */
  readonly owned: HeroEntry | null;
  /** Away with a march. */
  readonly busy: boolean;
  /** Why Level up is off, or null. Only meaningful while owned. */
  readonly levelUp: HeroLevelBlockReason | null;
  /** Shards for the next level, or null at the top. */
  readonly nextShards: number | null;
  /** Highest level the hero hall allows now. */
  readonly cap: number;
}

export const heroCard = (state: BaseState, id: HeroId): HeroCard => {
  const owned = state.heroes.owned[id] ?? null;
  const check = owned === null ? null : levelUpHero(state, id);
  return {
    id,
    def: HEROES[id],
    owned,
    busy: heroesOnMarch(state).has(id),
    levelUp: check === null || check.ok ? null : check.reason,
    nextShards: owned === null ? null : shardsToNextLevel(owned.level),
    cap: heroLevelCap(state.levels.hero_hall),
  };
};

/** The background's own heroes, owned first, then the rest, each group in table order. */
export const heroCards = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): HeroCard[] => {
  const cards = heroesFor(background).map((id) => heroCard(state, id));
  return [...cards.filter((c) => c.owned !== null), ...cards.filter((c) => c.owned === null)];
};

/** Why a recruit draw cannot be made now, or null. The draw itself is the server's (it picks the seed). */
export const recruitBlock = (state: BaseState): HeroDrawBlockReason | null => {
  if (state.levels.hero_hall < HERO_DRAW_MIN_HALL) return "hero_hall_level";
  return canAfford(state.resources, HERO_DRAW_COST) ? null : "insufficient";
};

/** Heroes that can lead or join a march now: owned and not already out. */
export const availableHeroes = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): HeroId[] => {
  const busy = heroesOnMarch(state);
  return heroesFor(background).filter((id) => state.heroes.owned[id] !== undefined && !busy.has(id));
};

export interface BonusSummary {
  /** Best attack bonus over the troop types it helps, in whole percent. */
  readonly attack: number;
  /** Share of damage the whole force no longer takes, in whole percent. */
  readonly defense: number;
}

/** What a loadout brings, in whole percent, computed by the same rules the battle uses. All zero for no heroes. */
export const bonusSummary = (state: BaseState, loadout: HeroLoadout | null): BonusSummary => {
  if (loadout === null) return { attack: 0, defense: 0 };
  const mod = heroBattleModifier(snapshotHeroes(state.heroes, loadout));
  return {
    attack: Math.round(Math.max(...TROOP_IDS.map((id) => mod.attack[id])) * 100 - 100),
    defense: Math.round((1 - mod.damageTaken) * 100),
  };
};

export interface StoryView {
  /** The chapter the player is on, or null once every chapter is claimed. */
  readonly chapter: StoryChapter | null;
  readonly status: "in_progress" | "ready" | "complete";
  /** Chapters already claimed, oldest first, for replay. */
  readonly claimed: number;
}

export const storyView = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): StoryView => ({
  chapter: currentChapter(state, background),
  status: chapterStatus(state, background),
  claimed: state.story.chapter,
});

/** A chapter reward is waiting: the HUD badge. */
export const storyClaimable = (state: BaseState, background: BackgroundId = DEFAULT_BACKGROUND): boolean => chapterStatus(state, background) === "ready";
