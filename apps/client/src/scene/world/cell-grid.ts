import { TILE_W, worldToTile, tileToWorld, type TileRange } from "../world-layout.ts";

/** World px per grid cell. Each cell is one baked texture. */
export const CELL_W = 768;
export const CELL_H = 384;
/** Soft bleed around the map diamond, world px: tile edges and road strokes that reach past it. */
export const CELL_PAD = 16;
/** The slab edge drawn under the map's two near sides, world px. */
export const RIM = 22;

export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A grid of equal cells over the padded map: its top-left corner and how many cells across and down. */
export interface CellGrid {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
}

/** Inclusive cell bounds; empty when `c0 > c1` or `r0 > r1`. */
export interface CellRange {
  readonly c0: number;
  readonly c1: number;
  readonly r0: number;
  readonly r1: number;
}

/** The cells covering the map's diamond, its rim and the padding, with no gaps. */
export const cellGrid = (size: number): CellGrid => {
  const half = (size * TILE_W) / 2;
  const x0 = -half - CELL_PAD;
  const y0 = -CELL_PAD;
  const x1 = half + CELL_PAD;
  const y1 = tileToWorld(size, size).y + RIM + CELL_PAD;
  return { x0, y0, cols: Math.ceil((x1 - x0) / CELL_W), rows: Math.ceil((y1 - y0) / CELL_H) };
};

/** World rectangle of cell (`col`, `row`). */
export const cellRect = (grid: CellGrid, col: number, row: number): WorldRect => ({
  x: grid.x0 + col * CELL_W,
  y: grid.y0 + row * CELL_H,
  w: CELL_W,
  h: CELL_H,
});

/** Cells a world rectangle touches, clipped to the grid. */
export const cellsInRect = (grid: CellGrid, rect: WorldRect): CellRange => {
  const span = (a: number, b: number, origin: number, step: number, n: number): [number, number] => [
    Math.max(0, Math.floor((a - origin) / step)),
    Math.min(n - 1, Math.floor((b - origin) / step)),
  ];
  const [c0, c1] = span(rect.x, rect.x + rect.w, grid.x0, CELL_W, grid.cols);
  const [r0, r1] = span(rect.y, rect.y + rect.h, grid.y0, CELL_H, grid.rows);
  return { c0, c1, r0, r1 };
};

/**
 * The tiles that can touch a world rectangle, clipped to the map. It is a superset: every tile whose diamond meets the
 * rectangle is inside, and up to a tile more on each side. Extra tiles only paint outside the rectangle, where they are cut off.
 */
export const tilesInRect = (rect: WorldRect, size: number): TileRange => {
  const corners = [
    worldToTile(rect.x, rect.y),
    worldToTile(rect.x + rect.w, rect.y),
    worldToTile(rect.x, rect.y + rect.h),
    worldToTile(rect.x + rect.w, rect.y + rect.h),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs)) - 1),
    x1: Math.min(size - 1, Math.floor(Math.max(...xs)) + 1),
    y0: Math.max(0, Math.floor(Math.min(...ys)) - 1),
    y1: Math.min(size - 1, Math.floor(Math.max(...ys)) + 1),
  };
};
