import { describe, expect, test } from "vitest";
import { advance, createBaseState, productionPerHour, RESOURCE_IDS, storageCap } from "../src/index.ts";
import { base, DAY, HOUR, MIN, T0 } from "./helpers.ts";

describe("production", () => {
  test("starting rates come from level 1 of each building", () => {
    expect(productionPerHour(createBaseState(T0).levels)).toEqual({ food: 120, materiel: 100, funds: 110, support: 20 });
  });

  test("accrues linearly from timestamps", () => {
    const s = advance(base(), T0 + HOUR);
    expect(s.resources.food).toBeCloseTo(500 + 120);
    expect(s.resources.materiel).toBeCloseTo(600);
    expect(s.resources.funds).toBeCloseTo(610);
    expect(s.resources.support).toBeCloseTo(30);
    expect(s.lastUpdated).toBe(T0 + HOUR);
  });

  test("advancing in steps equals advancing in one go", () => {
    let stepped = base();
    for (let i = 1; i <= 60; i++) stepped = advance(stepped, T0 + i * MIN);
    const once = advance(base(), T0 + HOUR);
    for (const id of RESOURCE_IDS) expect(stepped.resources[id]).toBeCloseTo(once.resources[id], 6);
  });

  test("stops at the storage cap", () => {
    const s = advance(base(), T0 + 30 * DAY);
    expect(s.resources).toEqual(storageCap(2));
  });

  test("an amount already above the cap is not clamped down", () => {
    const s = advance(base({ resources: { food: 9999, materiel: 0, funds: 0, support: 0 } }), T0 + HOUR);
    expect(s.resources.food).toBe(9999);
    expect(s.resources.materiel).toBeCloseTo(100);
  });

  test("same timestamp is a no-op", () => {
    const s = base();
    expect(advance(s, T0)).toBe(s);
  });

  test("clock going backwards produces nothing and keeps lastUpdated", () => {
    const s = advance(base(), T0 + HOUR);
    const back = advance(s, T0 - DAY);
    expect(back).toBe(s);
    expect(back.lastUpdated).toBe(T0 + HOUR);
  });

  test("back then forward gives the same result as forward only (no double production)", () => {
    const forwardOnly = advance(base(), T0 + 2 * HOUR);
    let s = advance(base(), T0 + HOUR);
    s = advance(s, T0 - 5 * HOUR);
    s = advance(s, T0 + 2 * HOUR);
    expect(s).toEqual(forwardOnly);
  });

  test("a very long offline gap stays finite and capped", () => {
    const s = advance(base(), T0 + 20 * 365 * DAY);
    for (const id of RESOURCE_IDS) {
      expect(Number.isFinite(s.resources[id])).toBe(true);
      expect(s.resources[id]).toBe(storageCap(2)[id]);
    }
  });
});
