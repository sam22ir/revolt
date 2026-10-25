/**
 * Golden data for the Godot tile panel (`TileModel.tile_info`): what `tileInfo` (state/tile-info.ts) says a tapped tile holds, for a
 * synthetic map: each kind, a tile that holds several things at once (a base and an HQ, an HQ and a target; a base wins over an HQ,
 * an HQ over a target), a target whose level the table does not know (no definition), and empty land. The terrain is left out (it
 * comes from the map's own seed on each side). Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is
 * compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { MapSnapshot } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { tileInfo } from "../src/state/tile-info.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const SIZE = 16;

const snapshot = {
  map: "m",
  terrainSeed: 7,
  size: SIZE,
  bases: [
    { tag: "AAAA", x: 2, y: 2, mine: true, alliance: null },
    { tag: "BBBB", x: 6, y: 2, mine: false, alliance: "Wolves" },
    { tag: "CCCC", x: 12, y: 12, mine: false, alliance: null },
  ],
  hqs: [
    { tag: "WLF", x: 4, y: 4, mine: true },
    { tag: "XYZ", x: 12, y: 12, mine: false },
    { tag: "QRS", x: 13, y: 13, mine: false },
  ],
  npcs: [
    { id: "n1", kind: "patrol", level: 1, x: 8, y: 8, region: 1 },
    { id: "n2", kind: "convoy", level: 2, x: 9, y: 8, region: 1 },
    { id: "n3", kind: "outpost", level: 3, x: 10, y: 8, region: 1 },
    { id: "n4", kind: "fortified_line", level: 4, x: 11, y: 8, region: 1 },
    { id: "n9", kind: "patrol", level: 9, x: 10, y: 10, region: 1 },
    { id: "n5", kind: "patrol", level: 1, x: 13, y: 13, region: 1 },
  ],
  marches: [],
  rallies: [],
  liberations: [],
  now: 0,
} as unknown as MapSnapshot;

const buildFixtures = (): unknown => ({
  size: SIZE,
  snapshot,
  cases: Array.from({ length: SIZE * SIZE }, (_, i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) }))
    .map(({ x, y }) => ({ x, y, info: tileInfo(snapshot, x, y) }))
    .filter(({ x, y, info }) => info.kind !== "empty" || (x + y) % 7 === 0)
    .map(({ x, y, info }) => ({
      x,
      y,
      kind: info.kind,
      base: "base" in info ? info.base.tag : null,
      hq: "hq" in info ? info.hq.tag : null,
      npc: "npc" in info ? info.npc.id : null,
      rally_only: "def" in info && info.def !== null ? info.def.rallyOnly : null,
      has_def: "def" in info ? info.def !== null : null,
    })),
});

describe("Godot tile fixtures", () => {
  test("data/tile-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/tile-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/tile-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
