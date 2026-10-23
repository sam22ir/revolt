/** A screen rectangle in CSS px. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface EdgeArrow {
  /** Where the arrow sits, CSS px. */
  readonly x: number;
  readonly y: number;
  /** Direction toward the target, radians, 0 = pointing right, clockwise (screen y grows down). */
  readonly angle: number;
}

/**
 * Where to put an arrow that points at an off-screen target: on the edge of `band` (shrunk by `margin`) along the line from
 * the band's centre to the target. Null when the target is inside the band, so no arrow is needed. `avoid` is a corner
 * box (the minimap and home button) the arrow is pushed out of, upward.
 */
export const edgeArrow = (target: { x: number; y: number }, band: Rect, margin: number, avoid: Rect | null = null): EdgeArrow | null => {
  if (target.x >= band.left && target.x <= band.right && target.y >= band.top && target.y <= band.bottom) return null;
  const cx = (band.left + band.right) / 2;
  const cy = (band.top + band.bottom) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const hw = Math.max(1, (band.right - band.left) / 2 - margin);
  const hh = Math.max(1, (band.bottom - band.top) / 2 - margin);
  // Scale the direction so it just touches the shrunk band's edge.
  const s = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  let x = cx + dx * s;
  let y = cy + dy * s;
  if (avoid !== null && x >= avoid.left && x <= avoid.right && y >= avoid.top && y <= avoid.bottom) y = avoid.top;
  return { x, y, angle: Math.atan2(dy, dx) };
};
