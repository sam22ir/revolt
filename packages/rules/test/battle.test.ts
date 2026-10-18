import { describe, expect, test } from "vitest";
import { addTroops, counterFactor, fightNpc, NPC_LEVELS, resolveBattle, seededRng, TROOP_IDS, TROOPS, ZERO_RESOURCES, type Troops } from "../src/index.ts";

const t = (infantry: number, scouts: number, heavy: number, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const LOOT = { food: 300, materiel: 200, funds: 100, support: 0 };

describe("seededRng", () => {
  test("same seed, same sequence; different seed, different sequence", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  test("known values stay fixed across engines and refactors", () => {
    const r = seededRng(1);
    expect([r(), r()].map((v) => v.toFixed(8))).toEqual(["0.62707394", "0.00273572"]);
  });
});

describe("resolveBattle", () => {
  test("is deterministic: same forces and seed give the same result", () => {
    const a = resolveBattle(t(20, 10, 5, 3), t(12, 8, 6), LOOT, 123456);
    const b = resolveBattle(t(20, 10, 5, 3), t(12, 8, 6), LOOT, 123456);
    expect(b).toEqual(a);
  });

  test("different seeds can change the result", () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 50; seed++) results.add(JSON.stringify(resolveBattle(t(14, 0, 0), t(4, 3, 3), LOOT, seed).attackerSurvivors));
    expect(results.size).toBeGreaterThan(1);
  });

  test("conserves the attacking force: survivors + wounded + lost = sent", () => {
    for (let seed = 0; seed < 30; seed++) {
      const sent = t(15, 7, 4, 5);
      const r = resolveBattle(sent, t(12, 8, 6), LOOT, seed);
      expect(addTroops(addTroops(r.attackerSurvivors, r.attackerWounded), r.attackerLost)).toEqual(sent);
      for (const id of TROOP_IDS) expect(r.attackerLost[id]).toBeLessThanOrEqual(r.attackerWounded[id]);
    }
  });

  test("losses are mostly wounded", () => {
    const r = resolveBattle(t(50, 0, 0), t(30, 20, 25), LOOT, 7);
    const wounded = TROOP_IDS.reduce((n, id) => n + r.attackerWounded[id], 0);
    const lost = TROOP_IDS.reduce((n, id) => n + r.attackerLost[id], 0);
    expect(wounded).toBeGreaterThan(0);
    expect(lost).toBeLessThan(wounded);
  });

  test("the counter triangle: infantry > scouts > heavy > infantry; porters never fight", () => {
    expect(TROOPS.infantry.counters).toBe("scouts");
    expect(TROOPS.scouts.counters).toBe("heavy");
    expect(TROOPS.heavy.counters).toBe("infantry");
    expect(TROOPS.porters.attack).toBe(0);
    expect(counterFactor("infantry", t(0, 20, 0))).toBe(1.5);
    expect(counterFactor("infantry", t(20, 0, 0))).toBe(1);
    expect(counterFactor("infantry", t(10, 10, 0))).toBe(1.25);
    expect(counterFactor("porters", t(0, 20, 0))).toBe(1);
  });

  test("the counter changes battles: heavy beat infantry that would beat the same heavy without the bonus", () => {
    // 20 heavy vs 30 infantry: the heavy's bonus against infantry wins it.
    let heavyWins = 0;
    for (let seed = 0; seed < 20; seed++) if (resolveBattle(t(0, 0, 20), t(30, 0, 0), LOOT, seed).victory) heavyWins++;
    // The same heavy against 30 scouts (which counter heavy) lose.
    let heavyWinsVsScouts = 0;
    for (let seed = 0; seed < 20; seed++) if (resolveBattle(t(0, 0, 20), t(0, 30, 0), LOOT, seed).victory) heavyWinsVsScouts++;
    expect(heavyWins).toBeGreaterThan(heavyWinsVsScouts);
  });

  test("victory needs every defender cleared; loot is capped by survivors' carry", () => {
    const r = resolveBattle(t(40, 0, 0), t(4, 3, 0), LOOT, 1);
    expect(r.victory).toBe(true);
    const carry = TROOP_IDS.reduce((n, id) => n + r.attackerSurvivors[id] * TROOPS[id].carry, 0);
    const looted = r.loot.food + r.loot.materiel + r.loot.funds + r.loot.support;
    expect(looted).toBeLessThanOrEqual(Math.min(carry, 600));
    expect(looted).toBeGreaterThan(0);
  });

  test("porters raise the loot carried home", () => {
    const without = resolveBattle(t(12, 0, 0), t(4, 3, 0), LOOT, 3);
    const withPorters = resolveBattle(t(12, 0, 0, 10), t(4, 3, 0), LOOT, 3);
    expect(without.victory && withPorters.victory).toBe(true);
    const sum = (r: typeof without): number => r.loot.food + r.loot.materiel + r.loot.funds;
    expect(sum(withPorters)).toBeGreaterThan(sum(without));
  });

  test("a defeat brings no loot", () => {
    const r = resolveBattle(t(3, 0, 0), t(30, 20, 25), LOOT, 1);
    expect(r.victory).toBe(false);
    expect(r.loot).toEqual(ZERO_RESOURCES);
  });

  test("never runs more than the round limit, and stops early when a side is gone", () => {
    expect(resolveBattle(t(1, 0, 0), t(1000, 0, 0), LOOT, 1).rounds.length).toBeLessThanOrEqual(4);
    expect(resolveBattle(t(1000, 0, 0), t(1, 0, 0), LOOT, 1).rounds).toHaveLength(1);
  });
});

describe("fightNpc", () => {
  test("10 starting infantry beat a level-1 patrol for most seeds", () => {
    let wins = 0;
    for (let seed = 0; seed < 20; seed++) if (fightNpc(t(10, 0, 0), 1, seed).outcome.result === "victory") wins++;
    expect(wins).toBeGreaterThanOrEqual(15);
  });

  test("an unknown level means the target is gone: everyone comes home", () => {
    expect(fightNpc(t(5, 0, 0), 99, 1).outcome).toMatchObject({ result: "target_gone", survivors: t(5, 0, 0) });
  });

  test("every NPC level has defenders and loot", () => {
    for (const def of NPC_LEVELS) {
      expect(TROOP_IDS.some((id) => def.defenders[id] > 0)).toBe(true);
      expect(def.loot.food).toBeGreaterThan(0);
    }
  });
});
