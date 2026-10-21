import { describe, expect, test } from "vitest";
import { compareEntries, createBaseState, LEADERBOARDS, playerPower, rankOf, regionsLiberated, type BoardEntry } from "../src/index.ts";
import { base, T0, withHeroes } from "./helpers.ts";

describe("playerPower", () => {
  test("grows with buildings, troops (home and marching) and hero levels, never shrinks", () => {
    const s = base();
    const p0 = playerPower(s);
    expect(playerPower({ ...s, levels: { ...s.levels, farm: 2 } })).toBeGreaterThan(p0);
    expect(playerPower({ ...s, troops: { ...s.troops, heavy: s.troops.heavy + 1 } })).toBeGreaterThan(p0);
    expect(playerPower(withHeroes(s, { courier: { level: 2, shards: 0 } }))).toBeGreaterThan(p0);
  });

  test("troops on a march still count; wounded do not", () => {
    const s = base();
    const march = {
      id: "m",
      target: { npcId: "n", level: 1, x: 0, y: 0 },
      from: { x: 0, y: 0 },
      troops: { infantry: 5, scouts: 0, heavy: 0, porters: 0 },
      departAt: T0,
      arriveAt: T0,
      returnAt: T0,
      outcome: null,
    };
    expect(playerPower({ ...s, marches: [march] })).toBeGreaterThan(playerPower(s));
    expect(playerPower({ ...s, wounded: { infantry: 99, scouts: 0, heavy: 0, porters: 0 } })).toBe(playerPower(s));
  });

  test("is a whole number and the same for the same state", () => {
    const s = createBaseState(T0);
    expect(Number.isInteger(playerPower(s))).toBe(true);
    expect(playerPower(s)).toBe(playerPower({ ...s }));
  });

  test("regions liberated is the story victory count", () => {
    expect(regionsLiberated({ ...base(), story: { chapter: 0, victories: 7 } })).toBe(7);
  });
});

describe("tie-break", () => {
  const e = (handle: string, score: number, reachedAt: number): BoardEntry => ({ handle, score, reachedAt });

  test("score first, then who got there first, then the handle", () => {
    const list = [e("BBB", 10, 5), e("AAA", 10, 5), e("CCC", 10, 1), e("DDD", 20, 99)];
    expect([...list].sort(compareEntries).map((x) => x.handle)).toEqual(["DDD", "CCC", "AAA", "BBB"]);
  });

  test("the order does not depend on the input order", () => {
    const list = [e("A", 3, 3), e("B", 3, 2), e("C", 3, 2), e("D", 1, 0), e("E", 9, 9)];
    const want = [...list].sort(compareEntries).map((x) => x.handle);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      expect([...shuffled].sort(compareEntries).map((x) => x.handle)).toEqual(want);
    }
  });

  test("rankOf is 1-based, and null for someone absent", () => {
    const list = [e("A", 1, 0), e("B", 5, 0), e("C", 3, 0)];
    expect(rankOf(list, "B")).toBe(1);
    expect(rankOf(list, "C")).toBe(2);
    expect(rankOf(list, "A")).toBe(3);
    expect(rankOf(list, "Z")).toBeNull();
  });

  test("the four boards of GDD 4.9 exist", () => {
    expect([...LEADERBOARDS]).toEqual(["power", "regions", "alliance", "event"]);
  });
});
