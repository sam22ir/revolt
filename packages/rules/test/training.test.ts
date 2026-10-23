import { test } from "vitest";
import { advance, maxTrainingBatch, startTraining, trainingQuote, TROOPS, type BaseState, NO_WORLD } from "../src/index.ts";
import { base, DAY, ex, HOUR, rich, SEC, T0 } from "./helpers.ts";

const started = (r: ReturnType<typeof startTraining>): BaseState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};

test("training: cost, queues, bad counts, batch size, affordability, quote", () => {
  {
    const e = ex("deducts the batch cost and queues it on the barracks");
    const s = started(startTraining(rich(), "infantry", 10, T0, NO_WORLD));
    const unit = TROOPS.infantry.cost;
    e(s.resources.food, "food").toBe(2000 - unit.food * 10);
    e(s.resources.materiel, "materiel").toBe(2000 - unit.materiel * 10);
    e(s.training, "training").toEqual({ troop: "infantry", count: 10, startedAt: T0, endsAt: T0 + 10 * TROOPS.infantry.trainSecPerUnit * SEC });
    e(s.troops.infantry, "troops unchanged until done").toBe(rich().troops.infantry);
  }

  {
    const busy = base({ queue: { building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + HOUR } });
    ex("runs alongside a building upgrade (separate queues)")(startTraining(busy, "scouts", 1, T0, NO_WORLD).ok).toBe(true);
  }

  {
    const s = started(startTraining(rich(), "infantry", 1, T0, NO_WORLD));
    ex("refuses a second batch while one trains")(startTraining(s, "scouts", 1, T0, NO_WORLD)).toMatchObject({ ok: false, reason: "training_busy" });
  }

  {
    const e = ex("refuses bad counts: zero, negative, fractional, above the barracks batch");
    for (const n of [0, -1, 1.5, Number.NaN, maxTrainingBatch(1) + 1]) {
      e(startTraining(rich(), "infantry", n, T0, NO_WORLD), `count ${n}`).toMatchObject({ ok: false, reason: "bad_count" });
    }
    e(startTraining(rich(), "porters", maxTrainingBatch(1), T0, NO_WORLD).ok, "max batch ok").toBe(true);
  }

  {
    const s = rich();
    const lvl2 = { ...s, levels: { ...s.levels, barracks: 2 } };
    ex("a higher barracks level allows bigger batches")(startTraining(lvl2, "porters", maxTrainingBatch(2), T0, NO_WORLD).ok).toBe(true);
  }

  {
    const e = ex("refuses what the base cannot pay for, after settling production");
    const poor = base({ resources: { food: 0, materiel: 0, funds: 0, support: 0 } });
    e(startTraining(poor, "infantry", 5, T0, NO_WORLD), "at T0").toMatchObject({ ok: false, reason: "insufficient" });
    // One hour of level-1 production covers 5 infantry (100 food, 50 materiel, 25 funds).
    e(startTraining(poor, "infantry", 5, T0 + HOUR, NO_WORLD).ok, "after 1h").toBe(true);
  }

  ex("the quote scales with the count")(trainingQuote("heavy", 3)).toEqual({
    cost: { food: 90, materiel: 90, funds: 30, support: 0 },
    durationMs: 3 * TROOPS.heavy.trainSecPerUnit * SEC,
  });
});

test("training completion: exact end, clock backwards, long gap, clock behind lastUpdated", () => {
  const s = started(startTraining(rich(), "scouts", 4, T0, NO_WORLD));
  const end = T0 + 4 * TROOPS.scouts.trainSecPerUnit * SEC;

  {
    const e = ex("troops arrive exactly at endsAt, not a millisecond before");
    e(advance(s, end - 1, NO_WORLD).troops.scouts, "1ms before: troops").toBe(0);
    e(advance(s, end - 1, NO_WORLD).training, "1ms before: still training").not.toBeNull();
    const done = advance(s, end, NO_WORLD);
    e(done.troops.scouts, "at end: troops").toBe(4);
    e(done.training, "at end: queue cleared").toBeNull();
  }

  {
    const e = ex("time going backwards neither completes nor undoes training");
    e(advance(s, T0 - DAY, NO_WORLD), "before completion").toEqual(s);
    const done = advance(s, end, NO_WORLD);
    e(advance(done, T0, NO_WORLD), "after completion").toEqual(done);
  }

  {
    const e = ex("a very long offline gap completes the batch once");
    const later = advance(s, T0 + 365 * DAY, NO_WORLD);
    e(later.troops.scouts, "after a year").toBe(4);
    e(advance(later, T0 + 366 * DAY, NO_WORLD).troops.scouts, "not applied twice").toBe(4);
  }

  {
    const ahead = { ...rich(), lastUpdated: T0 + HOUR };
    const r = started(startTraining(ahead, "infantry", 1, T0, NO_WORLD));
    ex("a training started with a clock behind lastUpdated starts at lastUpdated")(r.training?.startedAt).toBe(T0 + HOUR);
  }
});
