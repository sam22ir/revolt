import { describe, expect, test } from "vitest";
import {
  advance,
  aidOutcome,
  aidPlan,
  CARE_INFIRMARY_LEVEL,
  checkAid,
  createBaseState,
  geographyOf,
  isBaseState,
  LABOR_MS,
  LABOR_TROOPS,
  migrateBaseState,
  placeSites,
  placeVillages,
  recordHelp,
  startAid,
  TRUST_LEVELS,
  TRUST_PER_HELP,
  VILLAGE_KINDS,
  VILLAGE_MIN_SPACING,
  VILLAGE_SITE_CLEARANCE,
  type BaseState,
  type MarchState,
  type Troops,
} from "../src/index.ts";
import { rich, T0 } from "./helpers.ts";

const NO_WORLD = { liberations: [] };
const VILLAGE = { id: "village:3", kind: "healers" as const };
const troops = (infantry: number, porters = 0): Troops => ({ infantry, scouts: 0, heavy: 0, porters });
const DAY = 100;
/** A rich base with porters at home. */
const stocked = (): BaseState => ({ ...rich(), troops: troops(30, 20) });

const aidMarch = (cost = aidPlan("food", 0).cost, t: Troops = troops(5, 10)) => ({
  id: "m1",
  target: { npcId: VILLAGE.id, level: 0, x: 5, y: 5 },
  from: { x: 0, y: 0 },
  troops: t,
  departAt: T0,
  arriveAt: T0 + 1000,
  returnAt: T0 + 2000,
  aid: { village: VILLAGE.id, need: "food" as const, day: DAY, cost },
});

describe("placing villages", () => {
  const seed = 12345;
  const g = geographyOf(seed, 96);
  const sites = placeSites(seed, g);
  const villages = placeVillages(seed, g, sites);

  test("the same seed places the same villages, every kind among them", () => {
    expect(placeVillages(seed, g, sites)).toEqual(villages);
    expect(villages.length).toBeGreaterThan(5);
    expect(new Set(villages.map((v) => v.kind)).size).toBe(VILLAGE_KINDS.length);
  });

  test("they keep apart from each other and from resource sites", () => {
    for (const a of villages) {
      for (const b of villages) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(VILLAGE_MIN_SPACING);
      for (const s of sites) expect(Math.max(Math.abs(a.x - s.x), Math.abs(a.y - s.y))).toBeGreaterThanOrEqual(VILLAGE_SITE_CLEARANCE);
    }
  });

  test("ids follow scan order", () => {
    expect(villages.map((v) => v.id)).toEqual(villages.map((_, i) => `village:${i}`));
  });
});

describe("checking an aid march", () => {
  test("a delivery needs the carry room and the goods", () => {
    const s = rich();
    expect(checkAid(s, VILLAGE, "food", troops(5, 10), DAY, T0)).toBeNull();
    expect(checkAid(s, VILLAGE, "food", troops(5), DAY, T0)).toBe("not_enough_carry");
    expect(checkAid({ ...s, resources: { ...s.resources, food: 10 } }, VILLAGE, "food", troops(5, 10), DAY, T0)).toBe("insufficient");
  });

  test("care needs the infirmary, labor needs hands, protection is a battle", () => {
    const s = rich();
    expect(checkAid(s, VILLAGE, "care", troops(5), DAY, T0)).toBe("infirmary_level");
    expect(checkAid({ ...s, levels: { ...s.levels, infirmary: CARE_INFIRMARY_LEVEL } }, VILLAGE, "care", troops(5), DAY, T0)).toBeNull();
    expect(checkAid(s, VILLAGE, "labor", troops(LABOR_TROOPS - 1), DAY, T0)).toBe("labor_troops");
    expect(checkAid(s, VILLAGE, "labor", troops(LABOR_TROOPS), DAY, T0)).toBeNull();
    expect(checkAid(s, VILLAGE, "protection", troops(50), DAY, T0)).toBe("not_this_need");
  });

  test("once a day per village, and not twice on the way", () => {
    const helped = recordHelp(rich(), VILLAGE, DAY, T0).state;
    expect(checkAid(helped, VILLAGE, "funds", troops(5, 10), DAY, T0)).toBe("already_helped_today");
    expect(checkAid(helped, VILLAGE, "funds", troops(5, 10), DAY + 1, T0)).toBeNull();
    const going = startAid(stocked(), aidMarch(), T0, NO_WORLD);
    if (!going.ok) throw new Error(going.reason);
    expect(checkAid(going.state, VILLAGE, "funds", troops(5, 10), DAY, T0)).toBe("already_on_the_way");
  });

  test("deliveries ask more as trust grows; labor stays a while", () => {
    expect(aidPlan("food", 2).cost.food).toBeGreaterThan(aidPlan("food", 0).cost.food);
    expect(aidPlan("labor", 0)).toEqual({ cost: { food: 0, materiel: 0, funds: 0, support: 0 }, stayMs: LABOR_MS });
  });
});

describe("sending and arriving", () => {
  test("the cost is paid at departure and the troops leave", () => {
    const s = stocked();
    const r = startAid(s, aidMarch(), T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.resources.food).toBeCloseTo(advance(s, T0, NO_WORLD).resources.food - aidPlan("food", 0).cost.food, 6);
    expect(r.state.marches.at(-1)?.aid?.village).toBe(VILLAGE.id);
    expect(isBaseState(r.state)).toBe(true);
    expect(startAid({ ...s, resources: { ...s.resources, food: 1 } }, aidMarch(), T0, NO_WORLD)).toMatchObject({ ok: false, reason: "insufficient" });
  });

  test("help raises trust and teaches lessons as levels are reached", () => {
    let s: BaseState = rich();
    for (let d = 0; d < 3; d++) s = recordHelp(s, VILLAGE, DAY + d, T0 + d * 1000).state;
    expect(s.villages[VILLAGE.id]?.trust).toBeGreaterThan(2 * TRUST_PER_HELP);
    expect(s.lessonsTaught).toEqual(TRUST_PER_HELP * 3 >= TRUST_LEVELS[0] ? ["herbal_remedies"] : []);
    expect(recordHelp(s, VILLAGE, DAY + 2, T0 + 5000)).toMatchObject({ credited: false });
  });

  test("an aid march comes home whole; the goods come back if the help did not count", () => {
    const cost = aidPlan("food", 0).cost;
    expect(aidOutcome(troops(5, 10), cost, true)).toMatchObject({ survivors: troops(5, 10), loot: { food: 0 } });
    expect(aidOutcome(troops(5, 10), cost, false).loot.food).toBe(cost.food);
  });
});

describe("saves", () => {
  test("an older base gets no villages and no lessons; a forged record is refused", () => {
    const old = { ...createBaseState(T0) } as Record<string, unknown>;
    delete old.villages;
    delete old.lessonsTaught;
    const migrated = migrateBaseState(old) as BaseState;
    expect(isBaseState(migrated)).toBe(true);
    expect([migrated.villages, migrated.lessonsTaught]).toEqual([{}, []]);
    expect(isBaseState({ ...createBaseState(T0), villages: { v: { trust: 9e9, at: 0, taught: 0, helpedDay: 0 } } })).toBe(false);
    expect(isBaseState({ ...createBaseState(T0), lessonsTaught: ["flying"] })).toBe(false);
    const march: MarchState = { ...aidMarch(), outcome: null };
    expect(isBaseState({ ...createBaseState(T0), marches: [{ ...march, aid: { ...march.aid, need: "gold" } }] })).toBe(false);
  });
});
