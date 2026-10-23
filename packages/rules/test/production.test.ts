import { expect, test } from "vitest";
import { advance, createBaseState, productionPerHour, RESOURCE_IDS, storageCap, NO_WORLD } from "../src/index.ts";
import { base, DAY, ex, HOUR, MIN, T0 } from "./helpers.ts";

test("production: rates, linear accrual, cap, and clock edge cases", () => {
  ex("starting rates come from level 1 of each building")(productionPerHour(createBaseState(T0).levels, 1)).toEqual({
    food: 120,
    materiel: 100,
    funds: 110,
    support: 20,
  });

  {
    const e = ex("accrues linearly from timestamps");
    const s = advance(base(), T0 + HOUR, NO_WORLD);
    e(s.resources.food, "food").toBeCloseTo(500 + 120);
    e(s.resources.materiel, "materiel").toBeCloseTo(600);
    e(s.resources.funds, "funds").toBeCloseTo(610);
    e(s.resources.support, "support").toBeCloseTo(30);
    e(s.lastUpdated, "lastUpdated").toBe(T0 + HOUR);
  }

  {
    const e = ex("advancing in steps equals advancing in one go");
    let stepped = base();
    for (let i = 1; i <= 60; i++) stepped = advance(stepped, T0 + i * MIN, NO_WORLD);
    const once = advance(base(), T0 + HOUR, NO_WORLD);
    for (const id of RESOURCE_IDS) e(stepped.resources[id], id).toBeCloseTo(once.resources[id], 6);
  }

  ex("stops at the storage cap")(advance(base(), T0 + 30 * DAY, NO_WORLD).resources).toEqual(storageCap(2));

  {
    const e = ex("an amount already above the cap is not clamped down");
    const s = advance(base({ resources: { food: 9999, materiel: 0, funds: 0, support: 0 } }), T0 + HOUR, NO_WORLD);
    e(s.resources.food, "food kept").toBe(9999);
    e(s.resources.materiel, "materiel produced").toBeCloseTo(100);
  }

  {
    const s = base();
    ex("same timestamp is a no-op")(advance(s, T0, NO_WORLD)).toBe(s);
  }

  {
    const e = ex("clock going backwards produces nothing and keeps lastUpdated");
    const s = advance(base(), T0 + HOUR, NO_WORLD);
    const back = advance(s, T0 - DAY, NO_WORLD);
    e(back, "same state").toBe(s);
    e(back.lastUpdated, "lastUpdated").toBe(T0 + HOUR);
  }

  {
    const forwardOnly = advance(base(), T0 + 2 * HOUR, NO_WORLD);
    let s = advance(base(), T0 + HOUR, NO_WORLD);
    s = advance(s, T0 - 5 * HOUR, NO_WORLD);
    s = advance(s, T0 + 2 * HOUR, NO_WORLD);
    ex("back then forward gives the same result as forward only (no double production)")(s).toEqual(forwardOnly);
  }

  {
    const e = ex("a very long offline gap stays finite and capped");
    const s = advance(base(), T0 + 20 * 365 * DAY, NO_WORLD);
    for (const id of RESOURCE_IDS) {
      e(Number.isFinite(s.resources[id]), `${id} finite`).toBe(true);
      e(s.resources[id], `${id} capped`).toBe(storageCap(2)[id]);
    }
  }
});
