import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { DEFAULT_BACKGROUND, type BackgroundId } from "./background.ts";
import type { CosmeticId } from "./data/cosmetics.ts";
import { addShardsToOwned } from "./hero-shards.ts";
import { storageCap } from "./production.ts";
import { mapResources, type Resources } from "./resources.ts";

/**
 * What an event tier, a pass tier or a product hands out. Resources and shards land in the base; speed-up tokens
 * and cosmetics live on the account (D1), because they are not part of the timestamped base.
 */
export interface Reward {
  readonly resources?: Partial<Resources>;
  /** Shards for the first owned hero of the player's background roster (nothing if none is owned). Only free tracks and event tiers give them. */
  readonly shards?: number;
  readonly speedupTokens?: number;
  readonly cosmetic?: CosmeticId;
}

export const rewardHasBaseParts = (r: Reward): boolean => (r.shards ?? 0) > 0 || Object.values(r.resources ?? {}).some((n) => (n ?? 0) > 0);

/**
 * The base part of a reward. Like loot and chapter rewards it fills storage up to the HQ's cap and never lowers an
 * amount already above it, so paid or earned resources cannot outrun the progression gate (GDD §8).
 */
export const grantReward = (state: BaseState, reward: Reward, now: number, background: BackgroundId = DEFAULT_BACKGROUND): BaseState => {
  const s = advance(state, now);
  const cap = storageCap(s.levels.hq);
  const give = reward.resources ?? {};
  const resources = mapResources((id) => Math.max(s.resources[id], Math.min(cap[id], s.resources[id] + Math.max(0, give[id] ?? 0))));
  return addShardsToOwned({ ...s, resources }, background, reward.shards ?? 0);
};
