import { describe, expect, test } from "vitest";
import {
  advance,
  createBaseState,
  isBaseState,
  MARCH_RESCUE_GRACE_MS,
  MAX_MARCHES,
  marchSpeed,
  migrateBaseState,
  planMarch,
  settleMarch,
  startMarch,
  storageCap,
  travelMs,
  ZERO_TROOPS,
  type BaseState,
  type MarchOutcome,
  type MarchState,
  type Troops,
} from "../src/index.ts";
import { base, DAY, HOUR, MIN, SEC, T0 } from "./helpers.ts";

const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const FROM = { x: 10, y: 10 };
const TO = { x: 16, y: 18 }; // 10 tiles away

const march = (troops: Troops, id = "m1", now = T0): Omit<MarchState, "outcome"> => ({
  id,
  target: { npcId: "n1", level: 1, ...TO },
  from: FROM,
  troops,
  ...planMarch(FROM, TO, troops, now),
});

const sent = (s: BaseState, m: Omit<MarchState, "outcome">, now = T0): BaseState => {
  const r = startMarch(s, m, now);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};

const win = (m: Omit<MarchState, "outcome">): MarchOutcome => ({
  result: "victory",
  survivors: t(m.troops.infantry - 2),
  wounded: t(2),
  lost: ZERO_TROOPS,
  loot: { food: 300, materiel: 0, funds: 0, support: 0 },
});

describe("travel", () => {
  test("moves at the slowest unit's speed", () => {
    expect(marchSpeed(t(5))).toBe(2);
    expect(marchSpeed(t(5, 5))).toBe(2);
    expect(marchSpeed(t(5, 5, 1))).toBe(1);
    expect(marchSpeed(t(0, 5))).toBe(4);
    expect(marchSpeed(ZERO_TROOPS)).toBe(0);
  });

  test("travel time is distance over speed, in whole ms, at least a second", () => {
    expect(travelMs(FROM, TO, t(5))).toBe(5 * MIN); // 10 tiles at 2/min
    expect(travelMs(FROM, TO, t(0, 0, 1))).toBe(10 * MIN);
    expect(travelMs(FROM, FROM, t(5))).toBe(SEC);
    expect(planMarch(FROM, TO, t(5), T0)).toEqual({ departAt: T0, arriveAt: T0 + 5 * MIN, returnAt: T0 + 10 * MIN });
  });
});

describe("startMarch", () => {
  test("takes the troops out of the base and records the march", () => {
    const s = sent(base(), march(t(6)));
    expect(s.troops.infantry).toBe(4);
    expect(s.marches).toEqual([{ ...march(t(6)), outcome: null }]);
  });

  test("refuses more troops than are home", () => {
    expect(startMarch(base(), march(t(11)), T0)).toMatchObject({ ok: false, reason: "not_enough_troops" });
    expect(startMarch(base(), march(t(0, 1)), T0)).toMatchObject({ ok: false, reason: "not_enough_troops" });
  });

  test("refuses a march with no fighting troops", () => {
    expect(startMarch(base(), march(ZERO_TROOPS), T0)).toMatchObject({ ok: false, reason: "no_troops" });
    const withPorters = base({ troops: t(0, 0, 0, 5) });
    expect(startMarch(withPorters, march(t(0, 0, 0, 5)), T0)).toMatchObject({ ok: false, reason: "no_troops" });
  });

  test(`allows at most ${MAX_MARCHES} marches out at once`, () => {
    let s = base();
    for (let i = 0; i < MAX_MARCHES; i++) s = sent(s, march(t(1), `m${i}`));
    expect(startMarch(s, march(t(1), "extra"), T0)).toMatchObject({ ok: false, reason: "too_many_marches" });
  });

  test("troops still training cannot march", () => {
    const training = base({ troops: t(0), training: { troop: "infantry", count: 10, startedAt: T0, endsAt: T0 + HOUR } });
    expect(startMarch(training, march(t(5)), T0)).toMatchObject({ ok: false, reason: "not_enough_troops" });
    expect(startMarch(training, march(t(5), "m1", T0 + HOUR), T0 + HOUR).ok).toBe(true);
  });
});

describe("march return", () => {
  const m = march(t(6));
  const out = sent(base(), m);
  const settled = settleMarch(out, m.id, win(m));

  test("settleMarch records the outcome once; later calls change nothing", () => {
    expect(settled.changed).toBe(true);
    expect(settleMarch(settled.state, m.id, { ...win(m), loot: { food: 9999, materiel: 0, funds: 0, support: 0 } })).toEqual({ state: settled.state, changed: false });
    expect(settleMarch(out, "unknown", win(m))).toEqual({ state: out, changed: false });
  });

  test("troops and loot come home exactly at returnAt", () => {
    const before = advance(settled.state, m.returnAt - 1);
    expect(before.marches).toHaveLength(1);
    expect(before.troops.infantry).toBe(4);
    const home = advance(settled.state, m.returnAt);
    expect(home.marches).toHaveLength(0);
    expect(home.troops.infantry).toBe(8);
    expect(home.wounded.infantry).toBe(2);
    const produced = advance(out, m.returnAt).resources.food;
    expect(home.resources.food).toBeCloseTo(produced + 300, 6);
  });

  test("loot never pushes storage past the cap, and never lowers an amount above it", () => {
    const cap = storageCap(2).food;
    const full = settleMarch(sent(base({ resources: { food: cap - 100, materiel: 0, funds: 0, support: 0 } }), m), m.id, win(m)).state;
    expect(advance(full, m.returnAt).resources.food).toBe(cap);
    const over = settleMarch(sent(base({ resources: { food: cap + 500, materiel: 0, funds: 0, support: 0 } }), m), m.id, win(m)).state;
    expect(advance(over, m.returnAt).resources.food).toBe(cap + 500);
  });

  test("without an outcome the march waits; after the grace period it comes home unharmed with no loot", () => {
    expect(advance(out, m.returnAt + HOUR - 1).marches).toHaveLength(1);
    const rescued = advance(out, m.returnAt + MARCH_RESCUE_GRACE_MS);
    expect(rescued.marches).toHaveLength(0);
    expect(rescued.troops.infantry).toBe(10);
    expect(rescued.wounded).toEqual(ZERO_TROOPS);
  });

  test("time going backwards does not bring a march home", () => {
    const home = advance(settled.state, m.returnAt);
    expect(advance(settled.state, T0 - DAY)).toEqual(settled.state);
    expect(advance(home, T0)).toEqual(home);
  });

  test("a very long offline gap resolves the march, training and an upgrade, in time order", () => {
    const busy: BaseState = {
      ...settled.state,
      queue: { building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + 30 * SEC },
      training: { troop: "scouts", count: 3, startedAt: T0, endsAt: T0 + HOUR },
    };
    const later = advance(busy, T0 + 365 * DAY);
    expect(later).toMatchObject({ queue: null, training: null, marches: [] });
    expect(later.levels.farm).toBe(2);
    expect(later.troops).toEqual(t(8, 3));
  });

  test("events are applied in time order: loot lands after an upgrade raised the storage cap", () => {
    const cap1 = storageCap(1).food;
    const s0: BaseState = {
      ...createBaseState(T0),
      resources: { food: cap1, materiel: 0, funds: 0, support: 0 },
      queue: { building: "hq", toLevel: 2, startedAt: T0, endsAt: T0 + MIN },
    };
    const s = settleMarch(sent(s0, m), m.id, win(m)).state;
    // HQ 2 at T0+1min raises the cap before the march returns at T0+10min with 300 food.
    const withoutLoot = advance(sent(s0, m), m.returnAt - 1).resources.food;
    expect(withoutLoot).toBeGreaterThan(cap1);
    expect(advance(s, m.returnAt).resources.food).toBeCloseTo(withoutLoot + 300, 0);
  });
});

describe("migrateBaseState", () => {
  const m2Base = { resources: { food: 1, materiel: 2, funds: 3, support: 0 }, levels: { hq: 2, farm: 1, armory: 1, treasury: 1 }, queue: null, lastUpdated: T0 };

  test("an M2-era base gains a level-1 barracks and no troops", () => {
    expect(isBaseState(m2Base)).toBe(false);
    const v = migrateBaseState(m2Base);
    expect(isBaseState(v)).toBe(true);
    expect(v).toMatchObject({ levels: { barracks: 1 }, troops: ZERO_TROOPS, wounded: ZERO_TROOPS, training: null, marches: [] });
  });

  test("a current base passes through unchanged", () => {
    const s = base();
    expect(migrateBaseState(s)).toEqual(s);
  });

  test("garbage stays garbage", () => {
    for (const bad of [null, 1, "x", [], { levels: 3 }]) expect(isBaseState(migrateBaseState(bad))).toBe(false);
  });

  test("forged troop counts fail the shape check", () => {
    for (const troops of [{ ...ZERO_TROOPS, infantry: -1 }, { ...ZERO_TROOPS, infantry: 1.5 }, { ...ZERO_TROOPS, infantry: 1e12 }, { infantry: 1 }]) {
      expect(isBaseState({ ...base(), troops })).toBe(false);
    }
  });
});
