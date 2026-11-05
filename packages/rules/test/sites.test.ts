import { describe, expect, test } from "vitest";
import {
  checkHarvest,
  geographyOf,
  GEO_OASIS,
  GEO_OASIS_RING,
  GEO_ROAD,
  GEO_WADI,
  harvestCarry,
  harvestedAt,
  harvestTiming,
  MAP_SIZE,
  MAX_MARCHES,
  placeSites,
  recallTiming,
  regionsOf,
  SITE_MAX_HARVEST_MS,
  SITE_MIN_SPACING,
  terrainAt,
  ZERO_TROOPS,
  type MapSite,
  type MarchState,
  type Troops,
} from "../src/index.ts";
import { base, HOUR, SEC, T0 } from "./helpers.ts";

const SEEDS = [1, 2, 3, 42, 1234, 99999, 0xdeadbeef];
const farm1 = { kind: "farmland", level: 1 } as const;
const quarry3 = { kind: "quarry", level: 3 } as const;
const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });

const sitesFor = (seed: number): readonly MapSite[] => placeSites(seed, geographyOf(seed, MAP_SIZE));

const march = (id: string): MarchState => ({
  id,
  target: { npcId: "n1", level: 1, x: 1, y: 1 },
  from: { x: 0, y: 0 },
  troops: t(1),
  departAt: T0,
  arriveAt: T0 + SEC,
  returnAt: T0 + 2 * SEC,
  outcome: null,
});

describe("placeSites", () => {
  test("same seed gives the same sites; different seeds differ", () => {
    expect(sitesFor(42)).toEqual(sitesFor(42));
    expect(sitesFor(42)).not.toEqual(sitesFor(43));
  });

  test("no site on a road, wadi, oasis, ring, region centre or mountain", () => {
    for (const seed of SEEDS) {
      const geo = geographyOf(seed, MAP_SIZE);
      const centres = new Set(
        regionsOf(seed, MAP_SIZE).map((r) => `${Math.floor(r.site.x)},${Math.floor(r.site.y)}`),
      );
      for (const s of sitesFor(seed)) {
        const flags = geo.flags[s.y * MAP_SIZE + s.x] ?? 0;
        expect(flags & (GEO_WADI | GEO_ROAD | GEO_OASIS | GEO_OASIS_RING)).toBe(0);
        expect(terrainAt(seed, s.x, s.y)).not.toBe("mountain");
        expect(centres.has(`${s.x},${s.y}`)).toBe(false);
      }
    }
  });

  test("ids are unique, shaped kind:index, and levels and kinds are valid", () => {
    for (const seed of SEEDS) {
      const sites = sitesFor(seed);
      const ids = sites.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of sites) {
        expect(s.id).toMatch(/^(farmland|quarry):\d+$/);
        expect(s.id.startsWith(`${s.kind}:`)).toBe(true);
        expect([1, 2, 3]).toContain(s.level);
      }
    }
  });

  test("count is in a sane range for a 64-tile map and sites keep their spacing", () => {
    for (const seed of SEEDS) {
      const sites = sitesFor(seed);
      expect(sites.length).toBeGreaterThanOrEqual(15);
      expect(sites.length).toBeLessThanOrEqual(40);
      for (let i = 0; i < sites.length; i++) {
        for (let j = i + 1; j < sites.length; j++) {
          const a = sites[i]!;
          const b = sites[j]!;
          expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(SITE_MIN_SPACING);
        }
      }
    }
  });

  test("ids are stable: index follows row-major scan order within each kind", () => {
    const sites = sitesFor(42);
    for (const kind of ["farmland", "quarry"] as const) {
      const mine = sites.filter((s) => s.kind === kind);
      mine.forEach((s, i) => expect(s.id).toBe(`${kind}:${i}`));
      for (let i = 1; i < mine.length; i++) {
        const p = mine[i - 1]!;
        const q = mine[i]!;
        expect(p.y < q.y || (p.y === q.y && p.x < q.x)).toBe(true);
      }
    }
  });

  test("kinds alternate in scan order, so both kinds are present", () => {
    const sites = sitesFor(42);
    expect(sites.some((s) => s.kind === "farmland")).toBe(true);
    expect(sites.some((s) => s.kind === "quarry")).toBe(true);
  });

  test("the level comes from the distance to the nearest region centre", () => {
    const seed = 42;
    const centres = regionsOf(seed, MAP_SIZE).map((r) => r.site);
    for (const s of sitesFor(seed)) {
      const d = Math.min(...centres.map((c) => Math.hypot(s.x - c.x, s.y - c.y)));
      const want = d <= 6 ? 3 : d <= 12 ? 2 : 1;
      expect(s.level).toBe(want);
    }
  });
});

describe("harvestedAt", () => {
  const CARRY = 1_000_000;

  test("zero at arrival", () => {
    expect(harvestedAt(farm1, CARRY, T0, T0)).toBe(0);
  });

  test("linear in time at the site rate", () => {
    expect(harvestedAt(farm1, CARRY, T0, T0 + HOUR)).toBe(300);
    expect(harvestedAt(farm1, CARRY, T0, T0 + HOUR / 2)).toBe(150);
    expect(harvestedAt(quarry3, CARRY, T0, T0 + 2 * HOUR)).toBe(1400);
  });

  test("capped by carry room", () => {
    expect(harvestedAt(farm1, 100, T0, T0 + HOUR)).toBe(100);
  });

  test("capped by the harvest window", () => {
    expect(harvestedAt(farm1, CARRY, T0, T0 + 24 * HOUR)).toBe(300 * 8);
    expect(harvestedAt(farm1, CARRY, T0, T0 + SITE_MAX_HARVEST_MS)).toBe(300 * 8);
  });

  test("time going backwards gives zero", () => {
    expect(harvestedAt(farm1, CARRY, T0 + HOUR, T0)).toBe(0);
  });

  test("a very long gap is capped by the window", () => {
    expect(harvestedAt(farm1, CARRY, T0, T0 + 365 * 24 * HOUR)).toBe(300 * 8);
  });

  test("carry 0 or negative gives zero", () => {
    expect(harvestedAt(farm1, 0, T0, T0 + HOUR)).toBe(0);
    expect(harvestedAt(farm1, -5, T0, T0 + HOUR)).toBe(0);
  });
});

describe("harvestTiming", () => {
  const LEG = 10 * 60 * SEC;

  test("fill time at the site rate", () => {
    const h = harvestTiming(farm1, 300, T0, LEG);
    expect(h.arriveAt).toBe(T0);
    expect(h.leaveSiteAt).toBe(T0 + HOUR);
    expect(h.returnAt).toBe(T0 + HOUR + LEG);
  });

  test("a full carry is credited by the time it leaves", () => {
    for (const carry of [1, 7, 15, 100, 2345, 60 * 20]) {
      const h = harvestTiming(quarry3, carry, T0, LEG);
      expect(harvestedAt(quarry3, carry, T0, h.leaveSiteAt)).toBe(carry);
    }
  });

  test("capped at the maximum harvest window", () => {
    const h = harvestTiming(farm1, 1_000_000, T0, LEG);
    expect(h.leaveSiteAt).toBe(T0 + SITE_MAX_HARVEST_MS);
    expect(h.returnAt).toBe(T0 + SITE_MAX_HARVEST_MS + LEG);
  });

  test("no carry leaves at arrival", () => {
    expect(harvestTiming(farm1, 0, T0, LEG).leaveSiteAt).toBe(T0);
  });
});

describe("recallTiming", () => {
  const LEG = 5 * 60 * SEC;

  test("refused before the march has arrived", () => {
    expect(recallTiming(T0 + HOUR, T0 + HOUR - 1, LEG)).toEqual({ ok: false, reason: "not_at_site" });
  });

  test("after arrival, leaves now and returns one leg later", () => {
    expect(recallTiming(T0, T0 + 30 * 60 * SEC, LEG)).toEqual({
      ok: true,
      leaveSiteAt: T0 + 30 * 60 * SEC,
      returnAt: T0 + 30 * 60 * SEC + LEG,
    });
  });

  test("a recall past the harvest window leaves at the window's end", () => {
    expect(recallTiming(T0, T0 + 10 * HOUR, LEG)).toEqual({
      ok: true,
      leaveSiteAt: T0 + SITE_MAX_HARVEST_MS,
      returnAt: T0 + SITE_MAX_HARVEST_MS + LEG,
    });
  });

  test("at the exact arrival instant it is allowed", () => {
    expect(recallTiming(T0, T0, LEG)).toEqual({ ok: true, leaveSiteAt: T0, returnAt: T0 + LEG });
  });
});

describe("checkHarvest", () => {
  const site: MapSite = { id: "farmland:0", kind: "farmland", level: 1, x: 3, y: 4 };
  const troops = t(2, 0, 0, 1);
  const free = new Set<string>();
  const home = t(5, 0, 0, 5);

  test("passes with a site free, troops at home and marches to spare", () => {
    expect(checkHarvest(base({ troops: home }), troops, site, free)).toBeNull();
  });

  test("no such site", () => {
    expect(checkHarvest(base({ troops: home }), troops, undefined, free)).toBe("no_such_site");
  });

  test("site already occupied", () => {
    expect(checkHarvest(base({ troops: home }), troops, site, new Set([site.id]))).toBe("site_taken");
  });

  test("no troops sent", () => {
    expect(checkHarvest(base({ troops: home }), ZERO_TROOPS, site, free)).toBe("no_troops");
  });

  test("not enough troops at home", () => {
    expect(checkHarvest(base({ troops: t(1) }), troops, site, free)).toBe("not_enough_troops");
  });

  test("too many marches out", () => {
    const marches = Array.from({ length: MAX_MARCHES }, (_, i) => march(`m${i}`));
    expect(checkHarvest(base({ troops: home, marches }), troops, site, free)).toBe("too_many_marches");
  });

  test("porters carry the load and count as carry", () => {
    expect(harvestCarry(t(2, 0, 0, 1))).toBe(2 * 10 + 60);
  });
});
