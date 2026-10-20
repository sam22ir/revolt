import type { BuildingId } from "@revolt/rules";

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
  hero_hall: plotAt(1, 5),
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
