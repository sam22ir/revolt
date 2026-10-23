import { expect } from "vitest";
import { GEO_BANK, GEO_OASIS, GEO_OASIS_RING, GEO_OASIS_SHORE, GEO_ROAD, GEO_WADI } from "@revolt/rules";
import { hash01, OASIS_FRONT, OLIVE_FRAMES, ORCHARD_FRAMES, propsFor, type PropContext } from "../src/scene/terrain-props.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

RA.push(["hashes the same tile to the same number, always in [0, 1)", () => {
  expect(hash01(12, 34, 5)).toBe(hash01(12, 34, 5));
  for (let i = 0; i < 500; i++) {
    const v = hash01(i, i * 7, 3);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
}]);

RA.push(["gives the same props for the same tile and different ones for others", () => {
  expect(propsFor("forest", 4, 9, 1)).toEqual(propsFor("forest", 4, 9, 1));
  const a = JSON.stringify(propsFor("forest", 4, 9, 1));
  const some = Array.from({ length: 30 }, (_, i) => JSON.stringify(propsFor("forest", i, 9, 1)));
  expect(some.some((s) => s !== a)).toBe(true);
}]);

RA.push(["thickens a forest toward its middle", () => {
  const count = (interior: number): number => {
    let n = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) n += propsFor("forest", x, y, interior).filter((p) => p.kind === "trees").length;
    return n;
  };
  expect(count(1)).toBeGreaterThan(count(0.5));
  expect(count(0.5)).toBeGreaterThan(count(0));
}]);

RA.push(["keeps peaks rare and to the middle of mountains, and trees to forests", () => {
  const tiles = Array.from({ length: 400 }, (_, i) => [i % 20, Math.floor(i / 20)] as const);
  const peaks = (interior: number): number => tiles.filter(([x, y]) => propsFor("mountain", x, y, interior).some((p) => p.kind === "peaks")).length;
  expect(peaks(1)).toBeGreaterThan(0);
  expect(peaks(1)).toBeLessThan(tiles.length / 2);
  expect(peaks(0.6)).toBe(0);
  for (const t of ["plain", "hills", "forest", "mountain"] as const) {
    expect(tiles.every(([x, y]) => propsFor(t, x, y, 1).every((p) => p.kind !== "terraces"))).toBe(true);
  }
  for (const t of ["plain", "hills", "mountain"] as const) {
    expect(tiles.every(([x, y]) => propsFor(t, x, y, 1).every((p) => p.kind !== "trees"))).toBe(true);
  }
}]);

RA.push(["keeps offsets inside a tile and scales positive", () => {
  for (let x = 0; x < 30; x++) {
    for (let y = 0; y < 30; y++) {
      for (const t of ["plain", "hills", "forest", "mountain"] as const) {
        for (const p of propsFor(t, x, y, 0.7)) {
          expect(Math.abs(p.dx)).toBeLessThanOrEqual(0.4);
          expect(Math.abs(p.dy)).toBeLessThanOrEqual(0.4);
          expect(p.scale).toBeGreaterThan(0);
          expect(p.pick).toBeGreaterThanOrEqual(0);
          expect(p.pick).toBeLessThan(1);
        }
      }
    }
  }
}]);

const grid = Array.from({ length: 900 }, (_, i) => [i % 30, Math.floor(i / 30)] as const);
const with_ = (flags: number, fertility = 0.5): PropContext => ({ flags, fertility });
const all = (t: "plain" | "hills" | "forest" | "mountain", ctx: PropContext) => grid.flatMap(([x, y]) => propsFor(t, x, y, 1, ctx));

RA.push(["keeps roads and oasis pools bare, and a riverbed to small stones", () => {
  for (const t of ["plain", "hills", "forest", "mountain"] as const) {
    expect(all(t, with_(GEO_ROAD))).toEqual([]);
    expect(all(t, with_(GEO_OASIS))).toEqual([]);
    const bed = all(t, with_(GEO_WADI));
    expect(bed.every((p) => p.kind === "rocks" && p.scale <= 0.6)).toBe(true);
  }
}]);

RA.push(["grows olive groves on green plains and leaves bare ground nearly empty", () => {
  const trees = (f: number) => all("plain", with_(0, f)).filter((p) => p.kind === "trees");
  expect(trees(0.9).length).toBeGreaterThan(grid.length / 2);
  expect(trees(0.9).every((p) => p.frames === OLIVE_FRAMES)).toBe(true);
  expect(trees(0.7).length).toBeLessThan(trees(0.9).length);
  expect(trees(0.2)).toEqual([]);
  expect(all("plain", with_(0, 0.2)).length).toBeLessThan(grid.length * 0.15);
}]);

RA.push(["lines riverbanks with scrub and olives, rings an oasis with orchard but keeps its shore and front low", () => {
  const bank = all("plain", with_(GEO_BANK));
  expect(bank.some((p) => p.kind === "trees" && p.frames === OLIVE_FRAMES)).toBe(true);
  expect(bank.some((p) => p.kind === "scrub")).toBe(true);
  const ring = all("plain", with_(GEO_OASIS_RING));
  expect(ring.length).toBeGreaterThanOrEqual(grid.length);
  expect(ring.every((p) => p.kind === "trees" && p.frames === ORCHARD_FRAMES)).toBe(true);
  for (const low of [GEO_OASIS_RING | GEO_OASIS_SHORE, GEO_OASIS_RING | OASIS_FRONT]) expect(all("plain", with_(low)).every((p) => p.kind === "scrub")).toBe(true);
  // Mountains keep their rock even inside a ring.
  expect(all("mountain", with_(GEO_OASIS_RING)).some((p) => p.kind === "trees")).toBe(false);
}]);

RA.push(["picks only frames that exist in the trees atlas (18 frames)", () => {
  for (const f of ORCHARD_FRAMES) expect(f >= 0 && f < 18).toBe(true);
}]);

test("terrain props: hash, props, forest and mountain density, offsets, landmarks and fertility", () => rows(RA));
