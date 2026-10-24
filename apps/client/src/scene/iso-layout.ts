import type { BuildingId } from "@revolt/rules";
import type { SpriteInfo } from "../art/art.ts";

export const TILE_W = 128;
export const TILE_H = 64;
export const GRID_SIZE = 6;

export interface Plot {
  /** Grid coordinates of the footprint's top corner. */
  readonly gx: number;
  readonly gy: number;
  /** Footprint size in tiles (square). */
  readonly size: number;
}

/** Every plot is the same size: the painted sprites share one plot diamond. Centers sit in a quincunx so no building hides another's middle. */
const PLOT_SIZE = 1.6;
const plotAt = (cx: number, cy: number): Plot => ({ gx: cx - PLOT_SIZE / 2, gy: cy - PLOT_SIZE / 2, size: PLOT_SIZE });

/** Fixed plots for M1 (GDD §4.1). */
export const PLOTS: Readonly<Record<BuildingId, Plot>> = {
  hq: plotAt(3, 3),
  farm: plotAt(1, 2.6),
  armory: plotAt(2.6, 1),
  treasury: plotAt(5, 3.4),
  barracks: plotAt(3.4, 5),
  hero_hall: plotAt(1, 1),
};

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Grid → world pixels. World origin is the grid's top corner. */
export const isoToWorld = (gx: number, gy: number): Vec => ({
  x: ((gx - gy) * TILE_W) / 2,
  y: ((gx + gy) * TILE_H) / 2,
});

/** World-space center of the map diamond. */
export const mapCenter = (): Vec => isoToWorld(GRID_SIZE / 2, GRID_SIZE / 2);

export const MAP_WORLD_WIDTH = GRID_SIZE * TILE_W;
export const MAP_WORLD_HEIGHT = GRID_SIZE * TILE_H;

/** World point at the middle of a plot's footprint, at ground level. */
export const plotCenter = (plot: Plot): Vec => isoToWorld(plot.gx + plot.size / 2, plot.gy + plot.size / 2);

/** Placement of a building sprite: where it sits in world px and how tall it stands above its plot's centre line. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Height of the sprite above the plot's centre line, in world px. */
  readonly height: number;
}

/** Scale so the sprite's plot diamond is as wide as the plot, and place its diamond centre on the plot centre. */
export const placeSprite = (plot: Plot, info: Pick<SpriteInfo, "left" | "right">): Placement => {
  const scale = (plot.size * TILE_W) / (info.right.x - info.left.x);
  const cx = (info.left.x + info.right.x) / 2;
  const cy = (info.left.y + info.right.y) / 2;
  const c = plotCenter(plot);
  return { x: c.x - cx * scale, y: c.y - cy * scale, scale, height: cy * scale };
};

/** Fraction of the ground sprite's height that is slab thickness (its rim shows below the near edges). */
export const GROUND_RIM = 26 / 571;

/** The painted ground slab, stretched over the whole grid diamond: top-left corner and scale per axis. */
export const placeGround = (info: Pick<SpriteInfo, "w" | "h">): { readonly x: number; readonly y: number; readonly sx: number; readonly sy: number } => ({
  x: -MAP_WORLD_WIDTH / 2,
  y: 0,
  sx: MAP_WORLD_WIDTH / info.w,
  sy: MAP_WORLD_HEIGHT / (info.h * (1 - GROUND_RIM)),
});

/** Horizontal extent of the buildings (each sprite's left edge and width in world px) and the whole ground diamond. */
export const baseSpan = (sprites: readonly { readonly x: number; readonly width: number }[]): number => {
  const xs = sprites.flatMap((s) => [s.x, s.x + s.width]);
  xs.push(-MAP_WORLD_WIDTH / 2, MAP_WORLD_WIDTH / 2);
  return Math.max(...xs) - Math.min(...xs);
};

/**
 * Camera for the base: zoom and the world point at the middle of the view. Sizes are game (device) pixels; `px` is game px
 * per CSS px, and `room` is the HUD height at the top and the nav bar at the bottom in CSS px. The base keeps clear of
 * both, so it must not shrink when a panel opens.
 */
export const fitBase = (
  gameWidth: number,
  gameHeight: number,
  px: number,
  room: { readonly top: number; readonly nav: number },
  span: number,
): { readonly zoom: number; readonly center: Vec } => {
  const hudTop = room.top * px;
  const hudBottom = room.nav * px;
  const usableH = Math.max(100 * px, gameHeight - hudTop - hudBottom);
  const zoom = Math.min((gameWidth - 16 * px) / span, usableH / (MAP_WORLD_HEIGHT + 80));
  const c = mapCenter();
  // Shift the view so the map sits between the HUD and the bottom edge.
  const offset = (hudTop - hudBottom) / 2 / zoom;
  return { zoom, center: { x: c.x, y: c.y - 30 - offset } };
};
