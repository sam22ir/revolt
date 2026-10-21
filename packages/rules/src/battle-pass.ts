import { PASS_TIER_COUNT, PASS_TIERS, PASS_XP_PER_TIER } from "./data/battle-pass.ts";
import type { Reward } from "./reward.ts";

export const PASS_BLOCK_REASONS = ["bad_tier", "tier_unreached", "already_claimed", "premium_locked"] as const;
export type PassBlockReason = (typeof PASS_BLOCK_REASONS)[number];

export const PASS_TRACKS = ["free", "premium"] as const;
export type PassTrack = (typeof PASS_TRACKS)[number];

export const isPassTrack = (v: unknown): v is PassTrack => PASS_TRACKS.some((t) => t === v);

/** One player's pass in one season. Claimed tiers are bitmasks: bit `tier - 1`. */
export interface PassProgress {
  readonly xp: number;
  readonly premium: boolean;
  readonly claimedFree: number;
  readonly claimedPremium: number;
}

export const EMPTY_PASS: PassProgress = { xp: 0, premium: false, claimedFree: 0, claimedPremium: 0 };

export const addPassXp = (p: PassProgress, xp: number): PassProgress => (xp > 0 ? { ...p, xp: Math.min(p.xp + Math.floor(xp), PASS_TIER_COUNT * PASS_XP_PER_TIER) } : p);

/** Highest tier reached, 0 to PASS_TIER_COUNT. XP past the last tier changes nothing. */
export const reachedTier = (p: PassProgress): number => Math.min(PASS_TIER_COUNT, Math.floor(Math.max(0, p.xp) / PASS_XP_PER_TIER));

const bit = (tier: number): number => 1 << (tier - 1);

export const isClaimed = (p: PassProgress, track: PassTrack, tier: number): boolean => ((track === "free" ? p.claimedFree : p.claimedPremium) & bit(tier)) !== 0;

/** Tiers a player could claim right now on each track. The premium track is empty without the unlock. */
export const claimableTiers = (p: PassProgress): { free: number[]; premium: number[] } => {
  const free: number[] = [];
  const premium: number[] = [];
  for (let t = 1; t <= reachedTier(p); t++) {
    if (!isClaimed(p, "free", t)) free.push(t);
    if (p.premium && !isClaimed(p, "premium", t)) premium.push(t);
  }
  return { free, premium };
};

export type PassClaim =
  | { readonly ok: true; readonly progress: PassProgress; readonly reward: Reward }
  | { readonly ok: false; readonly reason: PassBlockReason };

/** Claims one tier of one track. The reward is handed back for the caller to apply; each tier pays once. */
export const claimTier = (p: PassProgress, tier: number, track: PassTrack): PassClaim => {
  const def = Number.isInteger(tier) ? PASS_TIERS[tier - 1] : undefined;
  if (def === undefined) return { ok: false, reason: "bad_tier" };
  if (tier > reachedTier(p)) return { ok: false, reason: "tier_unreached" };
  if (track === "premium" && !p.premium) return { ok: false, reason: "premium_locked" };
  if (isClaimed(p, track, tier)) return { ok: false, reason: "already_claimed" };
  const progress = track === "free" ? { ...p, claimedFree: p.claimedFree | bit(tier) } : { ...p, claimedPremium: p.claimedPremium | bit(tier) };
  return { ok: true, progress, reward: track === "free" ? def.free : def.premium };
};
