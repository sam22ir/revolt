import type { BaseState } from "./base-state.ts";
import type { BackgroundId } from "./background.ts";
import { heroesFor } from "./hero-id.ts";

/**
 * Banks `shards` on the first hero of the background's roster the player owns. Shards only exist for owned
 * heroes, so a player with none yet gets nothing (the recruit draw is the way to a first hero).
 */
export const addShardsToOwned = (state: BaseState, background: BackgroundId, shards: number): BaseState => {
  if (shards <= 0) return state;
  const id = heroesFor(background).find((h) => state.heroes.owned[h] !== undefined);
  const entry = id === undefined ? undefined : state.heroes.owned[id];
  if (id === undefined || entry === undefined) return state;
  return { ...state, heroes: { ...state.heroes, owned: { ...state.heroes.owned, [id]: { ...entry, shards: entry.shards + shards } } } };
};
