import { PASS_TIER_COUNT, SPEEDUP_DAILY_CAP_MS, SPEEDUP_TOKEN_MS, type EventView, type PassView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { claimableEvents, eventRemainingMs, liveBadge, nextTierProgress, passClaimableCount, passTierStates, priceHint, speedUpAllowance } from "../src/state/live-view.ts";

const event = (over: Partial<EventView> = {}): EventView => ({
  key: "supply_route:1",
  id: "supply_route",
  startsAt: 0,
  endsAt: 10_000,
  active: true,
  score: 0,
  rank: null,
  tier: -1,
  tiers: [{ score: 50 }, { score: 200 }],
  claimed: false,
  claimable: false,
  needsReview: false,
  ...over,
});

const pass = (over: Partial<PassView> = {}): PassView => ({ season: 0, startsAt: 0, endsAt: 1000, xp: 0, tier: 0, premium: false, claimedFree: 0, claimedPremium: 0, now: 0, ...over });

describe("events", () => {
  test("time left never goes negative", () => {
    expect(eventRemainingMs(event(), 4000)).toBe(6000);
    expect(eventRemainingMs(event(), 99_999)).toBe(0);
  });

  test("progress points at the next tier and stops at the top", () => {
    expect(nextTierProgress(event({ score: 20, tier: -1 }))).toEqual({ have: 20, need: 50 });
    expect(nextTierProgress(event({ score: 80, tier: 0 }))).toEqual({ have: 80, need: 200 });
    expect(nextTierProgress(event({ score: 900, tier: 1 }))).toBeNull();
  });

  test("only ended events with a reward are claimable", () => {
    expect(claimableEvents([event(), event({ claimable: true, active: false }), event({ claimed: true })])).toHaveLength(1);
  });
});

describe("pass", () => {
  test("tier states follow the shared claim rules", () => {
    const states = passTierStates(pass({ xp: 300, tier: 3, claimedFree: 0b001 }));
    expect(states).toHaveLength(PASS_TIER_COUNT);
    expect(states[0]).toMatchObject({ free: "claimed", premium: "needs_unlock" });
    expect(states[1]).toMatchObject({ free: "claimable" });
    expect(states[3]).toMatchObject({ free: "locked" });
  });

  test("the premium track is claimable only with the unlock and a reached tier", () => {
    const states = passTierStates(pass({ xp: 200, tier: 2, premium: true, claimedPremium: 0b01 }));
    expect(states[0]!.premium).toBe("claimed");
    expect(states[1]!.premium).toBe("claimable");
    expect(states[2]!.premium).toBe("locked");
  });

  test("the badge counts both tracks and events", () => {
    expect(passClaimableCount(pass({ xp: 200, tier: 2, premium: true }))).toBe(4);
    expect(passClaimableCount(pass({ xp: 200, tier: 2 }))).toBe(2);
    expect(liveBadge([event({ claimable: true })], pass({ xp: 100, tier: 1 }))).toBe(2);
    expect(liveBadge(null, null)).toBe(0);
  });
});

describe("store helpers", () => {
  test("the daily allowance never goes below zero", () => {
    expect(speedUpAllowance({ speedupTokens: 3, usedTodayMs: 0, dailyCapMs: SPEEDUP_DAILY_CAP_MS })).toEqual({ ms: SPEEDUP_DAILY_CAP_MS, tokens: SPEEDUP_DAILY_CAP_MS / SPEEDUP_TOKEN_MS });
    expect(speedUpAllowance({ speedupTokens: 3, usedTodayMs: SPEEDUP_DAILY_CAP_MS * 2, dailyCapMs: SPEEDUP_DAILY_CAP_MS })).toEqual({ ms: 0, tokens: 0 });
  });

  test("price hints use the language's number format", () => {
    expect(priceHint("en-US", 499)).toBe("$4.99");
    expect(priceHint("fr-FR", 499)).toMatch(/4,99/);
  });
});
