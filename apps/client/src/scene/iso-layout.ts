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

/** Fixed plots for M1 (GDD §4.1). */
export const PLOTS: Readonly<Record<BuildingId, Plot>> = {
  hq: { gx: 1.2, gy: 1.2, size: 2 },
  farm: { gx: 0.2, gy: 3.5, size: 2 },
  armory: { gx: 3.5, gy: 0.2, size: 2 },
  treasury: { gx: 3.7, gy: 3.7, size: 1.6 },
  barracks: { gx: 2.3, gy: 4.2, size: 1.4 },
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
