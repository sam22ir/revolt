import { describe, expect, test } from "vitest";
import {
  advance,
  checkLoadout,
  EMPTY_HERO_ROSTER,
  heroBattleModifier,
  HEROES,
  heroesOnMarch,
  HERO_LEVEL_EFFECT_STEP,
  HERO_MIN_DAMAGE_TAKEN,
  isBaseState,
  levelUpHero,
  MARCH_RESCUE_GRACE_MS,
  migrateBaseState,
  NO_BATTLE_MODIFIER,
  resolveBattle,
  snapshotHeroes,
  startMarch,
  type BaseState,
  type HeroRoster,
  type HeroLoadout,
  type MarchState,
  type Troops,
  ZERO_RESOURCES,
} from "../src/index.ts";
import { base, MIN, rich, T0, SEC } from "./helpers.ts";

const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });
const FROM = { x: 10, y: 10 };
const TO = { x: 16, y: 18 };
const roster = (levels: Partial<Record<keyof typeof HEROES, number>>): HeroRoster => ({
  pity: 0,
  owned: Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level, shards: 0 }])),
});
const withHeroes = (r: HeroRoster, overrides: Partial<BaseState> = {}): BaseState => base({ ...rich(), heroes: r, troops: t(40, 20, 10), ...overrides });
const ALL = roster({ mountain_guide: 1, dock_foreman: 1, iron_quartermaster: 1, hill_commander: 1 });
const send = (s: BaseState, loadout: HeroLoadout | null, id = "m1", troops = t(10), now = T0) =>
  startMarch(s, { id, target: { npcId: "n1", level: 1, ...TO }, from: FROM, troops, departAt: now, arriveAt: now + MIN, returnAt: now + 2 * MIN, rallyId: undefined }, now, loadout);

describe("checkLoadout", () => {
  const s = withHeroes(ALL);
  test("accepts one lead and up to two deputies", () => {
    expect(checkLoadout(s, { lead: "hill_commander", deputies: ["mountain_guide", "dock_foreman"] })).toBeNull();
    expect(checkLoadout(s, { lead: "hill_commander", deputies: [] })).toBeNull();
  });

  test("refuses a third deputy", () => {
    expect(checkLoadout(s, { lead: "hill_commander", deputies: ["mountain_guide", "dock_foreman", "iron_quartermaster"] })).toBe("too_many_deputies");
  });

  test("refuses the same hero twice, including lead and deputy", () => {
    expect(checkLoadout(s, { lead: "hill_commander", deputies: ["hill_commander"] })).toBe("duplicate_hero");
  });

  test("refuses a hero that is not owned", () => {
    expect(checkLoadout(withHeroes(roster({ hill_commander: 1 })), { lead: "hill_commander", deputies: ["dock_foreman"] })).toBe("not_owned");
  });

  test("refuses a hero already out on a march, and frees it when the march is back", () => {
    const sent = send(s, { lead: "hill_commander", deputies: [] });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect([...heroesOnMarch(sent.state)]).toEqual(["hill_commander"]);
    expect(checkLoadout(sent.state, { lead: "hill_commander", deputies: [] })).toBe("hero_busy");
    expect(checkLoadout(sent.state, { lead: "dock_foreman", deputies: [] })).toBeNull();
    // Past the return (with the rescue grace in case the map never settled it), the hero is home.
    const back = advance(sent.state, T0 + 2 * MIN + MARCH_RESCUE_GRACE_MS + SEC);
    expect(back.marches).toHaveLength(0);
    expect(checkLoadout(back, { lead: "hill_commander", deputies: [] })).toBeNull();
  });
});

describe("startMarch with heroes", () => {
  test("a march without heroes records none and leaves the heroes free", () => {
    const r = send(withHeroes(ALL), null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.marches[0]!.heroes).toBeUndefined();
  });

  test("the march freezes the heroes' levels at departure", () => {
    const s = withHeroes(roster({ hill_commander: 2 }), { levels: { ...base().levels, hero_hall: 2 } });
    const r = send(s, { lead: "hill_commander", deputies: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.marches[0]!.heroes).toEqual({ lead: "hill_commander", deputies: [], levels: { hill_commander: 2 } });
  });

  test("a level-up while the march is out does not change its heroes' battle effects", () => {
    const s = withHeroes(
      { pity: 0, owned: { hill_commander: { level: 1, shards: 50 } } },
      { levels: { ...base().levels, hero_hall: 5 } },
    );
    const sent = send(s, { lead: "hill_commander", deputies: [] });
    if (!sent.ok) throw new Error("setup");
    const before = heroBattleModifier(sent.state.marches[0]!.heroes);
    const leveled = levelUpHero(sent.state, "hill_commander");
    expect(leveled.ok).toBe(true);
    if (!leveled.ok) return;
    expect(leveled.state.heroes.owned.hill_commander!.level).toBe(2);
    expect(heroBattleModifier(leveled.state.marches[0]!.heroes)).toEqual(before);
  });

  test("a refused loadout refuses the whole march and sends no troops", () => {
    const r = send(withHeroes(ALL), { lead: "hill_commander", deputies: ["hill_commander"] });
    expect(r).toMatchObject({ ok: false, reason: "duplicate_hero" });
    if (!r.ok) expect(r.state.troops).toEqual(t(40, 20, 10));
  });
});

describe("heroBattleModifier", () => {
  const snap = (lead: keyof typeof HEROES, deputies: (keyof typeof HEROES)[] = [], level = 1) => {
    const levels: Partial<Record<keyof typeof HEROES, number>> = {};
    for (const id of [lead, ...deputies]) levels[id] = level;
    return snapshotHeroes(roster(levels), { lead, deputies });
  };

  test("no heroes gives the neutral modifier", () => {
    expect(heroBattleModifier(undefined)).toEqual(NO_BATTLE_MODIFIER);
  });

  test("the command skill raises only the lead's specialty troops", () => {
    const def = HEROES.mountain_guide;
    const m = heroBattleModifier(snap("mountain_guide"));
    expect(m.attack.scouts).toBeCloseTo(1 + def.command.value + def.passives[1].value, 12);
    expect(m.attack.infantry).toBe(1);
    expect(m.attack.heavy).toBe(1);
    expect(m.damageTaken).toBeCloseTo(1 - def.passives[0].value, 12);
  });

  test("deputies add their passives but not their command skill", () => {
    const lead = heroBattleModifier(snap("iron_quartermaster"));
    const withDeputy = heroBattleModifier(snap("iron_quartermaster", ["dock_foreman"]));
    const d = HEROES.dock_foreman;
    expect(withDeputy.attack.infantry).toBeCloseTo(lead.attack.infantry + d.passives[1].value, 12);
    expect(withDeputy.damageTaken).toBeCloseTo(lead.damageTaken - d.passives[0].value, 12);
    expect(withDeputy.attack.infantry).toBeLessThan(lead.attack.infantry + d.command.value + d.passives[1].value + 1e-9);
  });

  test("higher levels scale effects by the level step", () => {
    const l1 = heroBattleModifier(snap("hill_commander", [], 1));
    const l4 = heroBattleModifier(snap("hill_commander", [], 4));
    const def = HEROES.hill_commander;
    expect(l4.attack.infantry - 1).toBeCloseTo((1 + 3 * HERO_LEVEL_EFFECT_STEP) * (def.command.value + def.passives[1].value), 12);
    expect(l4.attack.infantry).toBeGreaterThan(l1.attack.infantry);
  });

  test("defensive effects stack: each hero's passive, scaled by level, reduces damage taken", () => {
    // Four heroes' defence passives at level 10 (the lead's command is attack, so it is not counted).
    const m = heroBattleModifier(snap("hill_commander", ["iron_quartermaster", "mountain_guide", "dock_foreman"], 10));
    const scale = 1 + 9 * HERO_LEVEL_EFFECT_STEP;
    const defence = ["hill_commander", "iron_quartermaster", "mountain_guide", "dock_foreman"].reduce(
      (sum, id) => sum + HEROES[id as keyof typeof HEROES].passives[0].value * scale,
      0,
    );
    expect(m.damageTaken).toBeCloseTo(1 - defence, 12);
    expect(m.damageTaken).toBeGreaterThanOrEqual(HERO_MIN_DAMAGE_TAKEN);
  });

  test("the same heroes and levels always give the same modifier", () => {
    expect(heroBattleModifier(snap("iron_quartermaster", ["mountain_guide"], 3))).toEqual(heroBattleModifier(snap("iron_quartermaster", ["mountain_guide"], 3)));
  });
});

describe("resolveBattle with hero modifiers", () => {
  const LOOT = { food: 300, materiel: 200, funds: 100, support: 0 };
  const lead = snapshotHeroes(roster({ hill_commander: 10 }), { lead: "hill_commander", deputies: [] });
  const mod = heroBattleModifier(lead);

  test("the neutral modifier gives the same result as no modifier", () => {
    expect(resolveBattle(t(20, 5, 5), t(12, 8, 6), LOOT, 77, NO_BATTLE_MODIFIER)).toEqual(resolveBattle(t(20, 5, 5), t(12, 8, 6), LOOT, 77));
  });

  test("with a modifier, the same seed gives the same result", () => {
    expect(resolveBattle(t(20, 5, 5), t(12, 8, 6), LOOT, 77, mod)).toEqual(resolveBattle(t(20, 5, 5), t(12, 8, 6), LOOT, 77, mod));
  });

  test("a stronger lead wins more often over many seeds, and conserves the attacking force", () => {
    let plainWins = 0;
    let heroWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const plain = resolveBattle(t(12, 0, 0), t(8, 4, 3), LOOT, seed);
      const heroic = resolveBattle(t(12, 0, 0), t(8, 4, 3), LOOT, seed, mod);
      if (plain.victory) plainWins++;
      if (heroic.victory) heroWins++;
      const sent = 12;
      expect(heroic.attackerWounded.infantry + heroic.attackerLost.infantry + heroic.attackerSurvivors.infantry).toBe(sent);
    }
    expect(heroWins).toBeGreaterThanOrEqual(plainWins);
  });

  test("a damage-taken modifier never changes the attacker's kills, only its losses", () => {
    const shield = { attack: NO_BATTLE_MODIFIER.attack, damageTaken: 0.5 };
    const plain = resolveBattle(t(20, 0, 0), t(10, 0, 0), ZERO_RESOURCES, 5);
    const armored = resolveBattle(t(20, 0, 0), t(10, 0, 0), ZERO_RESOURCES, 5, shield);
    expect(armored.defenderKilled).toEqual(plain.defenderKilled);
    const lostPlain = plain.attackerWounded.infantry + plain.attackerLost.infantry;
    const lostArmored = armored.attackerWounded.infantry + armored.attackerLost.infantry;
    expect(lostArmored).toBeLessThanOrEqual(lostPlain);
  });
});

describe("state shape", () => {
  test("a pre-hero save migrates with an empty roster and a level-1 hero hall, and is accepted", () => {
    const old = { ...base(), heroes: undefined, levels: { hq: 2, farm: 1, armory: 1, treasury: 1, barracks: 1 } };
    const migrated = migrateBaseState(JSON.parse(JSON.stringify(old)));
    expect(isBaseState(migrated)).toBe(true);
    expect((migrated as BaseState).heroes).toEqual(EMPTY_HERO_ROSTER);
    expect((migrated as BaseState).levels.hero_hall).toBe(1);
  });

  test("a roster with a negative pity counter or an unknown hero is refused", () => {
    expect(isBaseState(base({ heroes: { owned: {}, pity: -1 } }))).toBe(false);
    expect(isBaseState(base({ heroes: { owned: { wizard: { level: 1, shards: 0 } } as never, pity: 0 } }))).toBe(false);
  });

  test("a march with heroes passes the state check, and one with an unknown hero is refused", () => {
    const sent = send(withHeroes(ALL), { lead: "dock_foreman", deputies: [] });
    if (!sent.ok) throw new Error("setup");
    expect(isBaseState(sent.state)).toBe(true);
    const bad = { ...sent.state, marches: sent.state.marches.map((m: MarchState) => ({ ...m, heroes: { lead: "nobody", deputies: [], levels: {} } })) };
    expect(isBaseState(bad)).toBe(false);
  });
});
