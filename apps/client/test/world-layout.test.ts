import { expect } from "vitest";
import { createGesture, type GestureHandlers } from "../src/scene/gesture.ts";
import {
  canvasCentre,
  centerTile,
  clampCenter,
  clampZoom,
  isOutsideFreeBand,
  isTileOnMap,
  marchPosition,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToTile,
  screenToWorld,
  tileCenter,
  tileToScreen,
  tileToWorld,
  viewCentreY,
  visibleTileRange,
  withInsets,
  worldToScreen,
  worldToTile,
  zoomAt,
  TILE_H,
  TILE_W,
  type View,
} from "../src/scene/world-layout.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];
const RB: Row[] = [];
const RC: Row[] = [];

const view = (over: Partial<View> = {}): View => ({ cx: 0, cy: 0, zoom: 1, width: 400, height: 800, ...over });

RA.push(["tileToWorld and worldToTile are inverses", () => {
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
}]);

RA.push(["the iso axes: +x goes down-right, +y goes down-left", () => {
  expect(tileToWorld(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
  expect(tileToWorld(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
}]);

RA.push(["the middle of the screen shows the view's world point", () => {
  const c = tileCenter(10, 20);
  const v = view({ cx: c.x, cy: c.y, zoom: 0.5 });
  expect(tileToScreen(v, 10, 20)).toEqual({ x: 200, y: 400 });
  expect(screenToTile(v, 200, 400)).toEqual({ x: 10, y: 20 });
}]);

RA.push(["screenToTile finds the tile under a point, including its edges and off-map tiles", () => {
  const v = view({ cx: tileCenter(5, 5).x, cy: tileCenter(5, 5).y, zoom: 1 });
  // A point just inside each corner of the diamond of tile (5, 5).
  const centre = tileToScreen(v, 5, 5);
  expect(screenToTile(v, centre.x + TILE_W / 2 - 3, centre.y)).toEqual({ x: 5, y: 5 });
  expect(screenToTile(v, centre.x, centre.y - TILE_H / 2 + 2)).toEqual({ x: 5, y: 5 });
  // The tile one step along +x is down-right of it.
  const next = tileToScreen(v, 6, 5);
  expect(screenToTile(v, next.x, next.y)).toEqual({ x: 6, y: 5 });
  expect(screenToTile(view({ cx: 0, cy: -5000 }), 200, 400).y).toBeLessThan(0);
}]);

RA.push(["screen → tile → screen round-trips at any zoom", () => {
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
}]);

RA.push(["a zoomed-in view sees a few tiles, not the map", () => {
  const c = tileCenter(32, 32);
  const r = visibleTileRange(view({ cx: c.x, cy: c.y, zoom: 1 }), 64);
  expect(r.x0).toBeGreaterThan(20);
  expect(r.x1).toBeLessThan(45);
  expect(r.y0).toBeGreaterThan(20);
  expect(r.y1).toBeLessThan(45);
  // The tile in the middle of the screen is inside.
  expect(r.x0 <= 32 && 32 <= r.x1 && r.y0 <= 32 && 32 <= r.y1).toBe(true);
}]);

RA.push(["a zoomed-out view is clipped to the map", () => {
  const c = tileCenter(32, 32);
  expect(visibleTileRange(view({ cx: c.x, cy: c.y, zoom: MIN_ZOOM, width: 4000, height: 8000 }), 64)).toEqual({ x0: 0, x1: 63, y0: 0, y1: 63 });
}]);

RA.push(["every tile whose middle is on screen is inside the range", () => {
  const v = view({ cx: tileCenter(20, 30).x, cy: tileCenter(20, 30).y, zoom: 0.7 });
  const r = visibleTileRange(v, 64, 0);
  for (let x = 0; x < 64; x++) {
    for (let y = 0; y < 64; y++) {
      const s = tileToScreen(v, x, y);
      if (s.x < 0 || s.y < 0 || s.x > v.width || s.y > v.height) continue;
      expect(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1, `${x},${y}`).toBe(true);
    }
  }
}]);

RA.push(["a view off the map has an empty range", () => {
  const far = tileToWorld(500, 500);
  const r = visibleTileRange(view({ cx: far.x, cy: far.y }), 64);
  expect(r.x0 > r.x1 || r.y0 > r.y1).toBe(true);
}]);

RB.push(["panning moves the world the opposite way and is zoom-aware", () => {
  expect(panBy(view({ zoom: 2 }), 20, -10)).toMatchObject({ cx: -10, cy: 5 });
}]);

RB.push(["zoom is clamped", () => {
  expect(clampZoom(0.001)).toBe(MIN_ZOOM);
  expect(clampZoom(99)).toBe(MAX_ZOOM);
  expect(zoomAt(view({ zoom: MAX_ZOOM }), 2, 0, 0).zoom).toBe(MAX_ZOOM);
  expect(zoomAt(view({ zoom: MIN_ZOOM }), 0.5, 0, 0).zoom).toBe(MIN_ZOOM);
}]);

RB.push(["zooming keeps the point under the finger still", () => {
  const v = view({ cx: 300, cy: 200, zoom: 0.6 });
  for (const factor of [0.5, 1.7, 3]) {
    const next = zoomAt(v, factor, 90, 610);
    const before = screenToTile(v, 90, 610);
    const after = screenToTile(next, 90, 610);
    expect(after).toEqual(before);
  }
}]);

RB.push(["clampCenter pulls the middle back onto the map", () => {
  const off = tileToWorld(-30, 90);
  const v = clampCenter(view({ cx: off.x, cy: off.y }), 64);
  const t = worldToTile(v.cx, v.cy);
  expect(t.x).toBeCloseTo(0, 9);
  expect(t.y).toBeCloseTo(64, 9);
  const inside = view({ cx: tileCenter(10, 10).x, cy: tileCenter(10, 10).y });
  expect(clampCenter(inside, 64)).toBe(inside);
}]);

RB.push(["centerTile is the tile in the middle, clipped", () => {
  const c = tileCenter(12, 30);
  expect(centerTile(view({ cx: c.x, cy: c.y }), 64)).toEqual({ x: 12, y: 30 });
  const off = tileToWorld(-5, 99);
  expect(centerTile(view({ cx: off.x, cy: off.y }), 64)).toEqual({ x: 0, y: 63 });
}]);

// A 400 x 800 screen with 100 px of header on top and 200 px of nav or sheet below: the band is y 100..600, middle 350.
const banded = (over: Partial<View> = {}): View => view({ insetTop: 100, insetBottom: 200, ...over });

RB.push(["the centre tile projects to the middle of the band, not of the screen", () => {
  const c = tileCenter(5, 5);
  const v = banded({ cx: c.x, cy: c.y });
  expect(tileToScreen(v, 5, 5)).toEqual({ x: 200, y: 350 });
  expect(screenToTile(v, 200, 350)).toEqual({ x: 5, y: 5 });
}]);

RB.push(["with no insets the view is unchanged", () => {
  const plain = view({ cx: 30, cy: -12, zoom: 1.3 });
  const zero = { ...plain, insetTop: 0, insetBottom: 0 };
  expect(tileToScreen(zero, 4, 9)).toEqual(tileToScreen(plain, 4, 9));
  expect(canvasCentre(zero)).toEqual({ x: plain.cx, y: plain.cy });
}]);

RB.push(["screen → tile → screen round-trips with insets and zoom", () => {
  for (const zoom of [0.3, 1, 1.6]) {
    const v = banded({ cx: 500, cy: 900, zoom });
    for (const [tx, ty] of [
      [10, 3],
      [0, 0],
      [40, 41],
    ] as const) {
      const p = tileToScreen(v, tx, ty);
      expect(screenToTile(v, p.x, p.y)).toEqual({ x: tx, y: ty });
      const w = screenToWorld(v, p.x, p.y);
      const back = worldToScreen(v, w);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  }
}]);

RB.push(["changing the insets keeps the picture still on the screen", () => {
  // A sheet opens under the map: the band shrinks from the bottom, and the tiles must not jump.
  const before = banded({ cx: 640, cy: 300, zoom: 0.9 });
  const after = withInsets(before, 100, 480);
  expect(after.insetBottom).toBe(480);
  expect(tileToScreen(after, 6, 2)).toEqual(tileToScreen(before, 6, 2));
  expect(canvasCentre(after).x).toBeCloseTo(canvasCentre(before).x, 9);
  expect(canvasCentre(after).y).toBeCloseTo(canvasCentre(before).y, 9);
  // The band's middle moved, so the centre tile is now the one at the new middle.
  expect(viewCentreY(after)).toBeCloseTo(100 + (800 - 580) / 2, 9);
}]);

RB.push(["the visible range still covers the whole band", () => {
  const v = banded({ cx: 1000, cy: 1000, zoom: 1 });
  const range = visibleTileRange(v, 200);
  // The band runs from y 100 to y 600 on this 800 px screen.
  for (const y of [100, 350, 600]) {
    for (const x of [0, v.width / 2, v.width]) {
      const t = screenToTile(v, x, y);
      expect(t.x).toBeGreaterThanOrEqual(range.x0);
      expect(t.x).toBeLessThanOrEqual(range.x1);
      expect(t.y).toBeGreaterThanOrEqual(range.y0);
      expect(t.y).toBeLessThanOrEqual(range.y1);
    }
  }
}]);

RB.push(["zooming keeps the world point under the pointer fixed inside the band", () => {
  const v = banded({ cx: 700, cy: 400, zoom: 0.8 });
  const at = { x: 120, y: 480 };
  const before = screenToWorld(v, at.x, at.y);
  const after = zoomAt(v, 1.7, at.x, at.y);
  const now = screenToWorld(after, at.x, at.y);
  expect(now.x).toBeCloseTo(before.x, 6);
  expect(now.y).toBeCloseTo(before.y, 6);
}]);

RB.push(["the Phaser camera centre reproduces the view's projection", () => {
  // Phaser puts the camera's centre on the canvas middle, so the view's world point must be shifted there.
  const v = banded({ cx: 320, cy: -150, zoom: 1.1 });
  const c = canvasCentre(v);
  for (const [tx, ty] of [
    [3, 7],
    [20, 12],
  ] as const) {
    const w = tileCenter(tx, ty);
    const phaser = { x: (w.x - c.x) * v.zoom + v.width / 2, y: (w.y - c.y) * v.zoom + v.height / 2 };
    const ours = tileToScreen(v, tx, ty);
    expect(phaser.x).toBeCloseTo(ours.x, 6);
    expect(phaser.y).toBeCloseTo(ours.y, 6);
  }
}]);

RB.push(["a tile is outside the free band when it is under the nav or above the header, or off the screen sideways", () => {
  // Tile (10, 10)'s middle is placed exactly at y 110 (under the header's margin), then at y 590 (under the nav bar).
  const c = tileCenter(10, 10);
  const high = banded({ cx: c.x, cy: c.y + 240 });
  expect(tileToScreen(high, 10, 10).y).toBeCloseTo(110, 6);
  expect(isOutsideFreeBand(high, 10, 10)).toBe(true);
  const low = banded({ cx: c.x, cy: c.y - 240 });
  expect(tileToScreen(low, 10, 10).y).toBeCloseTo(590, 6);
  expect(isOutsideFreeBand(low, 10, 10)).toBe(true);
  // The tile at the band's middle is inside.
  const mid = banded({ cx: c.x, cy: c.y });
  expect(tileToScreen(mid, 10, 10).y).toBeCloseTo(viewCentreY(mid), 6);
  expect(isOutsideFreeBand(mid, 10, 10)).toBe(false);
}]);

const m = { from: { x: 0, y: 0 }, to: { x: 10, y: 20 }, departAt: 1000, arriveAt: 2000, returnAt: 3000 };

RC.push(["goes out, comes back, then is gone", () => {
  expect(marchPosition(m, 1000)).toEqual({ leg: "outbound", at: { x: 0, y: 0 } });
  expect(marchPosition(m, 1500)).toEqual({ leg: "outbound", at: { x: 5, y: 10 } });
  expect(marchPosition(m, 2000)).toEqual({ leg: "returning", at: { x: 10, y: 20 } });
  expect(marchPosition(m, 2500)).toEqual({ leg: "returning", at: { x: 5, y: 10 } });
  expect(marchPosition(m, 3000).leg).toBe("done");
  expect(marchPosition(m, 9999).leg).toBe("done");
}]);

RC.push(["a clock slightly behind departure stays at the start", () => {
  expect(marchPosition(m, 500)).toEqual({ leg: "outbound", at: { x: 0, y: 0 } });
}]);

RC.push(["a zero-length leg does not divide by zero", () => {
  const z = { ...m, arriveAt: 1000, returnAt: 1000 };
  expect(marchPosition(z, 1000).leg).toBe("done");
  const out = { ...m, departAt: 2000 };
  expect(marchPosition(out, 1999)).toEqual({ leg: "outbound", at: { x: 10, y: 20 } });
}]);

const record = () => {
  const events: string[] = [];
  const handlers: GestureHandlers = {
    pan: (dx, dy) => events.push(`pan ${dx},${dy}`),
    zoom: (f, x, y) => events.push(`zoom ${f.toFixed(2)} @${x},${y}`),
    tap: (x, y) => events.push(`tap ${x},${y}`),
  };
  return { events, g: createGesture(handlers, 8) };
};

RC.push(["a still touch is a tap", () => {
  const { g, events } = record();
  g.down(1, 50, 60);
  g.move(1, 53, 62);
  g.up(1);
  expect(events).toEqual(["tap 53,62"]);
}]);

RC.push(["movement past the slop pans, catching up on what was held back, and is not a tap", () => {
  const { g, events } = record();
  g.down(1, 100, 100);
  g.move(1, 104, 100);
  expect(events).toEqual([]);
  g.move(1, 112, 100);
  g.move(1, 120, 105);
  g.up(1);
  expect(events).toEqual(["pan 12,0", "pan 8,5"]);
}]);

RC.push(["two fingers pinch and pan, and never tap, even when one stays", () => {
  const { g, events } = record();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  g.move(2, 300, 100);
  expect(events).toEqual(["pan 50,0", "zoom 2.00 @200,100"]);
  g.up(2);
  g.up(1);
  expect(events.some((e) => e.startsWith("tap"))).toBe(false);
}]);

RC.push(["after a pinch the remaining finger keeps panning", () => {
  const { g, events } = record();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  g.up(2);
  events.length = 0;
  g.move(1, 103, 100);
  expect(events).toEqual(["pan 3,0"]);
}]);

RC.push(["a new touch after the gesture ended can tap again", () => {
  const { g, events } = record();
  g.down(1, 0, 0);
  g.down(2, 10, 0);
  g.up(1);
  g.up(2);
  g.down(3, 70, 70);
  g.up(3);
  expect(events).toEqual(["tap 70,70"]);
}]);

RC.push(["cancel drops a touch in progress", () => {
  const { g, events } = record();
  g.down(1, 5, 5);
  g.cancel();
  g.up(1);
  g.move(1, 50, 50);
  expect(events).toEqual([]);
}]);

RC.push(["moves from unknown pointers are ignored", () => {
  const { g, events } = record();
  g.move(9, 1, 1);
  g.up(9);
  expect(events).toEqual([]);
}]);


RA.push(["a tile is on the map only inside both bounds", () => {
  expect(isTileOnMap(64, 0, 0)).toBe(true);
  expect(isTileOnMap(64, 63, 63)).toBe(true);
  for (const [x, y] of [[64, 0], [0, 64], [-1, 0], [0, -1], [64, 64]] as const) expect(isTileOnMap(64, x, y), `${x},${y}`).toBe(false);
}]);

test("layout math: tile/world/screen conversion and culling", () => rows(RA));
test("layout math: pan, zoom, clamp and the free band", () => rows(RB));
test("march positions and touch gestures", () => rows(RC));
