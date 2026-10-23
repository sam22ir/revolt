/** Minimap width in CSS px; it is a diamond like the map, twice as wide as it is tall. */
export const MINIMAP_W = 112;
export const MINIMAP_H = MINIMAP_W / 2;

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Position on the minimap of a tile corner (fractional tile coordinates are fine). The map's top corner is (0, 0). */
export const tileToMinimap = (size: number, x: number, y: number, w = MINIMAP_W): Pt => ({
  x: (((x - y) / size + 1) / 2) * w,
  y: ((x + y) / (2 * size)) * (w / 2),
});

/** The tile under a minimap point, or null outside the map's diamond. */
export const minimapToTile = (size: number, px: number, py: number, w = MINIMAP_W): Pt | null => {
  const u = (2 * px) / w - 1;
  const v = py / (w / 2);
  const x = size * (v + u / 2);
  const y = size * (v - u / 2);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x: Math.floor(x), y: Math.floor(y) };
};
