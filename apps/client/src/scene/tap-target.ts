/**
 * Which tile a tap means. Base and target sprites are wider than their tile and stand up from it, so their roofs cover
 * the tiles behind them: a finger on a roof lands on an empty tile behind. When the tapped tile is empty and a marker in
 * front of it has a sprite over the finger, the tap picks that marker.
 */
export interface TapPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * `tile` is the tile under the finger and `frac` the finger's fractional tile position. `occupied(x, y)` says whether a
 * marker stands there. Distances are in iso screen terms: `x + y` grows down the screen and `x - y` to the right, one unit
 * being half a tile. `up` is how far above a marker's centre its sprite reaches, `side` how far to either side (a base is
 * drawn about two tiles wide and four half-tiles tall above its centre).
 */
export const tapTarget = (tile: TapPoint, frac: TapPoint, occupied: (x: number, y: number) => boolean, up = 5, side = 2): TapPoint => {
  if (occupied(tile.x, tile.y)) return tile;
  let best: TapPoint | null = null;
  // Markers up to three tiles in front can cover this spot with their sprite; the one nearest the viewer (largest x + y,
  // drawn on top) wins, as that is the one the finger sees.
  for (let dy = 0; dy <= 3; dy++)
    for (let dx = 0; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = { x: tile.x + dx, y: tile.y + dy };
      if (!occupied(c.x, c.y)) continue;
      // The finger must be above the marker's centre on screen, within its sprite's height and width.
      const above = c.x + c.y + 1 - (frac.x + frac.y);
      const across = Math.abs(c.x - c.y - (frac.x - frac.y));
      if (above < 0 || above > up || across > side) continue;
      if (best === null || c.x + c.y > best.x + best.y) best = c;
    }
  return best ?? tile;
};
