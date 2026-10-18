import type { MapMarchView } from "@revolt/rules";
import type { Vec } from "./iso-layout.ts";

/** World pixels (zoom 1) per tile: an isometric diamond, twice as wide as it is tall. */
export const TILE_W = 96;
export const TILE_H = 48;

/** Screen pixels per CSS pixel × world pixel. Zoomed out the whole map fits a phone; zoomed in a tile is a thumb. */
export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 1.6;

/**
 * What the camera looks at: the world point at the middle of the screen, the zoom,
 * and the screen size. Screen units are the pointer's units (device pixels in the game).
 */
export interface View {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** Inclusive tile bounds; empty when `x0 > x1` or `y0 > y1`. */
export interface TileRange {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** World position of a tile's top corner. Fractional tiles are fine. */
export const tileToWorld = (tx: number, ty: number): Vec => ({
  x: ((tx - ty) * TILE_W) / 2,
  y: ((tx + ty) * TILE_H) / 2,
});

/** World position of the middle of a tile. */
export const tileCenter = (tx: number, ty: number): Vec => tileToWorld(tx + 0.5, ty + 0.5);

/** Inverse of `tileToWorld`: fractional tile coordinates. */
export const worldToTile = (wx: number, wy: number): Vec => ({
  x: wy / TILE_H + wx / TILE_W,
  y: wy / TILE_H - wx / TILE_W,
});

export const worldToScreen = (view: View, w: Vec): Vec => ({
  x: (w.x - view.cx) * view.zoom + view.width / 2,
  y: (w.y - view.cy) * view.zoom + view.height / 2,
});

export const screenToWorld = (view: View, sx: number, sy: number): Vec => ({
  x: (sx - view.width / 2) / view.zoom + view.cx,
  y: (sy - view.height / 2) / view.zoom + view.cy,
});

/** The tile under a screen point; may be off the map. */
export const screenToTile = (view: View, sx: number, sy: number): Vec => {
  const w = screenToWorld(view, sx, sy);
  const t = worldToTile(w.x, w.y);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
};

/** Screen position of a tile's middle. */
export const tileToScreen = (view: View, tx: number, ty: number): Vec => {
  const c = tileCenter(tx, ty);
  return worldToScreen(view, c);
};

export const isTileOnMap = (size: number, tx: number, ty: number): boolean => tx >= 0 && ty >= 0 && tx < size && ty < size;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Tiles that can be on screen, with `margin` spare tiles all round, clipped to the map. */
export const visibleTileRange = (view: View, size: number, margin = 1): TileRange => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  // A rotated rectangle's tile extent is set by its corners.
  for (const [sx, sy] of [
    [0, 0],
    [view.width, 0],
    [0, view.height],
    [view.width, view.height],
  ] as const) {
    const w = screenToWorld(view, sx, sy);
    const t = worldToTile(w.x, w.y);
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
  }
  return {
    x0: Math.max(0, Math.floor(minX) - margin),
    x1: Math.min(size - 1, Math.ceil(maxX) + margin),
    y0: Math.max(0, Math.floor(minY) - margin),
    y1: Math.min(size - 1, Math.ceil(maxY) + margin),
  };
};

export const rangesEqual = (a: TileRange, b: TileRange): boolean => a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1;

/** Drags the map by a screen delta. */
export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, cx: view.cx - dx / view.zoom, cy: view.cy - dy / view.zoom });

/** Zooms by `factor`, keeping the world point under the screen point (sx, sy) where it is. */
export const zoomAt = (view: View, factor: number, sx: number, sy: number): View => {
  const zoom = clampZoom(view.zoom * factor);
  const w = screenToWorld(view, sx, sy);
  return { ...view, zoom, cx: w.x - (sx - view.width / 2) / zoom, cy: w.y - (sy - view.height / 2) / zoom };
};

/** Keeps the view's middle inside the map. */
export const clampCenter = (view: View, size: number): View => {
  const t = worldToTile(view.cx, view.cy);
  const x = Math.min(size, Math.max(0, t.x));
  const y = Math.min(size, Math.max(0, t.y));
  if (x === t.x && y === t.y) return view;
  const w = tileToWorld(x, y);
  return { ...view, cx: w.x, cy: w.y };
};

/** The tile at the middle of the screen, clipped to the map. */
export const centerTile = (view: View, size: number): Vec => {
  const t = worldToTile(view.cx, view.cy);
  return { x: Math.min(size - 1, Math.max(0, Math.floor(t.x))), y: Math.min(size - 1, Math.max(0, Math.floor(t.y))) };
};

export type MarchLeg = "outbound" | "returning" | "done";

export interface MarchPosition {
  readonly leg: MarchLeg;
  /** Tile coordinates of the marching column (tile middles are +0.5 on both axes). */
  readonly at: Vec;
}

const fraction = (from: number, to: number, now: number): number => (to <= from ? 1 : Math.min(1, Math.max(0, (now - from) / (to - from))));

const lerp = (a: Vec, b: Vec, f: number): Vec => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

/** Where a march is at `now`: out from `from` to `to` until `arriveAt`, back until `returnAt`, then gone. */
export const marchPosition = (m: Pick<MapMarchView, "from" | "to" | "departAt" | "arriveAt" | "returnAt">, now: number): MarchPosition => {
  if (now >= m.returnAt) return { leg: "done", at: m.from };
  if (now < m.arriveAt) return { leg: "outbound", at: lerp(m.from, m.to, fraction(m.departAt, m.arriveAt, now)) };
  return { leg: "returning", at: lerp(m.to, m.from, fraction(m.arriveAt, m.returnAt, now)) };
};
