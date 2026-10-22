import { describe, expect, test } from "vitest";
import {
  advance,
  LIBERATION_BONUS_CAP,
  LIBERATION_BONUS_PER_REGION,
  liberatedCount,
  multiplierBreakpoints,
  NO_WORLD,
  productionMultiplier,
  regionAt,
  regionsOf,
  RESOURCE_IDS,
  storageCap,
  strongholdTile,
  terrainAt,
  type World,
} from "../src/index.ts";
import { base, DAY, HOUR, MIN, T0 } from "./helpers.ts";

const world = (...l: [number, number, number | null][]): World => ({
  liberations: l.map(([region, from, until]) => ({ region, from, until })),
});

const B = LIBERATION_BONUS_PER_REGION;

describe("liberation bonus", () => {
  test("no liberations means no bonus", () => {
    expect(productionMultiplier(NO_WORLD, T0)).toBe(1);
  });

  test("each liberated region adds the same share", () => {
    const w = world([0, T0, null], [5, T0, null]);
    expect(liberatedCount(w, T0)).toBe(2);
    expect(productionMultiplier(w, T0)).toBeCloseTo(1 + 2 * B);
  });

  test("the bonus is capped", () => {
    const many = world(...Array.from({ length: 100 }, (_, i): [number, number, null] => [i, T0, null]));
    expect(productionMultiplier(many, T0)).toBeCloseTo(1 + LIBERATION_BONUS_CAP);
  });

  test("a region listed twice counts once", () => {
    expect(liberatedCount(world([3, T0, null], [3, T0, null]), T0)).toBe(1);
  });

  test("a liberation starts at `from` and ends before `until`", () => {
    const w = world([1, T0 + HOUR, T0 + 2 * HOUR]);
    expect(liberatedCount(w, T0 + HOUR - 1)).toBe(0);
    expect(liberatedCount(w, T0 + HOUR)).toBe(1);
    expect(liberatedCount(w, T0 + 2 * HOUR - 1)).toBe(1);
    expect(liberatedCount(w, T0 + 2 * HOUR)).toBe(0);
  });

  test("breakpoints are the changes strictly inside the interval, sorted, without duplicates", () => {
    const w = world([1, T0 + 2 * HOUR, null], [2, T0 + HOUR, T0 + 2 * HOUR], [3, T0 - HOUR, T0 + 9 * HOUR]);
    expect(multiplierBreakpoints(w, T0, T0 + 3 * HOUR)).toEqual([T0 + HOUR, T0 + 2 * HOUR]);
  });
});

describe("production with liberations", () => {
  test("a liberation in the middle of the interval pays only from then on", () => {
    const w = world([1, T0 + HOUR, null]);
    const s = advance(base(), T0 + 2 * HOUR, w);
    expect(s.resources.food).toBeCloseTo(500 + 120 + 120 * (1 + B));
  });

  test("time before the state's last update is never paid, even if the liberation started earlier", () => {
    const w = world([1, T0 - 5 * HOUR, null]);
    const s = advance(base(), T0 + HOUR, w);
    expect(s.resources.food).toBeCloseTo(500 + 120 * (1 + B));
    const none = advance(base(), T0 + HOUR, NO_WORLD);
    expect(none.resources.food).toBeCloseTo(500 + 120);
  });

  test("a liberation that ended stops paying", () => {
    const w = world([1, T0, T0 + HOUR]);
    const s = advance(base(), T0 + 3 * HOUR, w);
    expect(s.resources.food).toBeCloseTo(500 + 120 * (1 + B) + 2 * 120);
  });

  test("advancing in steps equals advancing in one go", () => {
    const w = world([1, T0 + 7 * MIN, null], [2, T0 + 33 * MIN, T0 + 50 * MIN]);
    let stepped = base();
    for (let i = 1; i <= 60; i++) stepped = advance(stepped, T0 + i * MIN, w);
    const once = advance(base(), T0 + HOUR, w);
    for (const id of RESOURCE_IDS) expect(stepped.resources[id]).toBeCloseTo(once.resources[id], 6);
  });

  test("a long offline gap across several changes stops at the storage cap", () => {
    const w = world([1, T0 + DAY, T0 + 2 * DAY], [2, T0 + 3 * DAY, null]);
    const s = advance(base(), T0 + 30 * DAY, w);
    expect(s.resources).toEqual(storageCap(2));
  });

  test("an amount already above the cap is not clamped down", () => {
    const w = world([1, T0, null]);
    const s = advance(base({ resources: { food: 9999, materiel: 0, funds: 0, support: 0 } }), T0 + HOUR, w);
    expect(s.resources.food).toBe(9999);
    expect(s.resources.materiel).toBeCloseTo(100 * (1 + B));
  });

  test("time going backwards is a no-op", () => {
    const s = base();
    expect(advance(s, T0 - HOUR, world([1, T0 - 2 * HOUR, null]))).toBe(s);
  });
});

describe("stronghold placement", () => {
  const SEEDS = [1, 42, 99_999, 4_000_000_000];

  test("every region's stronghold lies in its own region, off the mountains, and is reproducible", () => {
    for (const seed of SEEDS) {
      for (const { id } of regionsOf(seed)) {
        const at = strongholdTile(seed, id, [], 2);
        expect(at).not.toBeNull();
        if (at === null) continue;
        expect(regionAt(seed, at.x, at.y)).toBe(id);
        expect(terrainAt(seed, at.x, at.y)).not.toBe("mountain");
        expect(strongholdTile(seed, id, [], 2)).toEqual(at);
      }
    }
  });

  test("it keeps its distance from taken tiles, and falls back to any free tile when crowded", () => {
    const seed = 42;
    const id = regionsOf(seed)[0]?.id ?? 0;
    const first = strongholdTile(seed, id, [], 2);
    if (first === null) throw new Error("no tile");
    const second = strongholdTile(seed, id, [first], 2);
    expect(second).not.toBeNull();
    expect(Math.max(Math.abs((second?.x ?? 0) - first.x), Math.abs((second?.y ?? 0) - first.y))).toBeGreaterThan(2);
    const everything = Array.from({ length: 64 * 64 }, (_, i) => ({ x: i % 64, y: Math.floor(i / 64) }));
    const crowded = everything.filter((p) => !(p.x === first.x && p.y === first.y));
    expect(strongholdTile(seed, id, crowded, 2)).toEqual(first);
  });
});
