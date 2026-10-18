/** What the map reacts to. Positions are screen pixels in the pointer's own units. */
export interface GestureHandlers {
  /** Drag: move the map by this much. */
  readonly pan: (dx: number, dy: number) => void;
  /** Pinch: scale by `factor` around the point between the fingers. */
  readonly zoom: (factor: number, x: number, y: number) => void;
  /** A touch that stayed put: select what is under it. */
  readonly tap: (x: number, y: number) => void;
}

export interface Gesture {
  readonly down: (id: number, x: number, y: number) => void;
  readonly move: (id: number, x: number, y: number) => void;
  readonly up: (id: number) => void;
  /** Forgets everything (e.g. when the scene goes to sleep). */
  readonly cancel: () => void;
}

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * One finger (or the mouse) pans and taps; two fingers pan and pinch. A touch only
 * becomes a pan after it moves more than `slop`, so a tap never nudges the map;
 * once two fingers have touched, the gesture can no longer end as a tap.
 * Pure input handling: no Phaser, so it is unit-tested.
 */
export const createGesture = (handlers: GestureHandlers, slop: number): Gesture => {
  const pointers = new Map<number, Point>();
  let start: Point = { x: 0, y: 0 };
  let panning = false;
  let multi = false;

  const pair = (): [Point, Point] | null => {
    const [a, b] = [...pointers.values()];
    return a !== undefined && b !== undefined ? [a, b] : null;
  };
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  return {
    down: (id, x, y) => {
      pointers.set(id, { x, y });
      if (pointers.size === 1) {
        start = { x, y };
        panning = false;
        multi = false;
      } else {
        multi = true;
        panning = true;
      }
    },
    move: (id, x, y) => {
      const p = pointers.get(id);
      if (p === undefined) return;
      const both = pair();
      if (both !== null && pointers.size === 2) {
        const [a, b] = both;
        const before = { mid: mid(a, b), dist: distance(a, b) };
        p.x = x;
        p.y = y;
        const after = { mid: mid(a, b), dist: distance(a, b) };
        handlers.pan(after.mid.x - before.mid.x, after.mid.y - before.mid.y);
        if (before.dist > 0 && after.dist > 0) handlers.zoom(after.dist / before.dist, after.mid.x, after.mid.y);
        return;
      }
      if (pointers.size !== 1) return;
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (!panning) {
        if (distance(start, p) <= slop) return;
        panning = true;
        // Catch up on the movement held back while it was still within the slop.
        handlers.pan(x - start.x, y - start.y);
        return;
      }
      handlers.pan(dx, dy);
    },
    up: (id) => {
      const p = pointers.get(id);
      if (p === undefined) return;
      pointers.delete(id);
      if (pointers.size === 0 && !multi && !panning) handlers.tap(p.x, p.y);
    },
    cancel: () => {
      pointers.clear();
      panning = false;
      multi = false;
    },
  };
};
