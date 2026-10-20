import { describe, expect, test } from "vitest";
import {
  advance,
  checkSquad,
  HERO_IDS,
  HERO_LEVEL_UP,
  HERO_LEVELS_PER_HALL_LEVEL,
  heroLevelCap,
  HEROES,
  isBaseState,
  levelUpHero,
  MAX_HERO_LEVEL,
  MAX_SQUAD,
  migrateBaseState,
  recruitHero,
  squadSnapshot,
  START_HEROES,
  type BaseState,
} from "../src/index.ts";
import { base, DAY, HOUR, rich, T0, withHeroes } from "./helpers.ts";

const stocked = (): BaseState => withHeroes(rich(), { courier: { level: 0, shards: 30 }, organizer: { level: 0, shards: 5 } });

describe("recruitHero", () => {
  test("spends shards and support, and the hero starts at level 1", () => {
    const s = stocked();
    const r = recruitHero(s, "courier", T0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.heroes.courier).toEqual({ level: 1, shards: 30 - HEROES.courier.recruitShards });
    expect(r.state.resources.support).toBeCloseTo(s.resources.support - HEROES.courier.recruitSupport, 0);
  });

  test("does not mutate the input state", () => {
    const s = stocked();
    const copy = JSON.stringify(s);
    recruitHero(s, "courier", T0);
    recruitHero(s, "organizer", T0);
    expect(JSON.stringify(s)).toBe(copy);
  });

  test("refusals: already recruited, not enough shards, not enough support, unknown hero", () => {
    const s = stocked();
    const first = recruitHero(s, "courier", T0);
    if (!first.ok) throw new Error(first.reason);
    expect(recruitHero(first.state, "courier", T0)).toMatchObject({ ok: false, reason: "already_recruited" });
    expect(recruitHero(s, "organizer", T0)).toMatchObject({ ok: false, reason: "not_enough_shards" });
    const poor = withHeroes(base(), { courier: { level: 0, shards: 99 } });
    expect(recruitHero({ ...poor, resources: { ...poor.resources, support: 0 } }, "courier", T0)).toMatchObject({ ok: false, reason: "insufficient" });
    expect(recruitHero(s, "nobody" as never, T0)).toMatchObject({ ok: false, reason: "unknown_hero" });
  });

  test("a refusal still returns the state advanced to now", () => {
    const r = recruitHero(base(), "courier", T0 + HOUR);
    expect(r.ok).toBe(false);
    expect(r.state.lastUpdated).toBe(T0 + HOUR);
  });

  test("time going backwards leaves the state at its last update, and the recruit still works", () => {
    const s = stocked();
    const r = recruitHero(s, "courier", T0 - DAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.lastUpdated).toBe(s.lastUpdated);
  });

  test("a very long offline gap still caps support at storage before the cost is taken", () => {
    const r = recruitHero(stocked(), "courier", T0 + 1000 * DAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.resources.support).toBeGreaterThan(0);
    expect(r.state.resources.support).toBeLessThanOrEqual(advance(stocked(), T0 + 1000 * DAY).resources.support);
  });
});

describe("levelUpHero", () => {
  const recruited = (shards = 100, hall = 1): BaseState => {
    const s = withHeroes(rich(), { courier: { level: 1, shards } });
    return { ...s, levels: { ...s.levels, hero_hall: hall } };
  };

  test("spends shards and resources for one level", () => {
    const s = recruited();
    const r = levelUpHero(s, "courier", T0);
    if (!r.ok) throw new Error(r.reason);
    const cost = HERO_LEVEL_UP[0]!;
    expect(r.state.heroes.courier).toEqual({ level: 2, shards: 100 - cost.shards });
    expect(r.state.resources.food).toBeCloseTo(s.resources.food - cost.resources.food, 0);
  });

  test("refusals in order: not recruited, hall level, not enough shards, insufficient resources", () => {
    expect(levelUpHero(rich(), "courier", T0)).toMatchObject({ ok: false, reason: "not_recruited" });
    expect(levelUpHero(recruited(100, 1), "courier", T0).ok).toBe(true);
    const atCap = withHeroes(recruited(100, 1), { courier: { level: heroLevelCap(1), shards: 100 } });
    expect(levelUpHero(atCap, "courier", T0)).toMatchObject({ ok: false, reason: "hall_level" });
    expect(levelUpHero(recruited(0), "courier", T0)).toMatchObject({ ok: false, reason: "not_enough_shards" });
    const broke = { ...recruited(), resources: { food: 0, materiel: 0, funds: 0, support: 0 } };
    expect(levelUpHero(broke, "courier", T0)).toMatchObject({ ok: false, reason: "insufficient" });
    expect(levelUpHero(recruited(), "nobody" as never, T0)).toMatchObject({ ok: false, reason: "unknown_hero" });
  });

  test("the hall caps the level, and the top level is max_level", () => {
    expect(heroLevelCap(1)).toBe(HERO_LEVELS_PER_HALL_LEVEL);
    expect(heroLevelCap(10)).toBe(MAX_HERO_LEVEL);
    expect(heroLevelCap(0)).toBe(0);
    const top = withHeroes(recruited(1000, 10), { courier: { level: MAX_HERO_LEVEL, shards: 1000 } });
    expect(levelUpHero(top, "courier", T0)).toMatchObject({ ok: false, reason: "max_level" });
  });

  test("walking up to the hall cap takes exactly the table's shards", () => {
    let s: BaseState = { ...recruited(1000, 5), resources: { food: 50000, materiel: 50000, funds: 50000, support: 0 } };
    const start = s.heroes.courier.shards;
    let spent = 0;
    for (let level = 1; level < heroLevelCap(5); level++) {
      const r = levelUpHero(s, "courier", T0);
      if (!r.ok) throw new Error(r.reason);
      spent += HERO_LEVEL_UP[level - 1]!.shards;
      s = r.state;
    }
    expect(s.heroes.courier).toEqual({ level: heroLevelCap(5), shards: start - spent });
  });

  test("does not mutate the input state", () => {
    const s = recruited();
    const copy = JSON.stringify(s);
    levelUpHero(s, "courier", T0);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("squads", () => {
  const owned = withHeroes(rich(), { courier: { level: 3, shards: 0 }, medic: { level: 1, shards: 0 }, organizer: { level: 2, shards: 0 }, quartermaster: { level: 1, shards: 0 } });

  test("snapshot freezes ids with their current levels", () => {
    expect(squadSnapshot(owned, ["courier", "medic"])).toEqual([
      { id: "courier", level: 3 },
      { id: "medic", level: 1 },
    ]);
  });

  test("checkSquad accepts none, one and three; refuses duplicates, too many and unowned", () => {
    expect(checkSquad(owned, [])).toBeNull();
    expect(checkSquad(owned, ["courier"])).toBeNull();
    expect(checkSquad(owned, ["courier", "medic", "organizer"])).toBeNull();
    expect(checkSquad(owned, ["courier", "courier"])).toBe("bad_squad");
    expect(checkSquad(owned, ["courier", "medic", "organizer", "quartermaster"])).toBe("bad_squad");
    expect(MAX_SQUAD).toBe(3);
    expect(checkSquad(owned, ["mountain_guide"])).toBe("hero_not_owned");
    expect(checkSquad(owned, ["nobody" as never])).toBe("bad_squad");
  });
});

describe("hero state shape", () => {
  test("a new base has every hero unrecruited with no shards, and story at the start", () => {
    const s = base();
    for (const id of HERO_IDS) expect(s.heroes[id]).toEqual({ level: 0, shards: 0 });
    expect(s.story).toEqual({ chapter: 0, victories: 0 });
    expect(START_HEROES).toEqual(s.heroes);
  });

  test("an M4-era base migrates to a valid current one with a level-1 hero hall", () => {
    const m4 = JSON.parse(JSON.stringify(base()));
    delete m4.heroes;
    delete m4.story;
    delete m4.levels.hero_hall;
    expect(isBaseState(m4)).toBe(false);
    const v = migrateBaseState(m4);
    expect(isBaseState(v)).toBe(true);
    expect(v).toMatchObject({ levels: { hero_hall: 1 }, heroes: START_HEROES, story: { chapter: 0, victories: 0 } });
  });

  test("a partial heroes record is filled in, not trusted blindly", () => {
    const v = migrateBaseState({ ...base(), heroes: { courier: { level: 2, shards: 3 } } });
    expect(isBaseState(v)).toBe(true);
    expect((v as BaseState).heroes.courier).toEqual({ level: 2, shards: 3 });
    expect((v as BaseState).heroes.medic).toEqual({ level: 0, shards: 0 });
  });

  test("malformed hero or story data fails the shape check", () => {
    const s = base();
    const bad: unknown[] = [
      { ...s, heroes: { ...s.heroes, courier: { level: 11, shards: 0 } } },
      { ...s, heroes: { ...s.heroes, courier: { level: -1, shards: 0 } } },
      { ...s, heroes: { ...s.heroes, courier: { level: 1.5, shards: 0 } } },
      { ...s, heroes: { ...s.heroes, courier: { level: 1, shards: -5 } } },
      { ...s, heroes: { ...s.heroes, courier: { level: 1, shards: 1e12 } } },
      { ...s, heroes: { courier: { level: 1, shards: 0 } } },
      { ...s, heroes: null },
      { ...s, story: { chapter: -1, victories: 0 } },
      { ...s, story: { chapter: 1, victories: 0.5 } },
      { ...s, story: null },
    ];
    for (const b of bad) expect(isBaseState(b)).toBe(false);
  });

  test("a march's hero snapshot is validated", () => {
    const m = { id: "m", target: { npcId: "n", level: 1, x: 1, y: 1 }, from: { x: 0, y: 0 }, troops: base().troops, departAt: 0, arriveAt: 1, returnAt: 2, outcome: null };
    expect(isBaseState({ ...base(), marches: [{ ...m, heroes: [{ id: "courier", level: 2 }] }] })).toBe(true);
    for (const heroes of [[{ id: "nobody", level: 1 }], [{ id: "courier", level: 0 }], [{ id: "courier", level: 11 }], "x", [1, 2, 3, 4].map(() => ({ id: "courier", level: 1 }))]) {
      expect(isBaseState({ ...base(), marches: [{ ...m, heroes }] })).toBe(false);
    }
  });
});
