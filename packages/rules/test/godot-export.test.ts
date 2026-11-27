import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildGodotBalance, buildGodotDisplayFixtures, buildGodotHealFixtures, buildGodotMapFixtures, buildGodotUpgradeFixtures } from "../src/export/godot-data.ts";

const committed = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../apps/godot/data/${name}`, import.meta.url), "utf8"));

const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const nonFinite = (v: unknown, path = "$"): string[] => {
  if (typeof v === "number") return Number.isFinite(v) ? [] : [path];
  if (v === undefined || typeof v === "function") return [path];
  if (typeof v !== "object" || v === null) return [];
  return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`));
};

describe("Godot export", () => {
  test("balance.json is up to date (run `pnpm godot:export`)", () => {
    expect(committed("balance.json")).toEqual(roundTrip(buildGodotBalance()));
  });

  test("the sites block gives each kind its resource, a rate for every level, and the harvest cap", () => {
    const sites = (buildGodotBalance() as { sites: { kinds: string[]; levels: number[]; maxHarvestMs: number; siteResource: Record<string, string>; ratePerHour: Record<string, Record<string, number>> } }).sites;
    expect(sites.kinds).toEqual(["farmland", "quarry", "depot"]);
    expect(sites.levels).toEqual([1, 2, 3, 4, 5]);
    expect(sites.siteResource).toEqual({ farmland: "food", quarry: "materiel", depot: "funds" });
    for (const kind of sites.kinds) {
      expect(Object.keys(sites.ratePerHour[kind]!).sort()).toEqual(["1", "2", "3", "4", "5"]);
      for (const level of sites.levels) expect(sites.ratePerHour[kind]![String(level)]).toBeGreaterThan(0);
    }
    expect(sites.maxHarvestMs).toBeGreaterThan(0);
  });

  test("display-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    expect(committed("display-fixtures.json")).toEqual(roundTrip(buildGodotDisplayFixtures()));
  });

  test("upgrade-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    expect(committed("upgrade-fixtures.json")).toEqual(roundTrip(buildGodotUpgradeFixtures()));
  });

  test("heal-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    expect(committed("heal-fixtures.json")).toEqual(roundTrip(buildGodotHealFixtures()));
  });

  test("map-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    expect(committed("map-fixtures.json")).toEqual(roundTrip(buildGodotMapFixtures()));
  });

  test("exports hold only finite numbers, strings, arrays and plain objects", () => {
    expect(nonFinite(buildGodotBalance())).toEqual([]);
    expect(nonFinite(buildGodotDisplayFixtures())).toEqual([]);
    expect(nonFinite(buildGodotMapFixtures())).toEqual([]);
    expect(nonFinite(buildGodotUpgradeFixtures())).toEqual([]);
  });
});
