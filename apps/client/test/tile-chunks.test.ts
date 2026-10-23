import { expect, test } from "vitest";
import type { TileRange } from "../src/scene/world-layout.ts";
import { snapRange } from "../src/scene/world/tile-chunks.ts";
import { rows, type Row } from "./rows.ts";

const CHUNK = 8;
const SIZE = 64;
const range = (x0: number, x1: number, y0: number, y1: number): TileRange => ({ x0, x1, y0, y1 });

const RA: Row[] = [];

RA.push(["the snapped window contains the visible range and is chunk-aligned", () => {
  for (let x = 0; x < SIZE; x += 3) {
    for (let w = 0; w < 20; w += 5) {
      const r = range(x, Math.min(SIZE - 1, x + w), x, Math.min(SIZE - 1, x + w));
      const s = snapRange(r, CHUNK, SIZE);
      expect(s.x0).toBeLessThanOrEqual(r.x0);
      expect(s.x1).toBeGreaterThanOrEqual(r.x1);
      expect(s.y0).toBeLessThanOrEqual(r.y0);
      expect(s.y1).toBeGreaterThanOrEqual(r.y1);
      // Starts on a chunk boundary, unless it is clamped to the map's edge; ends at a boundary or the map's edge.
      expect(s.x0 % CHUNK === 0 || s.x0 === 0).toBe(true);
      expect((s.x1 + 1) % CHUNK === 0 || s.x1 === SIZE - 1).toBe(true);
    }
  }
}]);

RA.push(["the window is unchanged while the view moves inside one chunk", () => {
  // A view that stays within chunk 2 (tiles 16 to 23) keeps one window however it moves inside that chunk.
  const first = snapRange(range(16, 18, 16, 18), CHUNK, SIZE);
  for (let x = 16; x <= 21; x++) expect(snapRange(range(x, x + 2, x, x + 2), CHUNK, SIZE)).toEqual(first);
}]);

RA.push(["zooming out to the whole map gives the whole map, clamped", () => {
  expect(snapRange(range(0, SIZE - 1, 0, SIZE - 1), CHUNK, SIZE)).toEqual(range(0, SIZE - 1, 0, SIZE - 1));
  // A view at the map's corner is clamped at zero, not pushed negative.
  expect(snapRange(range(0, 2, 0, 2), CHUNK, SIZE)).toEqual(range(0, 15, 0, 15));
}]);

RA.push(["a range at the far edge is clamped to the last tile", () => {
  const s = snapRange(range(SIZE - 3, SIZE - 1, SIZE - 3, SIZE - 1), CHUNK, SIZE);
  expect(s.x1).toBe(SIZE - 1);
  expect(s.y1).toBe(SIZE - 1);
}]);

RA.push(["an empty range stays empty", () => {
  const empty = range(5, 4, 0, 3);
  const s = snapRange(empty, CHUNK, SIZE);
  expect(s.x0 > s.x1).toBe(true);
}]);

test("tile chunks: snapped props window", () => rows(RA));
