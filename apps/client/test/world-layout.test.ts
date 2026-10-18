import { describe, expect, test } from "vitest";
import { createGesture, type GestureHandlers } from "../src/scene/gesture.ts";
import {
  centerTile,
  clampCenter,
  clampZoom,
  marchPosition,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToTile,
  tileCenter,
  tileToScreen,
  tileToWorld,
  visibleTileRange,
  worldToTile,
  zoomAt,
  TILE_H,
  TILE_W,
  type View,
} from "../src/scene/world-layout.ts";

const view = (over: Partial<View> = {}): View => ({ cx: 0, cy: 0, zoom: 1, width: 400, height: 800, ...over });

describe("tile ↔ world ↔ screen", () => {
  test("tileToWorld and worldToTile are inverses", () => {
    for (const [x, y] of [
      [0, 0],
      [5, 3],
      [63, 0],
      [12.5, 40.25],
    ] as const) {
      const w = tileToWorld(x, y);
      const t = worldToTile(w.x, w.y);
      expect(t.x).toBeCloseTo(x, 9);
      expect(t.y).toBeCloseTo(y, 9);
    }
  });

  test("the iso axes: +x goes down-right, +y goes down-left", () => {
    expect(tileToWorld(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(tileToWorld(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  test("the middle of the screen shows the view's world point", () => {
    const c = tileCenter(10, 20);
    const v = view({ cx: c.x, cy: c.y, zoom: 0.5 });
    expect(tileToScreen(v, 10, 20)).toEqual({ x: 200, y: 400 });
    expect(screenToTile(v, 200, 400)).toEqual({ x: 10, y: 20 });
  });

  test("screenToTile finds the tile under a point, including its edges and off-map tiles", () => {
    const v = view({ cx: tileCenter(5, 5).x, cy: tileCenter(5, 5).y, zoom: 1 });
    // A point just inside each corner of the diamond of tile (5, 5).
    const centre = tileToScreen(v, 5, 5);
    expect(screenToTile(v, centre.x + TILE_W / 2 - 3, centre.y)).toEqual({ x: 5, y: 5 });
    expect(screenToTile(v, centre.x, centre.y - TILE_H / 2 + 2)).toEqual({ x: 5, y: 5 });
    // The tile one step along +x is down-right of it.
    const next = tileToScreen(v, 6, 5);
    expect(screenToTile(v, next.x, next.y)).toEqual({ x: 6, y: 5 });
    expect(screenToTile(view({ cx: 0, cy: -5000 }), 200, 400).y).toBeLessThan(0);
  });

  test("screen → tile → screen round-trips at any zoom", () => {
    for (const zoom of [MIN_ZOOM, 0.5, 1, MAX_ZOOM]) {
      const v = view({ cx: 123, cy: 456, zoom });
      for (const [x, y] of [
        [0, 0],
        [33, 7],
        [63, 63],
      ] as const) {
        const s = tileToScreen(v, x, y);
        expect(screenToTile(v, s.x, s.y)).toEqual({ x, y });
      }
    }
  });
});

describe("culling", () => {
  test("a zoomed-in view sees a few tiles, not the map", () => {
    const c = tileCenter(32, 32);
    const r = visibleTileRange(view({ cx: c.x, cy: c.y, zoom: 1 }), 64);
    expect(r.x0).toBeGreaterThan(20);
    expect(r.x1).toBeLessThan(45);
    expect(r.y0).toBeGreaterThan(20);
    expect(r.y1).toBeLessThan(45);
    // The tile in the middle of the screen is inside.
    expect(r.x0 <= 32 && 32 <= r.x1 && r.y0 <= 32 && 32 <= r.y1).toBe(true);
  });

  test("a zoomed-out view is clipped to the map", () => {
    const c = tileCenter(32, 32);
    expect(visibleTileRange(view({ cx: c.x, cy: c.y, zoom: MIN_ZOOM, width: 4000, height: 8000 }), 64)).toEqual({ x0: 0, x1: 63, y0: 0, y1: 63 });
  });

  test("every tile whose middle is on screen is inside the range", () => {
    const v = view({ cx: tileCenter(20, 30).x, cy: tileCenter(20, 30).y, zoom: 0.7 });
    const r = visibleTileRange(v, 64, 0);
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        const s = tileToScreen(v, x, y);
        if (s.x < 0 || s.y < 0 || s.x > v.width || s.y > v.height) continue;
        expect(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1, `${x},${y}`).toBe(true);
      }
    }
  });

  test("a view off the map has an empty range", () => {
    const far = tileToWorld(500, 500);
    const r = visibleTileRange(view({ cx: far.x, cy: far.y }), 64);
    expect(r.x0 > r.x1 || r.y0 > r.y1).toBe(true);
  });
});

describe("pan and zoom", () => {
  test("panning moves the world the opposite way and is zoom-aware", () => {
    expect(panBy(view({ zoom: 2 }), 20, -10)).toMatchObject({ cx: -10, cy: 5 });
  });

  test("zoom is clamped", () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(zoomAt(view({ zoom: MAX_ZOOM }), 2, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view({ zoom: MIN_ZOOM }), 0.5, 0, 0).zoom).toBe(MIN_ZOOM);
  });

  test("zooming keeps the point under the finger still", () => {
    const v = view({ cx: 300, cy: 200, zoom: 0.6 });
    for (const factor of [0.5, 1.7, 3]) {
      const next = zoomAt(v, factor, 90, 610);
      const before = screenToTile(v, 90, 610);
      const after = screenToTile(next, 90, 610);
      expect(after).toEqual(before);
    }
  });

  test("clampCenter pulls the middle back onto the map", () => {
    const off = tileToWorld(-30, 90);
    const v = clampCenter(view({ cx: off.x, cy: off.y }), 64);
    const t = worldToTile(v.cx, v.cy);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.y).toBeCloseTo(64, 9);
    const inside = view({ cx: tileCenter(10, 10).x, cy: tileCenter(10, 10).y });
    expect(clampCenter(inside, 64)).toBe(inside);
  });

  test("centerTile is the tile in the middle, clipped", () => {
    const c = tileCenter(12, 30);
    expect(centerTile(view({ cx: c.x, cy: c.y }), 64)).toEqual({ x: 12, y: 30 });
    const off = tileToWorld(-5, 99);
    expect(centerTile(view({ cx: off.x, cy: off.y }), 64)).toEqual({ x: 0, y: 63 });
  });
});

describe("march position", () => {
  const m = { from: { x: 0, y: 0 }, to: { x: 10, y: 20 }, departAt: 1000, arriveAt: 2000, returnAt: 3000 };

  test("goes out, comes back, then is gone", () => {
    expect(marchPosition(m, 1000)).toEqual({ leg: "outbound", at: { x: 0, y: 0 } });
    expect(marchPosition(m, 1500)).toEqual({ leg: "outbound", at: { x: 5, y: 10 } });
    expect(marchPosition(m, 2000)).toEqual({ leg: "returning", at: { x: 10, y: 20 } });
    expect(marchPosition(m, 2500)).toEqual({ leg: "returning", at: { x: 5, y: 10 } });
    expect(marchPosition(m, 3000).leg).toBe("done");
    expect(marchPosition(m, 9999).leg).toBe("done");
  });

  test("a clock slightly behind departure stays at the start", () => {
    expect(marchPosition(m, 500)).toEqual({ leg: "outbound", at: { x: 0, y: 0 } });
  });

  test("a zero-length leg does not divide by zero", () => {
    const z = { ...m, arriveAt: 1000, returnAt: 1000 };
    expect(marchPosition(z, 1000).leg).toBe("done");
    const out = { ...m, departAt: 2000 };
    expect(marchPosition(out, 1999)).toEqual({ leg: "outbound", at: { x: 10, y: 20 } });
  });
});

describe("gesture", () => {
  const record = () => {
    const events: string[] = [];
    const handlers: GestureHandlers = {
      pan: (dx, dy) => events.push(`pan ${dx},${dy}`),
      zoom: (f, x, y) => events.push(`zoom ${f.toFixed(2)} @${x},${y}`),
      tap: (x, y) => events.push(`tap ${x},${y}`),
    };
    return { events, g: createGesture(handlers, 8) };
  };

  test("a still touch is a tap", () => {
    const { g, events } = record();
    g.down(1, 50, 60);
    g.move(1, 53, 62);
    g.up(1);
    expect(events).toEqual(["tap 53,62"]);
  });

  test("movement past the slop pans, catching up on what was held back, and is not a tap", () => {
    const { g, events } = record();
    g.down(1, 100, 100);
    g.move(1, 104, 100);
    expect(events).toEqual([]);
    g.move(1, 112, 100);
    g.move(1, 120, 105);
    g.up(1);
    expect(events).toEqual(["pan 12,0", "pan 8,5"]);
  });

  test("two fingers pinch and pan, and never tap, even when one stays", () => {
    const { g, events } = record();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(2, 300, 100);
    expect(events).toEqual(["pan 50,0", "zoom 2.00 @200,100"]);
    g.up(2);
    g.up(1);
    expect(events.some((e) => e.startsWith("tap"))).toBe(false);
  });

  test("after a pinch the remaining finger keeps panning", () => {
    const { g, events } = record();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.up(2);
    events.length = 0;
    g.move(1, 103, 100);
    expect(events).toEqual(["pan 3,0"]);
  });

  test("a new touch after the gesture ended can tap again", () => {
    const { g, events } = record();
    g.down(1, 0, 0);
    g.down(2, 10, 0);
    g.up(1);
    g.up(2);
    g.down(3, 70, 70);
    g.up(3);
    expect(events).toEqual(["tap 70,70"]);
  });

  test("cancel drops a touch in progress", () => {
    const { g, events } = record();
    g.down(1, 5, 5);
    g.cancel();
    g.up(1);
    g.move(1, 50, 50);
    expect(events).toEqual([]);
  });

  test("moves from unknown pointers are ignored", () => {
    const { g, events } = record();
    g.move(9, 1, 1);
    g.up(9);
    expect(events).toEqual([]);
  });
});
