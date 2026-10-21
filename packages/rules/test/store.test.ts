import { describe, expect, test } from "vitest";
import {
  advance,
  COSMETIC_IDS,
  COSMETIC_SLOTS,
  grantReward,
  MAX_PRODUCT_RESOURCES,
  MAX_PRODUCT_TOKENS,
  PASS_TIERS,
  PRODUCT_SKUS,
  PRODUCTS,
  slotOf,
  SPEEDUP_DAILY_CAP_MS,
  SPEEDUP_MAX_PER_USE,
  SPEEDUP_TOKEN_MS,
  speedUp,
  startTraining,
  startUpgrade,
  storageCap,
  usedToday,
  utcDay,
  EVENTS,
  EVENT_IDS,
  type BaseState,
} from "../src/index.ts";
import { DAY, HOUR, MIN, rich, T0, withHeroes } from "./helpers.ts";

/** A rich base with a long non-HQ upgrade running. */
const building = (): BaseState => {
  const big: BaseState = {
    ...rich(),
    levels: { ...rich().levels, hq: 8, farm: 5 },
    resources: { food: 50_000, materiel: 50_000, funds: 50_000, support: 5000 },
  };
  const r = startUpgrade(big, "farm", T0);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe("speedUp", () => {
  test("removes token time from a running upgrade and charges for it", () => {
    const s = building();
    const before = s.queue!.endsAt;
    const r = speedUp(s, "upgrade", 1, 5, 0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.appliedMs).toBe(SPEEDUP_TOKEN_MS);
    expect(r.tokensUsed).toBe(1);
    expect(r.state.queue!.endsAt).toBe(before - SPEEDUP_TOKEN_MS);
  });

  test("works on training too", () => {
    const t = startTraining(rich(), "infantry", 20, T0);
    if (!t.ok) throw new Error(t.reason);
    const r = speedUp(t.state, "training", 1, 1, 0, T0);
    expect(r.ok && r.state.training!.endsAt).toBeLessThan(t.state.training!.endsAt);
  });

  test("refuses nothing-to-speed, too few tokens and silly amounts", () => {
    const s = rich();
    expect(speedUp(s, "upgrade", 1, 5, 0, T0)).toMatchObject({ ok: false, reason: "no_speedup_job" });
    const b = building();
    expect(speedUp(b, "upgrade", 3, 2, 0, T0)).toMatchObject({ ok: false, reason: "too_few_tokens" });
    for (const n of [0, -1, 1.5, NaN, SPEEDUP_MAX_PER_USE + 1]) expect(speedUp(b, "upgrade", n, 99, 0, T0)).toMatchObject({ ok: false, reason: "bad_amount" });
  });

  test("never touches the headquarters' own upgrade: paid time cannot buy the progression gate", () => {
    const hq = startUpgrade(rich(), "hq", T0);
    if (!hq.ok) throw new Error(hq.reason);
    expect(speedUp(hq.state, "upgrade", 1, 99, 0, T0)).toMatchObject({ ok: false, reason: "hq_job" });
    // The gate that blocks other buildings is unchanged by any amount of speed-up.
    const gated = startUpgrade({ ...rich(), levels: { ...rich().levels, hq: 1 } }, "farm", T0);
    expect(gated).toMatchObject({ ok: false, reason: "hq_gate" });
  });

  test("the daily cap limits total time, and the last token is clamped to what is left", () => {
    const b = building();
    expect(speedUp(b, "upgrade", 1, 5, SPEEDUP_DAILY_CAP_MS, T0)).toMatchObject({ ok: false, reason: "daily_cap" });
    const left = 5 * MIN;
    const r = speedUp(b, "upgrade", 5, 5, SPEEDUP_DAILY_CAP_MS - left, T0);
    expect(r.ok && r.appliedMs).toBe(left);
    expect(r.ok && r.tokensUsed).toBe(1);
  });

  test("a speed-up never ends a job before now or before settled time", () => {
    const b = building();
    const nearEnd = b.queue!.endsAt - MIN;
    const r = speedUp(b, "upgrade", 20, 20, 0, nearEnd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.queue === null || r.state.queue.endsAt >= nearEnd).toBe(true);
    // Time going backwards: asking with an earlier clock cannot pull the end before the settled time.
    const backwards = speedUp(r.state, "upgrade", 1, 5, 0, T0 - HOUR);
    if (backwards.ok) expect(backwards.state.queue!.endsAt).toBeGreaterThanOrEqual(backwards.state.lastUpdated);
  });

  test("a job that is already finished is no job", () => {
    const b = building();
    expect(speedUp(b, "upgrade", 1, 1, 0, b.queue!.endsAt + 1)).toMatchObject({ ok: false, reason: "no_speedup_job" });
  });

  test("tokens are charged for time removed, not for time wished for", () => {
    const b = building();
    const almost = b.queue!.endsAt - 2 * MIN;
    const r = speedUp(b, "upgrade", 10, 10, 0, almost);
    expect(r.ok && r.tokensUsed).toBe(1);
  });
});

describe("daily usage", () => {
  test("resets on a new UTC day, keeps its usage if the clock moves back", () => {
    const day = utcDay(T0);
    expect(usedToday(day, 100, T0)).toBe(100);
    expect(usedToday(day - 1, 100, T0)).toBe(0);
    expect(usedToday(day + 1, 100, T0)).toBe(100);
    expect(usedToday(day, 100, T0 + DAY)).toBe(0);
    expect(usedToday(day, -5, T0)).toBe(0);
  });

  test("a very long gap resets and does not overflow", () => {
    expect(usedToday(utcDay(T0), 1e9, T0 + 100_000 * DAY)).toBe(0);
  });
});

describe("grantReward", () => {
  test("fills storage up to the cap and never lowers an amount above it", () => {
    const s = rich();
    const cap = storageCap(s.levels.hq);
    const g = grantReward(s, { resources: { food: 1e9 } }, T0);
    expect(g.resources.food).toBe(cap.food);
    const over: BaseState = { ...s, resources: { ...s.resources, food: cap.food + 500 } };
    expect(grantReward(over, { resources: { food: 100 } }, T0).resources.food).toBe(advance(over, T0).resources.food);
  });

  test("shards go to the first owned hero of the background", () => {
    const a = grantReward(withHeroes(rich(), { dock_foreman: { level: 1, shards: 0 }, hill_commander: { level: 1, shards: 0 } }), { shards: 3 }, T0, "algeria");
    expect(a.heroes.owned.dock_foreman?.shards).toBe(3);
    expect(a.heroes.owned.hill_commander?.shards).toBe(0);
    const v = grantReward(withHeroes(rich(), { trail_scout: { level: 1, shards: 0 } }), { shards: 3 }, T0, "vietnam");
    expect(v.heroes.owned.trail_scout?.shards).toBe(3);
  });

  test("shards are dropped when the player owns no hero of the background", () => {
    const g = grantReward(withHeroes(rich(), { trail_scout: { level: 1, shards: 0 } }), { shards: 3 }, T0, "algeria");
    expect(g.heroes.owned.trail_scout?.shards).toBe(0);
  });

  test("ignores negative amounts", () => {
    const s = withHeroes(rich(), { mountain_guide: { level: 1, shards: 0 } });
    expect(grantReward(s, { resources: { food: -999 }, shards: -4 }, T0).heroes.owned.mountain_guide?.shards).toBe(0);
  });
});

describe("fair free-to-play (GDD 8)", () => {
  test("no product sells shards or heroes; bundles and tokens stay modest", () => {
    for (const sku of PRODUCT_SKUS) {
      const p = PRODUCTS[sku];
      expect(p.grants.shards, sku).toBeUndefined();
      const total = Object.values(p.grants.resources ?? {}).reduce((n, v) => n + (v ?? 0), 0);
      expect(total, sku).toBeLessThanOrEqual(MAX_PRODUCT_RESOURCES);
      expect(p.grants.speedupTokens ?? 0, sku).toBeLessThanOrEqual(MAX_PRODUCT_TOKENS);
      expect(p.priceHintUsdCents).toBeGreaterThan(0);
    }
  });

  test("the daily speed-up cap bounds what any amount of tokens can do", () => {
    const tokensPerDay = SPEEDUP_DAILY_CAP_MS / SPEEDUP_TOKEN_MS;
    expect(tokensPerDay).toBeLessThanOrEqual(24);
    for (const sku of PRODUCT_SKUS) if (PRODUCTS[sku].kind === "speedup") expect(PRODUCTS[sku].dailyLimit).toBeDefined();
  });

  test("cosmetics are looks only: every id has a slot, and products and pass only grant known ids", () => {
    for (const id of COSMETIC_IDS) expect(COSMETIC_SLOTS).toContain(slotOf(id));
    for (const sku of PRODUCT_SKUS) {
      const c = PRODUCTS[sku].grants.cosmetic;
      if (c !== undefined) expect(COSMETIC_IDS).toContain(c);
    }
    expect(Object.keys(PRODUCTS)).toEqual([...PRODUCT_SKUS]);
  });

  test("free players can earn what the pass sells: pass shards and event shards are free", () => {
    expect(PASS_TIERS.some((t) => (t.free.shards ?? 0) > 0)).toBe(true);
    expect(EVENT_IDS.some((id) => EVENTS[id].tiers.some((t) => (t.reward.shards ?? 0) > 0))).toBe(true);
  });

  test("only one product unlocks the pass, and it grants nothing else", () => {
    const passes = PRODUCT_SKUS.filter((s) => PRODUCTS[s].passPremium === true);
    expect(passes).toEqual(["pass_premium"]);
    expect(PRODUCTS.pass_premium.grants).toEqual({});
  });
});
