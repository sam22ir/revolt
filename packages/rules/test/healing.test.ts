import { describe, expect, test } from "vitest";
import {
  advance,
  checkHealing,
  createBaseState,
  HEAL_BATCH_PER_LEVEL,
  healingQuote,
  isBaseState,
  maxHealingBatch,
  migrateBaseState,
  planHealing,
  startHealing,
  totalTroops,
  TROOPS,
  type BaseState,
  type Troops,
} from "../src/index.ts";
import { base, DAY, MIN, rich, T0 } from "./helpers.ts";

const NO_WORLD = { liberations: [] };
const troops = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const hurt = (s: BaseState, w: Troops): BaseState => ({ ...s, wounded: w });

describe("planning a batch", () => {
  test("takes wounded in troop order up to the infirmary's batch", () => {
    const s = hurt(rich(), troops(10, 8, 30));
    expect(maxHealingBatch(1)).toBe(HEAL_BATCH_PER_LEVEL);
    expect(planHealing(s)).toEqual(troops(10, 5, 0));
    const bigger = { ...s, levels: { ...s.levels, infirmary: 4 } };
    expect(planHealing(bigger)).toEqual(troops(10, 8, 30));
  });

  test("takes only what the resources pay for", () => {
    const poor = hurt(base({ resources: { food: 20, materiel: 20, funds: 20, support: 0 } }), troops(10));
    const per = healingQuote(troops(1)).cost;
    const n = Math.min(...(["food", "materiel", "funds"] as const).map((r) => Math.floor(20 / per[r])));
    expect(planHealing(poor)).toEqual(troops(n));
    expect(checkHealing(hurt(base({ resources: { food: 0, materiel: 0, funds: 0, support: 0 } }), troops(10)))).toBe("insufficient");
  });

  test("healing costs a share of training, never nothing, and takes a share of its time", () => {
    const q = healingQuote(troops(1));
    expect(q.cost.food).toBeGreaterThan(0);
    expect(q.cost.food).toBeLessThan(TROOPS.infantry.cost.food);
    expect(q.durationMs).toBeLessThan(TROOPS.infantry.trainSecPerUnit * 1000);
    expect(healingQuote(troops(0))).toEqual({ cost: { food: 0, materiel: 0, funds: 0, support: 0 }, durationMs: 0 });
  });
});

describe("starting and finishing", () => {
  test("nobody wounded, or a batch already in, is refused", () => {
    expect(startHealing(rich(), T0, NO_WORLD)).toMatchObject({ ok: false, reason: "no_wounded" });
    const started = startHealing(hurt(rich(), troops(5)), T0, NO_WORLD);
    expect(started.ok).toBe(true);
    const again = startHealing(hurt(started.state, troops(3)), T0 + 1, NO_WORLD);
    expect(again).toMatchObject({ ok: false, reason: "infirmary_busy" });
  });

  test("the batch leaves the wounded, costs its price, and comes home ready at its end", () => {
    const s = hurt(rich(), troops(6, 2));
    const r = startHealing(s, T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    const q = healingQuote(troops(6, 2));
    expect(r.state.wounded).toEqual(troops(0, 0));
    expect(r.state.healing).toEqual({ troops: troops(6, 2), startedAt: T0, endsAt: T0 + q.durationMs });
    expect(r.state.resources.food).toBeCloseTo(s.resources.food - q.cost.food, 6);
    const before = advance(r.state, T0 + q.durationMs - 1, NO_WORLD);
    expect(before.healing).not.toBeNull();
    expect(before.troops).toEqual(s.troops);
    const after = advance(r.state, T0 + q.durationMs, NO_WORLD);
    expect(after.healing).toBeNull();
    expect(after.troops.infantry).toBe(s.troops.infantry + 6);
    expect(after.troops.scouts).toBe(s.troops.scouts + 2);
  });

  test("a very long gap finishes the batch once; time going backwards starts from the last trusted time", () => {
    const r = startHealing(hurt(rich(), troops(4)), T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    const far = advance(r.state, T0 + 400 * DAY, NO_WORLD);
    expect(far.troops.infantry).toBe(rich().troops.infantry + 4);
    expect(totalTroops(far.wounded)).toBe(0);
    const later = { ...hurt(rich(), troops(2)), lastUpdated: T0 + 10 * MIN };
    const back = startHealing(later, T0, NO_WORLD);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.healing?.startedAt).toBe(T0 + 10 * MIN);
  });
});

describe("saves", () => {
  test("an older base gets the two buildings at level 1 and no batch", () => {
    const old = { ...createBaseState(T0) } as Record<string, unknown>;
    const levels = { ...(old.levels as Record<string, number>) };
    delete levels.watchtower;
    delete levels.infirmary;
    delete old.healing;
    const migrated = migrateBaseState({ ...old, levels }) as BaseState;
    expect(isBaseState(migrated)).toBe(true);
    expect([migrated.levels.watchtower, migrated.levels.infirmary, migrated.healing]).toEqual([1, 1, null]);
  });

  test("a forged batch with nobody in it is refused", () => {
    expect(isBaseState({ ...createBaseState(T0), healing: { troops: troops(0), startedAt: T0, endsAt: T0 + 1 } })).toBe(false);
    expect(isBaseState({ ...createBaseState(T0), healing: { troops: troops(3), startedAt: T0, endsAt: T0 + 1 } })).toBe(true);
  });
});
