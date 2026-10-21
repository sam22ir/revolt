import { createBaseState, type BaseState } from "../src/index.ts";

export const T0 = Date.UTC(2026, 0, 1);
export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** A base with HQ at level 2, so producers can be upgraded to level 2. */
export const base = (overrides: Partial<BaseState> = {}): BaseState => ({
  ...createBaseState(T0),
  levels: { hq: 2, farm: 1, armory: 1, treasury: 1, barracks: 1, hero_hall: 1 },
  ...overrides,
});

export const rich = (): BaseState =>
  base({ resources: { food: 2000, materiel: 2000, funds: 2000, support: 300 } });

/** A base with the given heroes owned, e.g. `withHeroes(rich(), { mountain_guide: { level: 1, shards: 0 } })`. */
export const withHeroes = (s: BaseState, owned: Partial<BaseState["heroes"]["owned"]>): BaseState => ({
  ...s,
  heroes: { ...s.heroes, owned: { ...s.heroes.owned, ...owned } },
});
