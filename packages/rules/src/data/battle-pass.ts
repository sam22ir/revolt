import type { Reward } from "../reward.ts";
import { DAY_MS, LIVE_ANCHOR } from "./events.ts";

/**
 * The battle pass (GDD §8): a free track and a paid track over the same tiers. The paid track is cosmetics, a few
 * speed-up tokens and small resource gifts. It never gives shards or anything that changes a fight, and the free
 * track gives shards and tokens too, so a free player misses looks, not power.
 */
export const PASS_SEASON_MS = 28 * DAY_MS;
export const PASS_ANCHOR = LIVE_ANCHOR;
export const PASS_TIER_COUNT = 30;
export const PASS_XP_PER_TIER = 100;

export interface PassTier {
  /** 1-based. */
  readonly tier: number;
  readonly free: Reward;
  readonly premium: Reward;
}

/** Premium cosmetics at every fifth tier, in order. */
const PASS_COSMETICS = ["skin_olive", "banner_stripes", "march_dust", "outfit_field", "banner_dawn", "skin_slate"] as const;

const buildTier = (tier: number): PassTier => {
  const free: Reward = {
    resources: { food: 40 * tier, materiel: 40 * tier, funds: 40 * tier },
    ...(tier % 5 === 0 ? { shards: 2 } : {}),
    ...(tier % 10 === 0 ? { speedupTokens: 2 } : {}),
  };
  const cosmetic = tier % 5 === 0 ? PASS_COSMETICS[tier / 5 - 1] : undefined;
  const premium: Reward = {
    resources: { food: 20 * tier, materiel: 20 * tier, funds: 20 * tier },
    ...(tier % 3 === 0 ? { speedupTokens: 1 } : {}),
    ...(cosmetic === undefined ? {} : { cosmetic }),
  };
  return { tier, free, premium };
};

export const PASS_TIERS: readonly PassTier[] = Array.from({ length: PASS_TIER_COUNT }, (_, i) => buildTier(i + 1));
