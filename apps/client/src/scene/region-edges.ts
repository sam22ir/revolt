import type { RegionId } from "@revolt/rules";
import type { TileRange } from "./world-layout.ts";

/**
 * A border between two regions, as one edge of tile `(x, y)`'s diamond. `right` is the edge shared with
 * `(x + 1, y)` (the diamond's right-to-bottom side), `left` the one shared with `(x, y + 1)` (left-to-bottom).
 * Checking only those two neighbours draws each shared edge once. `a` is the tile's region, `b` the neighbour's.
 */
export interface RegionEdge {
  readonly x: number;
  readonly y: number;
  readonly side: "right" | "left";
  readonly a: RegionId;
  readonly b: RegionId;
}

/** Region borders of the tiles in `range`. The map's outer edge gets none: the rim already marks it. */
export const regionEdges = (grid: readonly RegionId[], size: number, range: TileRange): RegionEdge[] => {
  const out: RegionEdge[] = [];
  for (let x = Math.max(0, range.x0); x <= Math.min(size - 1, range.x1); x++) {
    for (let y = Math.max(0, range.y0); y <= Math.min(size - 1, range.y1); y++) {
      const a = grid[y * size + x] ?? 0;
      if (x + 1 < size) {
        const b = grid[y * size + x + 1] ?? a;
        if (b !== a) out.push({ x, y, side: "right", a, b });
      }
      if (y + 1 < size) {
        const b = grid[(y + 1) * size + x] ?? a;
        if (b !== a) out.push({ x, y, side: "left", a, b });
      }
    }
  }
  return out;
};
