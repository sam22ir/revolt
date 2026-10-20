import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { HEROES } from "./data/heroes.ts";
import { HERO_DRAW_COST, HERO_DRAW_MIN_HALL, HERO_DRAW_ODDS, PITY_DRAWS, SHARDS_PER_DUPLICATE } from "./data/hero-progression.ts";
import { HERO_IDS, HERO_RARITIES, type HeroId, type HeroRarity } from "./hero-id.ts";
import type { HeroRoster } from "./hero-roster.ts";
import { canAfford, subtractResources } from "./resources.ts";

export const HERO_DRAW_BLOCK_REASONS = ["hero_hall_level", "insufficient"] as const;
export type HeroDrawBlockReason = (typeof HERO_DRAW_BLOCK_REASONS)[number];

export interface HeroDraw {
  readonly heroId: HeroId;
  readonly rarity: HeroRarity;
  /** True when the hero was already owned, so the draw banked shards instead. */
  readonly duplicate: boolean;
  /** True when pity forced a rare-or-better draw. */
  readonly forced: boolean;
  readonly roster: HeroRoster;
}

export type HeroRecruitResult =
  | { readonly ok: true; readonly draw: HeroDraw; readonly state: BaseState }
  | { readonly ok: false; readonly reason: HeroDrawBlockReason; readonly state: BaseState };

const RARE_OR_BETTER = HERO_RARITIES.filter((r) => r !== "common");

/** True when the next draw is the pity-forced one. */
export const isPityDraw = (roster: HeroRoster): boolean => roster.pity + 1 >= PITY_DRAWS;

/** Picks a rarity from `rarities` by published weight, given `r` in [0, 1). */
const pickRarity = (rarities: readonly HeroRarity[], r: number): HeroRarity => {
  const total = rarities.reduce((sum, rarity) => sum + HERO_DRAW_ODDS[rarity], 0);
  let acc = 0;
  for (const rarity of rarities) {
    acc += HERO_DRAW_ODDS[rarity];
    if (r * total < acc) return rarity;
  }
  return rarities[rarities.length - 1]!;
};

/**
 * One draw from the roster. Always consumes exactly two numbers from `rng`, so a seed fixes the
 * whole sequence of draws. Does not check or charge anything; see `recruitHero`.
 */
export const drawHero = (roster: HeroRoster, rng: () => number): HeroDraw => {
  const forced = isPityDraw(roster);
  const rarity = pickRarity(forced ? RARE_OR_BETTER : HERO_RARITIES, rng());
  const pool = HERO_IDS.filter((id) => HEROES[id].rarity === rarity);
  const heroId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  const prior = roster.owned[heroId];
  const owned =
    prior === undefined ? { level: 1, shards: 0 } : { level: prior.level, shards: prior.shards + SHARDS_PER_DUPLICATE };
  return {
    heroId,
    rarity,
    duplicate: prior !== undefined,
    forced,
    roster: {
      owned: { ...roster.owned, [heroId]: owned },
      pity: rarity === "common" ? roster.pity + 1 : 0,
    },
  };
};

/** Recruits a hero at `now`: checks the hall, charges the draw cost, then draws. */
export const recruitHero = (state: BaseState, now: number, rng: () => number): HeroRecruitResult => {
  const s = advance(state, now);
  if (s.levels.hero_hall < HERO_DRAW_MIN_HALL) return { ok: false, reason: "hero_hall_level", state: s };
  if (!canAfford(s.resources, HERO_DRAW_COST)) return { ok: false, reason: "insufficient", state: s };
  const draw = drawHero(s.heroes, rng);
  return {
    ok: true,
    draw,
    state: { ...s, resources: subtractResources(s.resources, HERO_DRAW_COST), heroes: draw.roster },
  };
};
