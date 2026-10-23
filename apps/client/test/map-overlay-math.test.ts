import { expect, test } from "vitest";
import { tapTarget } from "../src/scene/tap-target.ts";
import { edgeArrow } from "../src/ui/base-arrow-math.ts";
import { rows, type Row } from "./rows.ts";

const RA: Row[] = [];
const at = (...tiles: [number, number][]) => (x: number, y: number) => tiles.some(([tx, ty]) => tx === x && ty === y);

RA.push(["tap: an occupied tile is always its own target", () => {
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, at([5, 5], [6, 6]))).toEqual({ x: 5, y: 5 });
}]);

RA.push(["tap: a finger on the roof behind a base picks the base in front", () => {
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.6, y: 5.7 }, at([6, 6]))).toEqual({ x: 6, y: 6 });
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.4, y: 5.8 }, at([6, 5]))).toEqual({ x: 6, y: 5 });
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.8, y: 5.4 }, at([5, 6]))).toEqual({ x: 5, y: 6 });
}]);

RA.push(["tap: a tall roof two tiles in front still owns the tap", () => {
  expect(tapTarget({ x: 5, y: 40 }, { x: 5.6, y: 40.6 }, at([7, 41]))).toEqual({ x: 7, y: 41 });
}]);

RA.push(["tap: the nearer (front) marker wins when two could", () => {
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, at([6, 6], [6, 5]))).toEqual({ x: 6, y: 6 });
}]);

RA.push(["tap: empty ground stays empty when no marker is close in front, or the marker is behind", () => {
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, at())).toEqual({ x: 5, y: 5 });
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, at([9, 9]))).toEqual({ x: 5, y: 5 });
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.95, y: 5.05 }, at([5, 7]))).toEqual({ x: 5, y: 5 });
  expect(tapTarget({ x: 5, y: 5 }, { x: 5.5, y: 5.5 }, at([4, 4]))).toEqual({ x: 5, y: 5 });
}]);

const band = { left: 0, top: 100, right: 400, bottom: 700 };

RA.push(["arrow: none when the target is inside the band", () => {
  expect(edgeArrow({ x: 200, y: 400 }, band, 30)).toBeNull();
  expect(edgeArrow({ x: 0, y: 100 }, band, 30)).toBeNull();
}]);

RA.push(["arrow: on the shrunk edge, pointing at the target", () => {
  const right = edgeArrow({ x: 900, y: 400 }, band, 30)!;
  expect(right.x).toBeCloseTo(370);
  expect(right.y).toBeCloseTo(400);
  expect(right.angle).toBeCloseTo(0);
  const up = edgeArrow({ x: 200, y: -500 }, band, 30)!;
  expect(up.y).toBeCloseTo(130);
  expect(up.angle).toBeCloseTo(-Math.PI / 2);
  const corner = edgeArrow({ x: -1000, y: 1600 }, band, 30)!;
  expect(corner.x).toBeGreaterThanOrEqual(30 - 1e-9);
  expect(corner.y).toBeLessThanOrEqual(670 + 1e-9);
}]);

RA.push(["arrow: pushed up out of the avoided corner (minimap side)", () => {
  const avoid = { left: 0, top: 600, right: 180, bottom: 700 };
  const a = edgeArrow({ x: -300, y: 1400 }, band, 30, avoid)!;
  expect(a.y).toBe(600);
  // The other side is untouched.
  const b = edgeArrow({ x: 900, y: 1400 }, band, 30, avoid)!;
  expect(b.y).toBeGreaterThan(600);
}]);

test("map overlay math: tap snapping onto tall sprites, edge arrow to the player's base", () => rows(RA));
