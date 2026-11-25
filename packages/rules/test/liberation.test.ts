import { expect, test } from "vitest";
import {
  advance,
  LIBERATION_BONUS_CAP,
  LIBERATION_BONUS_PER_REGION,
  liberatedCount,
  liberatedRegions,
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
import { base, DAY, ex, HOUR, MIN, T0 } from "./helpers.ts";

const world = (...l: [number, number, number | null][]): World => ({
  liberations: l.map(([region, from, until]) => ({ region, from, until })),
});
const B = LIBERATION_BONUS_PER_REGION;

test("liberation bonus: share per region, cap, dedupe, from/until boundaries, breakpoints", () => {
  ex("no liberations means no bonus")(productionMultiplier(NO_WORLD, T0)).toBe(1);

  {
    const e = ex("each liberated region adds the same share");
    const w = world([0, T0, null], [5, T0, null]);
    e(liberatedCount(w, T0), "count").toBe(2);
    e(productionMultiplier(w, T0), "multiplier").toBeCloseTo(1 + 2 * B);
  }

  {
    const many = world(...Array.from({ length: 100 }, (_, i): [number, number, null] => [i, T0, null]));
    ex("the bonus is capped")(productionMultiplier(many, T0)).toBeCloseTo(1 + LIBERATION_BONUS_CAP);
  }

  ex("a region listed twice counts once")(liberatedCount(world([3, T0, null], [3, T0, null]), T0)).toBe(1);

  {
    const e = ex("a liberation starts at `from` and ends before `until`");
    const w = world([1, T0 + HOUR, T0 + 2 * HOUR]);
    e(liberatedCount(w, T0 + HOUR - 1), "1ms before from").toBe(0);
    e(liberatedCount(w, T0 + HOUR), "at from").toBe(1);
    e(liberatedCount(w, T0 + 2 * HOUR - 1), "1ms before until").toBe(1);
    e(liberatedCount(w, T0 + 2 * HOUR), "at until").toBe(0);
  }

  {
    const e = ex("liberatedRegions lists the distinct regions held at that moment");
    const w = world([1, T0, null], [1, T0, null], [4, T0 + HOUR, T0 + 2 * HOUR]);
    e([...liberatedRegions(w, T0)], "at T0").toEqual([1]);
    e([...liberatedRegions(w, T0 + HOUR)].sort(), "at from of 4").toEqual([1, 4]);
    e([...liberatedRegions(w, T0 + 2 * HOUR)], "at until of 4").toEqual([1]);
  }

  {
    const w = world([1, T0 + 2 * HOUR, null], [2, T0 + HOUR, T0 + 2 * HOUR], [3, T0 - HOUR, T0 + 9 * HOUR]);
    ex("breakpoints are the changes strictly inside the interval, sorted, without duplicates")(
      multiplierBreakpoints(w, T0, T0 + 3 * HOUR),
    ).toEqual([T0 + HOUR, T0 + 2 * HOUR]);
  }
});

test("production with liberations: mid-interval start/end, never before lastUpdated, steps, cap, backwards", () => {
  {
    const w = world([1, T0 + HOUR, null]);
    ex("a liberation in the middle of the interval pays only from then on")(
      advance(base(), T0 + 2 * HOUR, w).resources.food,
    ).toBeCloseTo(500 + 120 + 120 * (1 + B));
  }

  {
    const e = ex("time before the state's last update is never paid, even if the liberation started earlier");
    const w = world([1, T0 - 5 * HOUR, null]);
    e(advance(base(), T0 + HOUR, w).resources.food, "with liberation").toBeCloseTo(500 + 120 * (1 + B));
    e(advance(base(), T0 + HOUR, NO_WORLD).resources.food, "without").toBeCloseTo(500 + 120);
  }

  {
    const w = world([1, T0, T0 + HOUR]);
    ex("a liberation that ended stops paying")(advance(base(), T0 + 3 * HOUR, w).resources.food).toBeCloseTo(
      500 + 120 * (1 + B) + 2 * 120,
    );
  }

  {
    const e = ex("advancing in steps equals advancing in one go");
    const w = world([1, T0 + 7 * MIN, null], [2, T0 + 33 * MIN, T0 + 50 * MIN]);
    let stepped = base();
    for (let i = 1; i <= 60; i++) stepped = advance(stepped, T0 + i * MIN, w);
    const once = advance(base(), T0 + HOUR, w);
    for (const id of RESOURCE_IDS) e(stepped.resources[id], id).toBeCloseTo(once.resources[id], 6);
  }

  {
    const w = world([1, T0 + DAY, T0 + 2 * DAY], [2, T0 + 3 * DAY, null]);
    ex("a long offline gap across several changes stops at the storage cap")(
      advance(base(), T0 + 30 * DAY, w).resources,
    ).toEqual(storageCap(2));
  }

  {
    const e = ex("an amount already above the cap is not clamped down");
    const w = world([1, T0, null]);
    const s = advance(base({ resources: { food: 9999, materiel: 0, funds: 0, support: 0 } }), T0 + HOUR, w);
    e(s.resources.food, "food kept").toBe(9999);
    e(s.resources.materiel, "materiel produced").toBeCloseTo(100 * (1 + B));
  }

  {
    const s = base();
    ex("time going backwards is a no-op")(advance(s, T0 - HOUR, world([1, T0 - 2 * HOUR, null]))).toBe(s);
  }
});

test("stronghold placement: in own region, off mountains, reproducible, spaced, crowded fallback", () => {
  {
    const e = ex("every region's stronghold lies in its own region, off the mountains, and is reproducible");
    for (const seed of [1, 42, 99_999, 4_000_000_000]) {
      for (const { id } of regionsOf(seed)) {
        const row = `seed ${seed} region ${id}`;
        const at = strongholdTile(seed, id, [], 2);
        e(at, `${row} exists`).not.toBeNull();
        if (at === null) continue;
        e(regionAt(seed, at.x, at.y), `${row} region`).toBe(id);
        e(terrainAt(seed, at.x, at.y), `${row} terrain`).not.toBe("mountain");
        e(strongholdTile(seed, id, [], 2), `${row} reproducible`).toEqual(at);
      }
    }
  }

  {
    const e = ex("it keeps its distance from taken tiles, and falls back to any free tile when crowded");
    const seed = 42;
    const id = regionsOf(seed)[0]?.id ?? 0;
    const first = strongholdTile(seed, id, [], 2);
    if (first === null) throw new Error("no tile");
    const second = strongholdTile(seed, id, [first], 2);
    e(second, "second exists").not.toBeNull();
    e(Math.max(Math.abs((second?.x ?? 0) - first.x), Math.abs((second?.y ?? 0) - first.y)), "distance").toBeGreaterThan(2);
    const everything = Array.from({ length: 64 * 64 }, (_, i) => ({ x: i % 64, y: Math.floor(i / 64) }));
    const crowded = everything.filter((p) => !(p.x === first.x && p.y === first.y));
    e(strongholdTile(seed, id, crowded, 2), "crowded fallback").toEqual(first);
  }
});
