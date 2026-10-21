import { claimableTiers, EMPTY_PASS, PASS_TIER_COUNT, SPEEDUP_TOKEN_MS, type EventView, type PassView, type StoreView } from "@revolt/rules";

/**
 * Decisions the live panels show, made from the server's answers without the DOM, so they can be unit-tested.
 * Nothing here computes a score or a reward: the server owns every number.
 */

/** How long until the event ends (while it runs) or until its claim window is over; never negative. */
export const eventRemainingMs = (e: EventView, now: number): number => Math.max(0, e.endsAt - now);

/** Progress toward the next reward tier: `have` of `need`, or null when the top tier is reached (or the event has none). */
export const nextTierProgress = (e: EventView): { have: number; need: number } | null => {
  const next = e.tiers[e.tier + 1];
  return next === undefined ? null : { have: Math.min(e.score, next.score), need: next.score };
};

/** Events the player can collect a reward from right now. */
export const claimableEvents = (events: readonly EventView[]): EventView[] => events.filter((e) => e.claimable);

/** The pass as the rules' progress type, so the claimable tiers come from the shared function. */
export const passProgress = (p: PassView) => ({ ...EMPTY_PASS, xp: p.xp, premium: p.premium, claimedFree: p.claimedFree, claimedPremium: p.claimedPremium });

export interface PassTierState {
  readonly tier: number;
  readonly free: "locked" | "claimable" | "claimed";
  readonly premium: "locked" | "claimable" | "claimed" | "needs_unlock";
}

/** Per tier, what the player can do on each track. */
export const passTierStates = (p: PassView): PassTierState[] => {
  const can = claimableTiers(passProgress(p));
  const states: PassTierState[] = [];
  for (let tier = 1; tier <= PASS_TIER_COUNT; tier++) {
    const bit = 1 << (tier - 1);
    const reached = tier <= p.tier;
    const free = (p.claimedFree & bit) !== 0 ? "claimed" : can.free.includes(tier) ? "claimable" : "locked";
    const premium = !p.premium
      ? "needs_unlock"
      : (p.claimedPremium & bit) !== 0
        ? "claimed"
        : reached && can.premium.includes(tier)
          ? "claimable"
          : "locked";
    states.push({ tier, free, premium });
  }
  return states;
};

export const passClaimableCount = (p: PassView): number => {
  const c = claimableTiers(passProgress(p));
  return c.free.length + c.premium.length;
};

/** The number on the Live button: rewards waiting to be claimed. */
export const liveBadge = (events: readonly EventView[] | null, pass: PassView | null): number =>
  (events === null ? 0 : claimableEvents(events).length) + (pass === null ? 0 : passClaimableCount(pass));

/** Speed-up time the daily cap still allows, in ms, and in tokens' worth. */
export const speedUpAllowance = (wallet: StoreView["wallet"]): { ms: number; tokens: number } => {
  const ms = Math.max(0, wallet.dailyCapMs - wallet.usedTodayMs);
  return { ms, tokens: Math.floor(ms / SPEEDUP_TOKEN_MS) };
};

/** A price hint for display (the store shows the real price). USD cents in, a currency string out. */
export const priceHint = (locale: string, cents: number): string => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
