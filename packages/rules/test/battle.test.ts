import { test } from "vitest";
import { addTroops, counterFactor, fightNpc, NPC_LEVELS, resolveBattle, seededRng, TROOP_IDS, TROOPS, ZERO_RESOURCES, type Troops } from "../src/index.ts";
import { ex } from "./helpers.ts";

const t = (infantry: number, scouts: number, heavy: number, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const LOOT = { food: 300, materiel: 200, funds: 100, support: 0 };

test("seededRng: same seed same sequence, fixed known values", () => {
  {
    const e = ex("same seed, same sequence; different seed, different sequence");
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const sa = [a(), a(), a()];
    e([b(), b(), b()], "same seed").toEqual(sa);
    e([c(), c(), c()], "different seed").not.toEqual(sa);
    for (const v of sa) e(v >= 0 && v < 1, `range ${v}`).toBe(true);
  }

  {
    const r = seededRng(1);
    ex("known values stay fixed across engines and refactors")([r(), r()].map((v) => v.toFixed(8))).toEqual(["0.62707394", "0.00273572"]);
  }
});

test("resolveBattle: determinism, conservation, counters, loot, defeat, round limit", () => {
  {
    const a = resolveBattle(t(20, 10, 5, 3), t(12, 8, 6), LOOT, 123456);
    const b = resolveBattle(t(20, 10, 5, 3), t(12, 8, 6), LOOT, 123456);
    ex("is deterministic: same forces and seed give the same result")(b).toEqual(a);
  }

  {
    const results = new Set<string>();
    for (let seed = 0; seed < 50; seed++) results.add(JSON.stringify(resolveBattle(t(14, 0, 0), t(4, 3, 3), LOOT, seed).attackerSurvivors));
    ex("different seeds can change the result")(results.size).toBeGreaterThan(1);
  }

  {
    const e = ex("conserves the attacking force: survivors + wounded + lost = sent");
    for (let seed = 0; seed < 30; seed++) {
      const sent = t(15, 7, 4, 5);
      const r = resolveBattle(sent, t(12, 8, 6), LOOT, seed);
      e(addTroops(addTroops(r.attackerSurvivors, r.attackerWounded), r.attackerLost), `seed ${seed} sum`).toEqual(sent);
      for (const id of TROOP_IDS) e(r.attackerLost[id], `seed ${seed} ${id} lost<=wounded`).toBeLessThanOrEqual(r.attackerWounded[id]);
    }
  }

  {
    const e = ex("losses are mostly wounded");
    const r = resolveBattle(t(50, 0, 0), t(30, 20, 25), LOOT, 7);
    const wounded = TROOP_IDS.reduce((n, id) => n + r.attackerWounded[id], 0);
    const lost = TROOP_IDS.reduce((n, id) => n + r.attackerLost[id], 0);
    e(wounded, "wounded").toBeGreaterThan(0);
    e(lost, "lost < wounded").toBeLessThan(wounded);
  }

  {
    const e = ex("the counter triangle: infantry > scouts > heavy > infantry; porters never fight");
    e(TROOPS.infantry.counters, "infantry counters").toBe("scouts");
    e(TROOPS.scouts.counters, "scouts counters").toBe("heavy");
    e(TROOPS.heavy.counters, "heavy counters").toBe("infantry");
    e(TROOPS.porters.attack, "porters attack").toBe(0);
    e(counterFactor("infantry", t(0, 20, 0)), "vs all scouts").toBe(1.5);
    e(counterFactor("infantry", t(20, 0, 0)), "vs all infantry").toBe(1);
    e(counterFactor("infantry", t(10, 10, 0)), "vs mixed").toBe(1.25);
    e(counterFactor("porters", t(0, 20, 0)), "porters").toBe(1);
  }

  {
    // 20 heavy vs 30 infantry: the heavy's bonus against infantry wins it; vs 30 scouts (which counter heavy) it loses.
    let heavyWins = 0;
    for (let seed = 0; seed < 20; seed++) if (resolveBattle(t(0, 0, 20), t(30, 0, 0), LOOT, seed).victory) heavyWins++;
    let heavyWinsVsScouts = 0;
    for (let seed = 0; seed < 20; seed++) if (resolveBattle(t(0, 0, 20), t(0, 30, 0), LOOT, seed).victory) heavyWinsVsScouts++;
    ex("the counter changes battles: heavy beat infantry that would beat the same heavy without the bonus")(heavyWins).toBeGreaterThan(heavyWinsVsScouts);
  }

  {
    const e = ex("victory needs every defender cleared; loot is capped by survivors' carry");
    const r = resolveBattle(t(40, 0, 0), t(4, 3, 0), LOOT, 1);
    e(r.victory, "victory").toBe(true);
    const carry = TROOP_IDS.reduce((n, id) => n + r.attackerSurvivors[id] * TROOPS[id].carry, 0);
    const looted = r.loot.food + r.loot.materiel + r.loot.funds + r.loot.support;
    e(looted, "looted <= min(carry, 600)").toBeLessThanOrEqual(Math.min(carry, 600));
    e(looted, "looted > 0").toBeGreaterThan(0);
  }

  {
    const e = ex("porters raise the loot carried home");
    const without = resolveBattle(t(12, 0, 0), t(4, 3, 0), LOOT, 3);
    const withPorters = resolveBattle(t(12, 0, 0, 10), t(4, 3, 0), LOOT, 3);
    e(without.victory && withPorters.victory, "both win").toBe(true);
    const sum = (r: typeof without): number => r.loot.food + r.loot.materiel + r.loot.funds;
    e(sum(withPorters), "more loot").toBeGreaterThan(sum(without));
  }

  {
    const e = ex("a defeat brings no loot");
    const r = resolveBattle(t(3, 0, 0), t(30, 20, 25), LOOT, 1);
    e(r.victory, "defeat").toBe(false);
    e(r.loot, "no loot").toEqual(ZERO_RESOURCES);
  }

  {
    const e = ex("never runs more than the round limit, and stops early when a side is gone");
    e(resolveBattle(t(1, 0, 0), t(1000, 0, 0), LOOT, 1).rounds.length, "round limit").toBeLessThanOrEqual(4);
    e(resolveBattle(t(1000, 0, 0), t(1, 0, 0), LOOT, 1).rounds, "early stop").toHaveLength(1);
  }
});

test("fightNpc: starting infantry vs level 1, unknown level, every level has defenders and loot", () => {
  {
    let wins = 0;
    for (let seed = 0; seed < 20; seed++) if (fightNpc(t(10, 0, 0), 1, seed).outcome.result === "victory") wins++;
    ex("10 starting infantry beat a level-1 patrol for most seeds")(wins).toBeGreaterThanOrEqual(15);
  }

  ex("an unknown level means the target is gone: everyone comes home")(fightNpc(t(5, 0, 0), 99, 1).outcome).toMatchObject({
    result: "target_gone",
    survivors: t(5, 0, 0),
  });

  {
    const e = ex("every NPC level has defenders and loot");
    NPC_LEVELS.forEach((def, i) => {
      e(TROOP_IDS.some((id) => def.defenders[id] > 0), `level ${i + 1} defenders`).toBe(true);
      e(def.loot.food, `level ${i + 1} loot`).toBeGreaterThan(0);
    });
  }
});
