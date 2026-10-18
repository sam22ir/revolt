import { describe, expect, test } from "vitest";
import { advance, maxTrainingBatch, startTraining, trainingQuote, TROOPS, type BaseState } from "../src/index.ts";
import { base, DAY, HOUR, rich, SEC, T0 } from "./helpers.ts";

const started = (r: ReturnType<typeof startTraining>): BaseState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};

describe("startTraining", () => {
  test("deducts the batch cost and queues it on the barracks", () => {
    const s = started(startTraining(rich(), "infantry", 10, T0));
    const unit = TROOPS.infantry.cost;
    expect(s.resources.food).toBe(2000 - unit.food * 10);
    expect(s.resources.materiel).toBe(2000 - unit.materiel * 10);
    expect(s.training).toEqual({ troop: "infantry", count: 10, startedAt: T0, endsAt: T0 + 10 * TROOPS.infantry.trainSecPerUnit * SEC });
    expect(s.troops.infantry).toBe(rich().troops.infantry);
  });

  test("runs alongside a building upgrade (separate queues)", () => {
    const busy = base({ queue: { building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + HOUR } });
    expect(startTraining(busy, "scouts", 1, T0).ok).toBe(true);
  });

  test("refuses a second batch while one trains", () => {
    const s = started(startTraining(rich(), "infantry", 1, T0));
    expect(startTraining(s, "scouts", 1, T0)).toMatchObject({ ok: false, reason: "training_busy" });
  });

  test("refuses bad counts: zero, negative, fractional, above the barracks batch", () => {
    for (const n of [0, -1, 1.5, Number.NaN, maxTrainingBatch(1) + 1]) {
      expect(startTraining(rich(), "infantry", n, T0)).toMatchObject({ ok: false, reason: "bad_count" });
    }
    expect(startTraining(rich(), "porters", maxTrainingBatch(1), T0).ok).toBe(true);
  });

  test("a higher barracks level allows bigger batches", () => {
    const s = rich();
    const lvl2 = { ...s, levels: { ...s.levels, barracks: 2 } };
    expect(startTraining(lvl2, "porters", maxTrainingBatch(2), T0).ok).toBe(true);
  });

  test("refuses what the base cannot pay for, after settling production", () => {
    const poor = base({ resources: { food: 0, materiel: 0, funds: 0, support: 0 } });
    expect(startTraining(poor, "infantry", 5, T0)).toMatchObject({ ok: false, reason: "insufficient" });
    // One hour of level-1 production covers 5 infantry (100 food, 50 materiel, 25 funds).
    expect(startTraining(poor, "infantry", 5, T0 + HOUR).ok).toBe(true);
  });

  test("the quote scales with the count", () => {
    expect(trainingQuote("heavy", 3)).toEqual({
      cost: { food: 90, materiel: 90, funds: 30, support: 0 },
      durationMs: 3 * TROOPS.heavy.trainSecPerUnit * SEC,
    });
  });
});

describe("training completion", () => {
  const s = started(startTraining(rich(), "scouts", 4, T0));
  const end = T0 + 4 * TROOPS.scouts.trainSecPerUnit * SEC;

  test("troops arrive exactly at endsAt, not a millisecond before", () => {
    expect(advance(s, end - 1).troops.scouts).toBe(0);
    expect(advance(s, end - 1).training).not.toBeNull();
    const done = advance(s, end);
    expect(done.troops.scouts).toBe(4);
    expect(done.training).toBeNull();
  });

  test("time going backwards neither completes nor undoes training", () => {
    expect(advance(s, T0 - DAY)).toEqual(s);
    const done = advance(s, end);
    expect(advance(done, T0)).toEqual(done);
  });

  test("a very long offline gap completes the batch once", () => {
    const later = advance(s, T0 + 365 * DAY);
    expect(later.troops.scouts).toBe(4);
    expect(advance(later, T0 + 366 * DAY).troops.scouts).toBe(4);
  });

  test("a training started with a clock behind lastUpdated starts at lastUpdated", () => {
    const ahead = { ...rich(), lastUpdated: T0 + HOUR };
    const r = started(startTraining(ahead, "infantry", 1, T0));
    expect(r.training?.startedAt).toBe(T0 + HOUR);
  });
});
