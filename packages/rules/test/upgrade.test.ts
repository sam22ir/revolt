import { test } from "vitest";
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
import { base, DAY, ex, HOUR, rich, SEC, T0 } from "./helpers.ts";

const started = (r: ReturnType<typeof startUpgrade>): BaseState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};

test("startUpgrade: HQ gate, cost, queue, affordability, max level, clock behind", () => {
  {
    const e = ex("a new base must upgrade the HQ before any producer");
    const fresh = createBaseState(T0);
    e(startUpgrade(fresh, "farm", T0, NO_WORLD), "farm blocked").toMatchObject({ ok: false, reason: "hq_gate" });
    e(startUpgrade(fresh, "hq", T0, NO_WORLD).ok, "hq allowed").toBe(true);
  }

  {
    const e = ex("deducts the cost and queues the job");
    const s = started(startUpgrade(base(), "farm", T0, NO_WORLD));
    e(s.resources, "resources").toEqual({ food: 440, materiel: 460, funds: 420, support: 0 });
    e(s.queue, "queue").toEqual({ building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + 30 * SEC });
    e(s.levels.farm, "level unchanged").toBe(1);
  }

  {
    const e = ex("settles production before checking affordability");
    const poor = base({ resources: { food: 0, materiel: 0, funds: 0, support: 0 } });
    e(startUpgrade(poor, "farm", T0, NO_WORLD), "at T0").toMatchObject({ ok: false, reason: "insufficient" });
    // After 1h: food 120, materiel 100, funds 110, enough for farm L2 (60/40/80).
    e(startUpgrade(poor, "farm", T0 + HOUR, NO_WORLD).ok, "after 1h").toBe(true);
  }

  {
    const s = started(startUpgrade(base(), "farm", T0, NO_WORLD));
    ex("rejects when the queue is busy")(startUpgrade(s, "armory", T0 + SEC, NO_WORLD)).toMatchObject({ ok: false, reason: "queue_busy" });
  }

  {
    const e = ex("producer levels are gated by the HQ level");
    const s = rich();
    e(startUpgrade({ ...s, levels: { ...s.levels, farm: 1 } }, "farm", T0, NO_WORLD).ok, "farm 1 -> 2 at HQ 2").toBe(true);
    e(startUpgrade({ ...s, levels: { ...s.levels, farm: 2 } }, "farm", T0, NO_WORLD), "farm 2 -> 3 at HQ 2").toMatchObject({
      ok: false,
      reason: "hq_gate",
    });
  }

  {
    const s = started(startUpgrade(rich(), "hq", T0, NO_WORLD));
    const busyFree = { ...s, queue: null, levels: { ...s.levels, farm: 2 } };
    ex("gating uses the HQ's current level, not the level it is upgrading to")(checkUpgrade(busyFree, "farm")).toMatchObject({
      ok: false,
      reason: "hq_gate",
    });
  }

  {
    const s = base({ levels: { hq: MAX_BUILDING_LEVEL, farm: 1, armory: 1, treasury: 1, barracks: 1, hero_hall: 1 } });
    ex("rejects at max level")(startUpgrade(s, "hq", T0, NO_WORLD)).toMatchObject({ ok: false, reason: "max_level" });
  }

  {
    const e = ex("a blocked upgrade leaves resources untouched");
    const poor = base({ resources: { food: 10, materiel: 10, funds: 10, support: 0 } });
    const r = startUpgrade(poor, "farm", T0, NO_WORLD);
    e(r.ok, "blocked").toBe(false);
    e(r.state.resources, "resources").toEqual(poor.resources);
  }

  {
    const e = ex("with the clock behind lastUpdated, the job starts at lastUpdated");
    const s = advance(base(), T0 + HOUR, NO_WORLD);
    const after = started(startUpgrade(s, "farm", T0, NO_WORLD));
    e(after.queue?.startedAt, "startedAt").toBe(T0 + HOUR);
    e(after.queue?.endsAt, "endsAt").toBe(T0 + HOUR + 30 * SEC);
  }

  {
    const s = started(startUpgrade(rich(), "treasury", T0, NO_WORLD));
    ex("upgrade costs match the data table")(s.resources.food).toBe(2000 - (BUILDINGS.treasury.levels[1]?.cost.food ?? NaN));
  }
});

test("upgrade completion: exact end, split production, cap raise, long gap, remainingMs", () => {
  const farmJob = (): BaseState => started(startUpgrade(base(), "farm", T0, NO_WORLD));

  {
    const e = ex("not complete one ms before the end; complete exactly at the end");
    const s = farmJob();
    e(advance(s, T0 + 30 * SEC - 1, NO_WORLD).levels.farm, "1ms before").toBe(1);
    const done = advance(s, T0 + 30 * SEC, NO_WORLD);
    e(done.levels.farm, "at end").toBe(2);
    e(done.queue, "queue cleared").toBeNull();
  }

  {
    const t1 = T0 + 30 * SEC;
    const food = advance(farmJob(), t1 + HOUR, NO_WORLD).resources.food;
    const before = (120 * 30 * SEC) / HOUR;
    const after = 180;
    ex("production splits at the completion time: old rate before, new rate after")(food).toBeCloseTo(440 + before + after, 6);
  }

  {
    const e = ex("completed upgrade raises the cap from that moment (HQ)");
    const done = advance(started(startUpgrade(rich(), "hq", T0, NO_WORLD)), T0 + 30 * DAY, NO_WORLD);
    e(done.levels.hq, "hq level").toBe(3);
    e(done.resources, "resources at new cap").toEqual(storageCap(3));
  }

  {
    const e = ex("a long offline gap completes the job exactly once");
    const done = advance(farmJob(), T0 + 10 * 365 * DAY, NO_WORLD);
    e(done.levels.farm, "level").toBe(2);
    e(done.queue, "queue").toBeNull();
    e(advance(done, T0 + 20 * 365 * DAY, NO_WORLD).levels.farm, "not applied twice").toBe(2);
  }

  {
    const e = ex("remainingMs counts down and never goes negative");
    const s = farmJob();
    e(remainingMs(s, T0), "start").toBe(30 * SEC);
    e(remainingMs(s, T0 + 10 * SEC), "10s in").toBe(20 * SEC);
    e(remainingMs(s, T0 + DAY), "long after").toBe(0);
    e(remainingMs(base(), T0), "no job").toBe(0);
  }
});
