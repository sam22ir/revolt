/**
 * Which tile a tap means. Base and target sprites are wider than their tile and stand up from it, so their roofs cover
 * the tiles behind them: a finger on a roof lands on an empty tile behind. When the tapped tile is empty and a marker in
 * front of it has a sprite over the finger, the tap picks that marker.
 */
export interface TapPoint {
  readonly x: number;
  readonly y: number;
}

/** Screen reach of the largest marker (a base drawn 2 tiles wide), in the units below, at marker factor 1. */
const UP = 5;
const SIDE = 2;
const REF_SCALE = 2;

/**
 * `tile` is the tile under the finger and `frac` the finger's fractional tile position. `scaleAt(x, y)` is the sprite size
 * (tiles across) of the marker standing there, or 0 for none; `factor` is the zoom's marker factor (markers grow when far
 * out). Distances are in iso screen terms: `x + y` grows down the screen and `x - y` to the right, one unit being half a
 * tile. A marker's sprite reaches UP units above its centre and SIDE to either side at REF_SCALE, proportionally smaller
 * for smaller markers, so a tap on empty ground next to a small target stays on the ground (empty tiles have actions).
 */
export const tapTarget = (tile: TapPoint, frac: TapPoint, scaleAt: (x: number, y: number) => number, factor = 1): TapPoint => {
  if (scaleAt(tile.x, tile.y) > 0) return tile;
  let best: TapPoint | null = null;
  const reach = Math.ceil(3 * factor);
  // Markers in front can cover this spot with their sprite; the one nearest the viewer (largest x + y, drawn on top) wins,
  // as that is the one the finger sees.
  for (let dy = 0; dy <= reach; dy++)
    for (let dx = 0; dx <= reach; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = { x: tile.x + dx, y: tile.y + dy };
      const scale = scaleAt(c.x, c.y);
      if (scale <= 0) continue;
      const k = (scale / REF_SCALE) * factor;
      const above = c.x + c.y + 1 - (frac.x + frac.y);
      const across = Math.abs(c.x - c.y - (frac.x - frac.y));
      if (above < 0 || above > UP * k || across > SIDE * k) continue;
      if (best === null || c.x + c.y > best.x + best.y) best = c;
    }
  return best ?? tile;
};
