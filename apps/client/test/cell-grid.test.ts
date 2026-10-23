import { expect, test } from "vitest";
import { tileToWorld, TILE_H, TILE_W, type TileRange } from "../src/scene/world-layout.ts";
import { CELL_H, CELL_PAD, CELL_W, cellGrid, cellRect, cellsInRect, RIM, tilesInRect, type WorldRect } from "../src/scene/world/cell-grid.ts";
import { rows, type Row } from "./rows.ts";

const RA: Row[] = [];

/** Whether a tile's diamond bounding box (a superset of the diamond) meets a world rectangle. */
const diamondMeets = (x: number, y: number, r: WorldRect): boolean => {
  const p = tileToWorld(x, y);
  return p.x - TILE_W / 2 <= r.x + r.w && p.x + TILE_W / 2 >= r.x && p.y <= r.y + r.h && p.y + TILE_H >= r.y;
};

const inside = (t: TileRange, x: number, y: number): boolean => x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1;

RA.push(["the grid covers the padded map bbox with no gaps", () => {
  for (const size of [1, 8, 64]) {
    const g = cellGrid(size);
    const first = cellRect(g, 0, 0);
    const last = cellRect(g, g.cols - 1, g.rows - 1);
    const half = (size * TILE_W) / 2;
    expect(first.x).toBeLessThanOrEqual(-half - CELL_PAD);
    expect(first.y).toBeLessThanOrEqual(-CELL_PAD);
    expect(last.x + last.w).toBeGreaterThanOrEqual(half + CELL_PAD);
    expect(last.y + last.h).toBeGreaterThanOrEqual(size * TILE_H + RIM + CELL_PAD);
    // Neighbouring cells share an edge exactly, so there is no gap between them.
    expect(cellRect(g, 1, 0).x).toBe(first.x + CELL_W);
    expect(cellRect(g, 0, 1).y).toBe(first.y + CELL_H);
  }
}]);

RA.push(["a 64-tile map is about 9 by 9 cells", () => {
  const g = cellGrid(64);
  expect(g.cols).toBe(9);
  expect(g.rows).toBe(9);
}]);

RA.push(["the cell holding the map's top corner includes that tile and nothing far away", () => {
  const size = 64;
  const g = cellGrid(size);
  // The top corner of the map, tile (0, 0), sits at world (0, 0); the cell that contains it is at column 4, row 0.
  const col = Math.floor((0 - g.x0) / CELL_W);
  expect(col).toBe(4);
  const t = tilesInRect(cellRect(g, col, 0), size);
  expect(inside(t, 0, 0)).toBe(true);
  expect(inside(t, size - 1, size - 1)).toBe(false);
  expect(inside(t, 40, 40)).toBe(false);
}]);

RA.push(["a corner cell outside the diamond has no map tiles of its own (it stays transparent)", () => {
  const size = 64;
  const g = cellGrid(size);
  const rect = cellRect(g, 0, 0);
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) expect(diamondMeets(x, y, rect), `tile ${x},${y}`).toBe(false);
}]);

RA.push(["every tile whose diamond meets a cell is in the cell's tile range (corners, edges, middle)", () => {
  for (const size of [5, 64]) {
    const g = cellGrid(size);
    for (let c = 0; c < g.cols; c++) {
      for (let r = 0; r < g.rows; r++) {
        const rect = cellRect(g, c, r);
        const t = tilesInRect(rect, size);
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            if (diamondMeets(x, y, rect)) expect(inside(t, x, y), `tile ${x},${y} cell ${c},${r} size ${size}`).toBe(true);
          }
        }
      }
    }
  }
}]);

RA.push(["a rectangle entirely off the map has an empty tile range", () => {
  const size = 16;
  const far: WorldRect = { x: 100000, y: 100000, w: 100, h: 100 };
  const t = tilesInRect(far, size);
  expect(t.x0 > t.x1 || t.y0 > t.y1).toBe(true);
}]);

RA.push(["cells touching a view: clipped to the grid, empty when off it", () => {
  const g = cellGrid(64);
  const all = cellsInRect(g, { x: -1e6, y: -1e6, w: 2e6, h: 2e6 });
  expect(all).toEqual({ c0: 0, c1: g.cols - 1, r0: 0, r1: g.rows - 1 });
  const off = cellsInRect(g, { x: 1e6, y: 1e6, w: 10, h: 10 });
  expect(off.c0 > off.c1 || off.r0 > off.r1).toBe(true);
  const one = cellsInRect(g, cellRect(g, 3, 2));
  expect(one.c0).toBe(3);
  expect(one.r0).toBe(2);
}]);

test("cell grid: coverage, tile ranges and view cells", () => rows(RA));
