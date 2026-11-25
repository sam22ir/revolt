import { expect } from "vitest";
import { MINIMAP_H, MINIMAP_W, minimapToTile, tileToMinimap } from "../src/ui/minimap-math.ts";
import { tileCenter, viewCorners, screenToTile, type View } from "../src/scene/world-layout.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

RA.push(["the map's four corners land on the diamond's four points", () => {
  expect(tileToMinimap(64, 0, 0)).toEqual({ x: MINIMAP_W / 2, y: 0 });
  expect(tileToMinimap(64, 64, 0)).toEqual({ x: MINIMAP_W, y: MINIMAP_H / 2 });
  expect(tileToMinimap(64, 64, 64)).toEqual({ x: MINIMAP_W / 2, y: MINIMAP_H });
  expect(tileToMinimap(64, 0, 64)).toEqual({ x: 0, y: MINIMAP_H / 2 });
}]);

RA.push(["a tile survives the round trip through the minimap", () => {
  for (const [x, y] of [[0, 0], [10, 50], [63, 63], [32, 7], [5, 5]] as const) {
    const p = tileToMinimap(64, x + 0.5, y + 0.5);
    expect(minimapToTile(64, p.x, p.y)).toEqual({ x, y });
  }
}]);

RA.push(["points outside the diamond are not tiles", () => {
  expect(minimapToTile(64, 1, 1)).toBeNull();
  expect(minimapToTile(64, MINIMAP_W - 1, MINIMAP_H - 1)).toBeNull();
  expect(minimapToTile(64, MINIMAP_W / 2, -2)).toBeNull();
}]);

RA.push(["the picture is physical: moving right in x moves right on the minimap", () => {
  expect(tileToMinimap(64, 20, 10).x).toBeGreaterThan(tileToMinimap(64, 10, 10).x);
  expect(tileToMinimap(64, 10, 20).x).toBeLessThan(tileToMinimap(64, 10, 10).x);
}]);

const view: View = { cx: tileCenter(20, 30).x, cy: tileCenter(20, 30).y, zoom: 0.5, width: 400, height: 800, insetTop: 100, insetBottom: 150 };

RA.push(["are the free band's corners, in order, as tiles", () => {
  const [tl, tr, br, bl] = viewCorners(view);
  expect(tl && tr && br && bl).toBeTruthy();
  // Both sides of the band are mirrored around the camera's middle, so the corners' mean is the camera tile.
  const mean = { x: (tl!.x + tr!.x + br!.x + bl!.x) / 4, y: (tl!.y + tr!.y + br!.y + bl!.y) / 4 };
  expect(mean.x).toBeCloseTo(20.5, 5);
  expect(mean.y).toBeCloseTo(30.5, 5);
  expect(Math.floor(tl!.x)).toBe(screenToTile(view, 0, 100).x);
  expect(Math.floor(br!.y)).toBe(screenToTile(view, 400, 650).y);
}]);

RA.push(["zooming in shrinks the area", () => {
  const area = (v: View): number => {
    const c = viewCorners(v);
    return Math.abs((c[1]!.x - c[0]!.x) * (c[3]!.y - c[0]!.y) - (c[3]!.x - c[0]!.x) * (c[1]!.y - c[0]!.y));
  };
  expect(area({ ...view, zoom: 1 })).toBeLessThan(area(view));
}]);


RA.push(["the minimap ends where the map ends, on both far sides", () => {
  expect(minimapToTile(64, 84, 43.75)).toBeNull();
  expect(minimapToTile(64, 28, 43.75)).toBeNull();
  expect(minimapToTile(64, 84, 37)).not.toBeNull();
}]);

test("minimap math: corners, round trip, view corners", () => rows(RA));
