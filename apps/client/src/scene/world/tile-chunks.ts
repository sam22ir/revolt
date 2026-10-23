import type { TileRange } from "../world-layout.ts";

/**
 * The tile window props are painted for: the visible range widened by one chunk each way and snapped outward to whole chunks,
 * clamped to the map. While the view stays inside one window the window does not change, so nothing repaints.
 * An empty range stays empty.
 */
export const snapRange = (range: TileRange, chunk: number, size: number): TileRange => {
  if (range.x0 > range.x1 || range.y0 > range.y1) return range;
  return {
    x0: Math.max(0, (Math.floor(range.x0 / chunk) - 1) * chunk),
    x1: Math.min(size - 1, (Math.floor(range.x1 / chunk) + 2) * chunk - 1),
    y0: Math.max(0, (Math.floor(range.y0 / chunk) - 1) * chunk),
    y1: Math.min(size - 1, (Math.floor(range.y1 / chunk) + 2) * chunk - 1),
  };
};
