import type { BaseState } from "./base-state.ts";
import { BUILDING_IDS } from "./building-id.ts";
import { TROOPS } from "./data/troops.ts";
import { TROOP_IDS } from "./troop-id.ts";

export const LEADERBOARDS = ["power", "regions", "alliance", "event"] as const;
export type LeaderboardId = (typeof LEADERBOARDS)[number];

export const isLeaderboardId = (v: unknown): v is LeaderboardId => LEADERBOARDS.some((b) => b === v);

/** Entries a board returns, besides the viewer's own rank. */
export const LEADERBOARD_PAGE = 50;

export const POWER_PER_BUILDING_LEVEL = 10;
export const POWER_PER_HERO_LEVEL = 25;

/** Placeholder weights: a unit counts for what it fights with. Wounded troops are not counted until they heal. */
const troopPower = (id: (typeof TROOP_IDS)[number]): number => TROOPS[id].attack * 3 + TROOPS[id].hp;

/**
 * Player power (GDD §4.9): buildings, troops (at home and marching) and hero levels. A pure function of the state,
 * so the server can recompute it whenever it saves a base. It only grows when assets grow.
 */
export const playerPower = (state: BaseState): number => {
  let power = 0;
  for (const b of BUILDING_IDS) power += state.levels[b] * POWER_PER_BUILDING_LEVEL;
  for (const t of TROOP_IDS) {
    const away = state.marches.reduce((n, m) => n + m.troops[t], 0);
    power += (state.troops[t] + away) * troopPower(t);
  }
  for (const h of Object.values(state.heroes)) power += h.level * POWER_PER_HERO_LEVEL;
  return power;
};

/**
 * Regions liberated (GDD §4.9 names the board but not the measure): colonial targets beaten by a hero-led march,
 * which is what `story.victories` already counts. Placeholder definition until design decides otherwise.
 */
export const regionsLiberated = (state: BaseState): number => state.story.victories;

export interface BoardEntry {
  readonly handle: string;
  readonly score: number;
  /** Epoch ms the score was last raised: the earlier player wins a tie. */
  readonly reachedAt: number;
}

/** Score high to low; ties go to whoever got there first, then to the handle, so the order never depends on input order. */
export const compareEntries = (a: BoardEntry, b: BoardEntry): number =>
  b.score - a.score || a.reachedAt - b.reachedAt || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0);

/** 1-based rank of `handle` among `entries`, or null if absent. Duplicated handles are the caller's bug. */
export const rankOf = (entries: readonly BoardEntry[], handle: string): number | null => {
  const sorted = [...entries].sort(compareEntries);
  const i = sorted.findIndex((e) => e.handle === handle);
  return i < 0 ? null : i + 1;
};
