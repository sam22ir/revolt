import { test } from "vitest";
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
  NO_WORLD,
} from "../src/index.ts";
import { base, DAY, ex, HOUR, MIN, SEC, T0 } from "./helpers.ts";

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
  const r = startMarch(s, m, now, NO_WORLD);
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

test("travel: slowest unit's speed, distance over speed, planMarch", () => {
  {
    const e = ex("moves at the slowest unit's speed");
    e(marchSpeed(t(5)), "infantry").toBe(2);
    e(marchSpeed(t(5, 5)), "infantry + scouts").toBe(2);
    e(marchSpeed(t(5, 5, 1)), "with heavy").toBe(1);
    e(marchSpeed(t(0, 5)), "scouts only").toBe(4);
    e(marchSpeed(ZERO_TROOPS), "nobody").toBe(0);
  }

  {
    const e = ex("travel time is distance over speed, in whole ms, at least a second");
    e(travelMs(FROM, TO, t(5)), "infantry").toBe(5 * MIN); // 10 tiles at 2/min
    e(travelMs(FROM, TO, t(0, 0, 1)), "heavy").toBe(10 * MIN);
    e(travelMs(FROM, FROM, t(5)), "zero distance").toBe(SEC);
    e(planMarch(FROM, TO, t(5), T0), "planMarch").toEqual({ departAt: T0, arriveAt: T0 + 5 * MIN, returnAt: T0 + 10 * MIN });
  }
});

test("startMarch: takes troops out, refusals, march limit, training troops", () => {
  {
    const e = ex("takes the troops out of the base and records the march");
    const s = sent(base(), march(t(6)));
    e(s.troops.infantry, "troops left home").toBe(4);
    e(s.marches, "marches").toEqual([{ ...march(t(6)), outcome: null }]);
  }

  {
    const e = ex("refuses more troops than are home");
    e(startMarch(base(), march(t(11)), T0, NO_WORLD), "11 infantry").toMatchObject({ ok: false, reason: "not_enough_troops" });
    e(startMarch(base(), march(t(0, 1)), T0, NO_WORLD), "1 scout").toMatchObject({ ok: false, reason: "not_enough_troops" });
  }

  {
    const e = ex("refuses a march with no fighting troops");
    e(startMarch(base(), march(ZERO_TROOPS), T0, NO_WORLD), "nobody").toMatchObject({ ok: false, reason: "no_troops" });
    const withPorters = base({ troops: t(0, 0, 0, 5) });
    e(startMarch(withPorters, march(t(0, 0, 0, 5)), T0, NO_WORLD), "porters only").toMatchObject({ ok: false, reason: "no_troops" });
  }

  {
    const e = ex(`allows at most MAX_MARCHES marches out at once`);
    let s = base();
    for (let i = 0; i < MAX_MARCHES; i++) s = sent(s, march(t(1), `m${i}`));
    e(startMarch(s, march(t(1), "extra"), T0, NO_WORLD), "one too many").toMatchObject({ ok: false, reason: "too_many_marches" });
  }

  {
    const e = ex("troops still training cannot march");
    const training = base({ troops: t(0), training: { troop: "infantry", count: 10, startedAt: T0, endsAt: T0 + HOUR } });
    e(startMarch(training, march(t(5)), T0, NO_WORLD), "before training ends").toMatchObject({ ok: false, reason: "not_enough_troops" });
    e(startMarch(training, march(t(5), "m1", T0 + HOUR), T0 + HOUR, NO_WORLD).ok, "after training ends").toBe(true);
  }
});

test("march return: settle once, exact returnAt, loot cap, rescue, clock backwards, long gap, time order", () => {
  const m = march(t(6));
  const out = sent(base(), m);
  const settled = settleMarch(out, m.id, win(m));

  {
    const e = ex("settleMarch records the outcome once; later calls change nothing");
    e(settled.changed, "first settle").toBe(true);
    e(settleMarch(settled.state, m.id, { ...win(m), loot: { food: 9999, materiel: 0, funds: 0, support: 0 } }), "second settle").toEqual({
      state: settled.state,
      changed: false,
    });
    e(settleMarch(out, "unknown", win(m)), "unknown id").toEqual({ state: out, changed: false });
  }

  {
    const e = ex("troops and loot come home exactly at returnAt");
    const before = advance(settled.state, m.returnAt - 1, NO_WORLD);
    e(before.marches, "1ms before: still out").toHaveLength(1);
    e(before.troops.infantry, "1ms before: troops").toBe(4);
    const home = advance(settled.state, m.returnAt, NO_WORLD);
    e(home.marches, "at returnAt: marches").toHaveLength(0);
    e(home.troops.infantry, "at returnAt: troops").toBe(8);
    e(home.wounded.infantry, "at returnAt: wounded").toBe(2);
    const produced = advance(out, m.returnAt, NO_WORLD).resources.food;
    e(home.resources.food, "at returnAt: loot").toBeCloseTo(produced + 300, 6);
  }

  {
    const e = ex("loot never pushes storage past the cap, and never lowers an amount above it");
    const cap = storageCap(2).food;
    const full = settleMarch(sent(base({ resources: { food: cap - 100, materiel: 0, funds: 0, support: 0 } }), m), m.id, win(m)).state;
    e(advance(full, m.returnAt, NO_WORLD).resources.food, "near cap").toBe(cap);
    const over = settleMarch(sent(base({ resources: { food: cap + 500, materiel: 0, funds: 0, support: 0 } }), m), m.id, win(m)).state;
    e(advance(over, m.returnAt, NO_WORLD).resources.food, "above cap").toBe(cap + 500);
  }

  {
    const e = ex("without an outcome the march waits; after the grace period it comes home unharmed with no loot");
    e(advance(out, m.returnAt + HOUR - 1, NO_WORLD).marches, "within grace").toHaveLength(1);
    const rescued = advance(out, m.returnAt + MARCH_RESCUE_GRACE_MS, NO_WORLD);
    e(rescued.marches, "rescued: marches").toHaveLength(0);
    e(rescued.troops.infantry, "rescued: troops").toBe(10);
    e(rescued.wounded, "rescued: wounded").toEqual(ZERO_TROOPS);
  }

  {
    const e = ex("time going backwards does not bring a march home");
    const home = advance(settled.state, m.returnAt, NO_WORLD);
    e(advance(settled.state, T0 - DAY, NO_WORLD), "while out").toEqual(settled.state);
    e(advance(home, T0, NO_WORLD), "after home").toEqual(home);
  }

  {
    const e = ex("a very long offline gap resolves the march, training and an upgrade, in time order");
    const busy: BaseState = {
      ...settled.state,
      queue: { building: "farm", toLevel: 2, startedAt: T0, endsAt: T0 + 30 * SEC },
      training: { troop: "scouts", count: 3, startedAt: T0, endsAt: T0 + HOUR },
    };
    const later = advance(busy, T0 + 365 * DAY, NO_WORLD);
    e(later, "queues cleared").toMatchObject({ queue: null, training: null, marches: [] });
    e(later.levels.farm, "farm level").toBe(2);
    e(later.troops, "troops").toEqual(t(8, 3));
  }

  {
    const e = ex("events are applied in time order: loot lands after an upgrade raised the storage cap");
    const cap1 = storageCap(1).food;
    const s0: BaseState = {
      ...createBaseState(T0),
      resources: { food: cap1, materiel: 0, funds: 0, support: 0 },
      queue: { building: "hq", toLevel: 2, startedAt: T0, endsAt: T0 + MIN },
    };
    const s = settleMarch(sent(s0, m), m.id, win(m)).state;
    // HQ 2 at T0+1min raises the cap before the march returns at T0+10min with 300 food.
    const withoutLoot = advance(sent(s0, m), m.returnAt - 1, NO_WORLD).resources.food;
    e(withoutLoot, "cap raised first").toBeGreaterThan(cap1);
    e(advance(s, m.returnAt, NO_WORLD).resources.food, "loot added").toBeCloseTo(withoutLoot + 300, 0);
  }
});

test("migrateBaseState and isBaseState: M2 base, current base, garbage, forged troops", () => {
  const m2Base = { resources: { food: 1, materiel: 2, funds: 3, support: 0 }, levels: { hq: 2, farm: 1, armory: 1, treasury: 1 }, queue: null, lastUpdated: T0 };

  {
    const e = ex("an M2-era base gains a level-1 barracks and no troops");
    e(isBaseState(m2Base), "old shape invalid").toBe(false);
    const v = migrateBaseState(m2Base);
    e(isBaseState(v), "migrated valid").toBe(true);
    e(v, "migrated content").toMatchObject({ levels: { barracks: 1 }, troops: ZERO_TROOPS, wounded: ZERO_TROOPS, training: null, marches: [] });
  }

  {
    const s = base();
    ex("a current base passes through unchanged")(migrateBaseState(s)).toEqual(s);
  }

  {
    const e = ex("garbage stays garbage");
    for (const bad of [null, 1, "x", [], { levels: 3 }]) e(isBaseState(migrateBaseState(bad)), JSON.stringify(bad)).toBe(false);
  }

  {
    const e = ex("forged troop counts fail the shape check");
    for (const troops of [{ ...ZERO_TROOPS, infantry: -1 }, { ...ZERO_TROOPS, infantry: 1.5 }, { ...ZERO_TROOPS, infantry: 1e12 }, { infantry: 1 }]) {
      e(isBaseState({ ...base(), troops }), JSON.stringify(troops)).toBe(false);
    }
  }
});
