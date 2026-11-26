import { test } from "vitest";
import {
  baseSiteOk,
  geographyOf,
  harvestCarry,
  harvestTiming,
  MAP_SIZE,
  maxHarvestMs,
  placeSites,
  regionsOf,
  SITE_MAX_HARVEST_MS,
  terrainAt,
  ZONE_CARRY_MULTIPLIER,
  ZONE_CLEARANCE,
  ZONE_COUNT,
  ZONE_EDGE_MARGIN,
  ZONE_MAX_HARVEST_MS,
  ZONE_SITES,
  ZONE_SPACING_SHARE,
  zoneAt,
  zonesOf,
} from "../src/index.ts";
import { ex } from "./helpers.ts";

const SEEDS = [1, 42, 0xdeadbeef];

test("zonesOf: pure, apart, off the edges, on land, away from region centres", () => {
  for (const seed of SEEDS) {
    const e = ex(`seed ${seed}`);
    const zones = zonesOf(seed);
    e(zones, "same again").toEqual(zonesOf(seed));
    e(zones.length, "count").toBe(ZONE_COUNT);
    e(zones.map((z) => z.id), "ids").toEqual(zones.map((_, i) => i));
    for (const z of zones) {
      e(Math.min(z.x, z.y, MAP_SIZE - 1 - z.x, MAP_SIZE - 1 - z.y), `zone ${z.id} off the edge`).toBeGreaterThanOrEqual(ZONE_EDGE_MARGIN);
      e(terrainAt(seed, z.x, z.y), `zone ${z.id} on land`).not.toBe("mountain");
      for (const r of regionsOf(seed)) e(Math.hypot(r.site.x - z.x, r.site.y - z.y), `zone ${z.id} from region ${r.id}`).toBeGreaterThan(z.radius + ZONE_CLEARANCE);
      for (const o of zones) if (o.id !== z.id) e(Math.hypot(o.x - z.x, o.y - z.y), `zone ${z.id} from ${o.id}`).toBeGreaterThanOrEqual(MAP_SIZE * ZONE_SPACING_SHARE);
      e(zoneAt(seed, z.x, z.y)?.id, `zone ${z.id} centre`).toBe(z.id);
      e(zoneAt(seed, z.x + z.radius + 1, z.y), `just outside zone ${z.id}`).toBeNull();
      e(zoneAt(seed, z.x + z.radius + 1, z.y, MAP_SIZE, ZONE_CLEARANCE)?.id, `zone ${z.id} with its clearance`).toBe(z.id);
    }
  }
  ex("a small map")(zonesOf(7, 64).length).toBeLessThanOrEqual(ZONE_COUNT);
});

test("no base, HQ or target near a zone; zone sites are rich, inside, apart; open sites stay out", () => {
  for (const seed of SEEDS) {
    const e = ex(`seed ${seed}`);
    const zones = zonesOf(seed);
    for (const z of zones)
      for (let dy = -z.radius - ZONE_CLEARANCE; dy <= z.radius + ZONE_CLEARANCE; dy++)
        for (let dx = -z.radius - ZONE_CLEARANCE; dx <= z.radius + ZONE_CLEARANCE; dx++)
          if (Math.hypot(dx, dy) <= z.radius + ZONE_CLEARANCE) e(baseSiteOk(seed, z.x + dx, z.y + dy), `${z.x + dx},${z.y + dy}`).toBe(false);
    const sites = placeSites(seed, geographyOf(seed, MAP_SIZE));
    for (const z of zones) {
      const mine = sites.filter((s) => s.zone === z.id);
      e(mine.length, `zone ${z.id} sites`).toBe(ZONE_SITES);
      e(mine.some((s) => s.kind === "depot"), `zone ${z.id} has a depot`).toBe(true);
      for (const s of mine) {
        e(s.level, `${s.id} level`).toBeGreaterThanOrEqual(4);
        e(zoneAt(seed, s.x, s.y)?.id, `${s.id} inside`).toBe(z.id);
        e(s.id, `${s.id} id`).toMatch(new RegExp(`^(farmland|quarry|depot):z${z.id}\\.\\d$`));
      }
      for (let i = 0; i < mine.length; i++)
        for (let j = i + 1; j < mine.length; j++) e(Math.max(Math.abs(mine[i]!.x - mine[j]!.x), Math.abs(mine[i]!.y - mine[j]!.y)), `${mine[i]!.id} vs ${mine[j]!.id}`).toBeGreaterThanOrEqual(2);
    }
    for (const s of sites.filter((x) => x.zone === null)) {
      e(s.level, `${s.id} level`).toBeLessThanOrEqual(3);
      e(s.kind, `${s.id} kind`).not.toBe("depot");
      e(zoneAt(seed, s.x, s.y, MAP_SIZE, ZONE_CLEARANCE), `${s.id} out of zones`).toBeNull();
    }
  }
}, 30_000);

test("a zone site carries more and may hold a column longer", () => {
  const e = ex("zone harvest");
  const troops = { infantry: 10, scouts: 0, heavy: 0, porters: 0 };
  const open = { kind: "farmland", level: 3, zone: null } as const;
  const rich = { kind: "farmland", level: 5, zone: 0 } as const;
  e(harvestCarry(troops, rich)).toBe(harvestCarry(troops) * ZONE_CARRY_MULTIPLIER);
  e(harvestCarry(troops, open)).toBe(harvestCarry(troops));
  e(maxHarvestMs(open)).toBe(SITE_MAX_HARVEST_MS);
  e(maxHarvestMs(rich)).toBe(ZONE_MAX_HARVEST_MS);
  // A carry too big to fill: the stay is capped by each one's own window.
  e(harvestTiming(open, 1e9, 0, 0).leaveSiteAt).toBe(SITE_MAX_HARVEST_MS);
  e(harvestTiming(rich, 1e9, 0, 0).leaveSiteAt).toBe(ZONE_MAX_HARVEST_MS);
});
