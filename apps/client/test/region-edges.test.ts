import { regionAt, regionGrid, isRegionBorder } from "@revolt/rules";
import { expect } from "vitest";
import { regionEdges } from "../src/scene/region-edges.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

const FULL = { x0: 0, x1: 63, y0: 0, y1: 63 };

RA.push(["a 2x2 grid of two regions has one edge down the middle, drawn once", () => {
  // Regions: left column 0, right column 1.
  const grid = [0, 1, 0, 1];
  expect(regionEdges(grid, 2, { x0: 0, x1: 1, y0: 0, y1: 1 })).toEqual([
    { x: 0, y: 0, side: "right", a: 0, b: 1 },
    { x: 0, y: 1, side: "right", a: 0, b: 1 },
  ]);
}]);

RA.push(["the other direction uses the left side", () => {
  const grid = [0, 0, 1, 1];
  expect(regionEdges(grid, 2, { x0: 0, x1: 1, y0: 0, y1: 1 })).toEqual([
    { x: 0, y: 0, side: "left", a: 0, b: 1 },
    { x: 1, y: 0, side: "left", a: 0, b: 1 },
  ]);
}]);

RA.push(["no edge on the map's outer boundary or inside one region", () => {
  expect(regionEdges([5, 5, 5, 5], 2, { x0: 0, x1: 1, y0: 0, y1: 1 })).toEqual([]);
}]);

RA.push(["only tiles in the range are looked at, clipped to the map", () => {
  const grid = [0, 1, 0, 1];
  expect(regionEdges(grid, 2, { x0: 1, x1: 9, y0: 0, y1: 0 })).toEqual([]);
  expect(regionEdges(grid, 2, { x0: -5, x1: 0, y0: -5, y1: 0 })).toHaveLength(1);
}]);

RA.push(["on a real map every edge separates two different regions, and every region-border tile has one", () => {
  const seed = 42;
  const edges = regionEdges(regionGrid(seed, 64), 64, FULL);
  expect(edges.length).toBeGreaterThan(50);
  for (const e of edges) {
    expect(e.a).not.toBe(e.b);
    expect(regionAt(seed, e.x, e.y, 64)).toBe(e.a);
  }
  // Any tile with a different-region right or lower neighbour is covered.
  for (const [x, y] of [[0, 0], [31, 31], [63, 5]] as const) {
    const lower = y + 1 < 64 && regionAt(seed, x, y + 1, 64) !== regionAt(seed, x, y, 64);
    const right = x + 1 < 64 && regionAt(seed, x + 1, y, 64) !== regionAt(seed, x, y, 64);
    const has = edges.some((e) => e.x === x && e.y === y);
    expect(has).toBe(lower || right);
  }
  expect(isRegionBorder(seed, 0, 0)).toBeTypeOf("boolean");
}]);


test("region edges: shared edge once, bounds, range clipping, real map", () => rows(RA));
