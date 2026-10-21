import { describe, expect, test } from "vitest";
import {
  addPassXp,
  claimableTiers,
  claimTier,
  COSMETIC_IDS,
  EMPTY_PASS,
  PASS_TIER_COUNT,
  PASS_TIERS,
  PASS_XP_PER_TIER,
  reachedTier,
  type PassProgress,
} from "../src/index.ts";

const at = (tier: number, extra: Partial<PassProgress> = {}): PassProgress => ({ ...EMPTY_PASS, xp: tier * PASS_XP_PER_TIER, ...extra });

describe("battle pass progress", () => {
  test("tiers come from xp and stop at the last", () => {
    expect(reachedTier(EMPTY_PASS)).toBe(0);
    expect(reachedTier({ ...EMPTY_PASS, xp: PASS_XP_PER_TIER - 1 })).toBe(0);
    expect(reachedTier({ ...EMPTY_PASS, xp: PASS_XP_PER_TIER })).toBe(1);
    expect(reachedTier({ ...EMPTY_PASS, xp: 1e12 })).toBe(PASS_TIER_COUNT);
    expect(reachedTier({ ...EMPTY_PASS, xp: -50 })).toBe(0);
  });

  test("xp is capped at the last tier and ignores junk", () => {
    expect(addPassXp(EMPTY_PASS, 1e12).xp).toBe(PASS_TIER_COUNT * PASS_XP_PER_TIER);
    expect(addPassXp(EMPTY_PASS, 0)).toBe(EMPTY_PASS);
    expect(addPassXp(EMPTY_PASS, -5)).toBe(EMPTY_PASS);
    expect(addPassXp(EMPTY_PASS, 12.7).xp).toBe(12);
  });

  test("an unreached tier cannot be claimed", () => {
    expect(claimTier(at(2), 3, "free")).toEqual({ ok: false, reason: "tier_unreached" });
    expect(claimTier(EMPTY_PASS, 1, "free")).toEqual({ ok: false, reason: "tier_unreached" });
  });

  test("bad tiers are refused", () => {
    for (const t of [0, -1, PASS_TIER_COUNT + 1, 1.5, NaN]) expect(claimTier(at(30), t, "free")).toEqual({ ok: false, reason: "bad_tier" });
  });

  test("a tier pays once per track", () => {
    const first = claimTier(at(3), 2, "free");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.reward).toEqual(PASS_TIERS[1]!.free);
    expect(claimTier(first.progress, 2, "free")).toEqual({ ok: false, reason: "already_claimed" });
    // Other tiers and the other track are unaffected.
    expect(claimTier(first.progress, 1, "free").ok).toBe(true);
  });

  test("the premium track is locked without the unlock", () => {
    expect(claimTier(at(5), 5, "premium")).toEqual({ ok: false, reason: "premium_locked" });
    const r = claimTier(at(5, { premium: true }), 5, "premium");
    expect(r.ok && r.reward).toEqual(PASS_TIERS[4]!.premium);
    // Premium and free claims are independent.
    expect(claimTier(at(5, { premium: true, claimedPremium: 0b10000 }), 5, "free").ok).toBe(true);
  });

  test("claimable tiers list what is reached and not yet taken; premium only with the unlock", () => {
    const p = at(4, { claimedFree: 0b0011 });
    expect(claimableTiers(p)).toEqual({ free: [3, 4], premium: [] });
    expect(claimableTiers({ ...p, premium: true, claimedPremium: 0b1000 })).toEqual({ free: [3, 4], premium: [1, 2, 3] });
  });

  test("claiming all 30 tiers on both tracks fits the bit masks", () => {
    let p: PassProgress = { ...EMPTY_PASS, xp: 1e9, premium: true };
    for (let t = 1; t <= PASS_TIER_COUNT; t++) {
      for (const track of ["free", "premium"] as const) {
        const r = claimTier(p, t, track);
        expect(r.ok).toBe(true);
        if (r.ok) p = r.progress;
      }
    }
    expect(claimableTiers(p)).toEqual({ free: [], premium: [] });
    expect(p.claimedFree).toBe(2 ** PASS_TIER_COUNT - 1);
  });
});

describe("pass data is fair (GDD 8)", () => {
  test("tiers are numbered 1..N", () => {
    expect(PASS_TIERS.map((t) => t.tier)).toEqual(Array.from({ length: PASS_TIER_COUNT }, (_, i) => i + 1));
  });

  test("the premium track never gives shards, and gives no more tokens than the free track does or fixed small amounts", () => {
    const sum = (f: (t: (typeof PASS_TIERS)[number]) => number): number => PASS_TIERS.reduce((n, t) => n + f(t), 0);
    expect(sum((t) => t.premium.shards ?? 0)).toBe(0);
    expect(sum((t) => t.free.shards ?? 0)).toBeGreaterThan(0);
    expect(sum((t) => t.premium.speedupTokens ?? 0)).toBeLessThanOrEqual(10);
    expect(sum((t) => t.free.speedupTokens ?? 0)).toBeGreaterThan(0);
    // Free players get at least as much raw resource as premium ones.
    const res = (r: (typeof PASS_TIERS)[number]["free"]): number => Object.values(r.resources ?? {}).reduce((n, v) => n + (v ?? 0), 0);
    expect(sum((t) => res(t.free))).toBeGreaterThanOrEqual(sum((t) => res(t.premium)));
  });

  test("the free track has no cosmetics lock-in beyond the premium ones, and every cosmetic id exists", () => {
    for (const t of PASS_TIERS) {
      expect(t.free.cosmetic).toBeUndefined();
      if (t.premium.cosmetic !== undefined) expect(COSMETIC_IDS).toContain(t.premium.cosmetic);
    }
  });
});
