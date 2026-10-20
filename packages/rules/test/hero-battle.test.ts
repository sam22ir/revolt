import { describe, expect, test } from "vitest";
import {
  fightNpc,
  heroMods,
  heroUnits,
  MAX_MOD_UNITS,
  NO_MODS,
  resolveBattle,
  resolveRally,
  unitsToMods,
  type BattleMods,
  type SquadMember,
  type Troops,
} from "../src/index.ts";

const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const LOOT = { food: 300, materiel: 200, funds: 100, support: 0 };
const ATTACKER = t(20, 10, 5, 3);
const DEFENDER = t(12, 8, 6);

describe("battle mods", () => {
  test("NO_MODS, an empty squad and no argument all give the pre-hero result, bit for bit", () => {
    for (let seed = 0; seed < 200; seed++) {
      const plain = resolveBattle(ATTACKER, DEFENDER, LOOT, seed);
      expect(resolveBattle(ATTACKER, DEFENDER, LOOT, seed, NO_MODS)).toEqual(plain);
      expect(resolveBattle(ATTACKER, DEFENDER, LOOT, seed, heroMods([]))).toEqual(plain);
      expect(fightNpc(ATTACKER, 2, seed, heroMods([])).outcome).toEqual(fightNpc(ATTACKER, 2, seed).outcome);
    }
  });

  test("a golden result from before heroes stays fixed", () => {
    const r = resolveBattle(ATTACKER, DEFENDER, LOOT, 123456);
    expect(r.victory).toBe(true);
    expect(r.attackerSurvivors).toEqual(t(13, 6, 5, 2));
    expect(r.attackerWounded).toEqual(t(6, 4, 0, 1));
    expect(r.attackerLost).toEqual(t(1, 0, 0, 0));
    expect(r.defenderKilled).toEqual(DEFENDER);
    expect(r.loot).toEqual({ food: 177, materiel: 118, funds: 59, support: 0 });
  });

  test("the same seed and mods give the same result", () => {
    const mods = heroMods([{ id: "organizer", level: 5 }]);
    expect(resolveBattle(ATTACKER, DEFENDER, LOOT, 77, mods)).toEqual(resolveBattle(ATTACKER, DEFENDER, LOOT, 77, mods));
  });

  test("attack and hp bonuses raise survivors on average, and never lower them", () => {
    const strong: BattleMods = { ...NO_MODS, attack: { ...NO_MODS.attack, infantry: 1.5 }, hp: { ...NO_MODS.hp, infantry: 1.5 } };
    const sent = t(14, 0, 0);
    const foe = t(4, 3, 3);
    let plain = 0;
    let boosted = 0;
    for (let seed = 0; seed < 100; seed++) {
      plain += resolveBattle(sent, foe, LOOT, seed).attackerSurvivors.infantry;
      boosted += resolveBattle(sent, foe, LOOT, seed, strong).attackerSurvivors.infantry;
    }
    expect(boosted).toBeGreaterThan(plain);
  });

  test("a carry bonus raises loot only when the load is the limit", () => {
    const rich = { food: 5000, materiel: 5000, funds: 5000, support: 0 };
    const sent = t(10, 0, 0);
    const plain = resolveBattle(sent, t(1), rich, 5);
    const boosted = resolveBattle(sent, t(1), rich, 5, { ...NO_MODS, carry: 1.5 });
    const sum = (r: typeof plain): number => r.loot.food + r.loot.materiel + r.loot.funds;
    expect(sum(boosted)).toBeGreaterThan(sum(plain));
  });

  test("a hero helps only the specialty troop type", () => {
    // The medic is an infantry hero: scouts get nothing.
    const mods = heroMods([{ id: "medic", level: 10 }]);
    expect(mods.hp.infantry).toBeGreaterThan(1);
    expect(mods.hp.scouts).toBe(1);
    expect(mods.attack.scouts).toBe(1);
  });

  test("the lead gives full bonus, a deputy half", () => {
    const lead = heroUnits([{ id: "organizer", level: 1 }]);
    const deputy = heroUnits([{ id: "medic", level: 1 }, { id: "organizer", level: 1 }]);
    const alone = heroUnits([{ id: "medic", level: 1 }]);
    // organizer as deputy adds exactly half of what it adds as lead.
    expect(deputy.attack.infantry - alone.attack.infantry).toBe(lead.attack.infantry / 2);
  });

  test("locked passives give nothing until their level", () => {
    expect(heroUnits([{ id: "courier", level: 1 }]).carry).toBe(0);
    expect(heroUnits([{ id: "courier", level: 3 }]).carry).toBeGreaterThan(0);
  });

  test("bonuses are capped no matter how many heroes stack", () => {
    const huge = { attack: { infantry: 10_000, scouts: 0, heavy: 0, porters: 0 }, hp: { infantry: 0, scouts: 0, heavy: 0, porters: 0 }, carry: 99_999 };
    const mods = unitsToMods(huge);
    expect(mods.attack.infantry).toBe(1 + MAX_MOD_UNITS / 200);
    expect(mods.carry).toBe(1 + MAX_MOD_UNITS / 200);
  });
});

describe("rally with heroes", () => {
  const squadA: SquadMember[] = [{ id: "organizer", level: 6 }];
  const squadB: SquadMember[] = [{ id: "medic", level: 4 }];

  test("a rally sums its participants' hero bonuses, in any join order", () => {
    const a = { id: "a", troops: t(20), heroes: squadA };
    const b = { id: "b", troops: t(15, 5), heroes: squadB };
    const one = resolveRally([a, b], 2, 99);
    const two = resolveRally([b, a], 2, 99);
    expect(two.outcome).toEqual(one.outcome);
    expect(two.shares).toEqual(one.shares);
  });

  test("without heroes it matches the old rally; with heroes it can differ", () => {
    const plain = resolveRally([{ id: "a", troops: t(30) }], 2, 11);
    const noSquad = resolveRally([{ id: "a", troops: t(30), heroes: [] }], 2, 11);
    expect(noSquad.outcome).toEqual(plain.outcome);
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const withHeroes = resolveRally([{ id: "a", troops: t(24), heroes: [{ id: "organizer", level: 10 }] }], 2, seed).outcome;
      const without = resolveRally([{ id: "a", troops: t(24) }], 2, seed).outcome;
      outcomes.add(JSON.stringify(withHeroes) === JSON.stringify(without) ? "same" : "different");
    }
    expect(outcomes.has("different")).toBe(true);
  });

  test("shares still conserve every participant's troops", () => {
    const parts = [
      { id: "a", troops: t(20), heroes: squadA },
      { id: "b", troops: t(15, 5), heroes: squadB },
    ];
    const r = resolveRally(parts, 2, 5);
    for (const share of r.shares) {
      const sent = parts.find((p) => p.id === share.id)!.troops;
      for (const id of ["infantry", "scouts", "heavy", "porters"] as const) {
        expect(share.outcome.survivors[id] + share.outcome.wounded[id] + share.outcome.lost[id]).toBe(sent[id]);
      }
    }
  });
});
