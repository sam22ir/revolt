import { describe, expect, test } from "vitest";
import {
  advance,
  BUILDINGS,
  checkUpgrade,
  createBaseState,
  MAX_BUILDING_LEVEL,
  remainingMs,
  startUpgrade,
  storageCap,
  type BaseState,
  NO_WORLD,
} from "../src/index.ts";
import { base, DAY, HOUR, rich, SEC, T0 } from "./helpers.ts";

const started = (s: BaseState, r: ReturnType<typeof startUpgrade>): BaseState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};

describe("startUpgrade", () => {
  test("a new base must upgrade the HQ before any producer", () => {
    const fresh = createBaseState(T0);
    expect(startUpgrade(fresh, "farm", T0, NO_WORLD)).toMatchObject({ ok: false, reason: "hq_gate" });
    expect(startUpgrade(fresh, "hq", T0, NO_WORLD).ok).toBe(true);
  });

  test("deducts the cost and queues the job", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    expect(s.resources).toEqual({ food: 440, materiel: 460, funds: 420, support: 0 });
    expect(s.queue).toEqual({ building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + 30 * SEC });
    expect(s.levels.farm).toBe(1);
  });

  test("settles production before checking affordability", () => {
    const poor = base({ resources: { food: 0, materiel: 0, funds: 0, support: 0 } });
    expect(startUpgrade(poor, "farm", T0, NO_WORLD)).toMatchObject({ ok: false, reason: "insufficient" });
    // After 1h: food 120, materiel 100, funds 110 — enough for farm L2 (60/40/80).
    expect(startUpgrade(poor, "farm", T0 + HOUR, NO_WORLD).ok).toBe(true);
  });

  test("rejects when the queue is busy", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    expect(startUpgrade(s, "armory", T0 + SEC, NO_WORLD)).toMatchObject({ ok: false, reason: "queue_busy" });
  });

  test("producer levels are gated by the HQ level", () => {
    const s = rich();
    const r = startUpgrade({ ...s, levels: { ...s.levels, farm: 1 } }, "farm", T0, NO_WORLD);
    expect(r.ok).toBe(true);
    const gated = { ...s, levels: { ...s.levels, farm: 2 } };
    expect(startUpgrade(gated, "farm", T0, NO_WORLD)).toMatchObject({ ok: false, reason: "hq_gate" });
  });

  test("gating uses the HQ's current level, not the level it is upgrading to", () => {
    const s = started(rich(), startUpgrade(rich(), "hq", T0, NO_WORLD));
    const busyFree = { ...s, queue: null, levels: { ...s.levels, farm: 2 } };
    expect(checkUpgrade(busyFree, "farm")).toMatchObject({ ok: false, reason: "hq_gate" });
  });

  test("rejects at max level", () => {
    const s = base({ levels: { hq: MAX_BUILDING_LEVEL, farm: 1, armory: 1, treasury: 1, barracks: 1 } });
    expect(startUpgrade(s, "hq", T0, NO_WORLD)).toMatchObject({ ok: false, reason: "max_level" });
  });

  test("a blocked upgrade leaves resources untouched", () => {
    const poor = base({ resources: { food: 10, materiel: 10, funds: 10, support: 0 } });
    const r = startUpgrade(poor, "farm", T0, NO_WORLD);
    expect(r.ok).toBe(false);
    expect(r.state.resources).toEqual(poor.resources);
  });

  test("with the clock behind lastUpdated, the job starts at lastUpdated", () => {
    const s = advance(base(), T0 + HOUR, NO_WORLD);
    const after = started(s, startUpgrade(s, "farm", T0, NO_WORLD));
    expect(after.queue?.startedAt).toBe(T0 + HOUR);
    expect(after.queue?.endsAt).toBe(T0 + HOUR + 30 * SEC);
  });
});

describe("lazy completion", () => {
  test("not complete one ms before the end; complete exactly at the end", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    expect(advance(s, T0 + 30 * SEC - 1, NO_WORLD).levels.farm).toBe(1);
    const done = advance(s, T0 + 30 * SEC, NO_WORLD);
    expect(done.levels.farm).toBe(2);
    expect(done.queue).toBeNull();
  });

  test("production splits at the completion time: old rate before, new rate after", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    const t1 = T0 + 30 * SEC;
    const now = t1 + HOUR;
    const food = advance(s, now, NO_WORLD).resources.food;
    const before = (120 * 30 * SEC) / HOUR;
    const after = 180;
    expect(food).toBeCloseTo(440 + before + after, 6);
  });

  test("completed upgrade raises the cap from that moment (HQ)", () => {
    const s = started(rich(), startUpgrade(rich(), "hq", T0, NO_WORLD));
    const done = advance(s, T0 + 30 * DAY, NO_WORLD);
        expect(done.levels.hq).toBe(3);
    expect(done.resources).toEqual(storageCap(3));
  });

  test("a long offline gap completes the job exactly once", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    const done = advance(s, T0 + 10 * 365 * DAY, NO_WORLD);
    expect(done.levels.farm).toBe(2);
    expect(done.queue).toBeNull();
    expect(advance(done, T0 + 20 * 365 * DAY, NO_WORLD).levels.farm).toBe(2);
  });

  test("remainingMs counts down and never goes negative", () => {
    const s = started(base(), startUpgrade(base(), "farm", T0, NO_WORLD));
    expect(remainingMs(s, T0)).toBe(30 * SEC);
    expect(remainingMs(s, T0 + 10 * SEC)).toBe(20 * SEC);
    expect(remainingMs(s, T0 + DAY)).toBe(0);
    expect(remainingMs(base(), T0)).toBe(0);
  });

  test("upgrade costs match the data table", () => {
    const s = started(rich(), startUpgrade(rich(), "treasury", T0, NO_WORLD));
    expect(s.resources.food).toBe(2000 - (BUILDINGS.treasury.levels[1]?.cost.food ?? NaN));
  });
});
