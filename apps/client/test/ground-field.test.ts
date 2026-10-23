import { expect } from "vitest";
import { cellTransform, fieldPixels, greenPixels, isoFieldMatrix, type Affine } from "../src/scene/world/ground-field.ts";
import { tileToWorld, TILE_H } from "../src/scene/world-layout.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

/** Applies a canvas-order affine to a point. */
const apply = ([a, b, c, d, e, f]: Affine, u: number, v: number): { x: number; y: number } => ({ x: a * u + c * v + e, y: b * u + d * v + f });

const near = (p: { x: number; y: number }, q: { x: number; y: number }): void => {
  expect(p.x).toBeCloseTo(q.x, 9);
  expect(p.y).toBeCloseTo(q.y, 9);
};

RA.push(["puts each pixel centre on its tile centre", () => {
  const m = isoFieldMatrix();
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [5, 9], [31, 17], [63, 63]] as const) {
    const centre = tileToWorld(x, y);
    near(apply(m, x + 0.5, y + 0.5), { x: centre.x, y: centre.y + TILE_H / 2 });
  }
}]);

RA.push(["maps the map's corners to its top, right, bottom and left corners", () => {
  const size = 64;
  const m = isoFieldMatrix();
  near(apply(m, 0, 0), tileToWorld(0, 0));
  near(apply(m, size, 0), tileToWorld(size, 0));
  near(apply(m, size, size), tileToWorld(size, size));
  near(apply(m, 0, size), tileToWorld(0, size));
}]);

RA.push(["places cell texture pixels: world px at the scale, relative to the cell's corner", () => {
  const S = 0.5, ox = 768, oy = 384;
  const t = cellTransform(S, ox, oy);
  for (const [x, y] of [[3, 4], [20, 7]] as const) {
    const world = tileToWorld(x, y);
    const centre = { x: world.x, y: world.y + TILE_H / 2 };
    // The field pixel (x, y) is drawn at the scaled, cell-relative centre.
    near(apply(t, x + 0.5, y + 0.5), { x: S * (centre.x - ox), y: S * (centre.y - oy) });
  }
}]);

RA.push(["writes one opaque RGBA pixel per tile in row-major order", () => {
  const colours = new Uint32Array([0x112233, 0xaabbcc, 0x000000, 0xffffff]);
  const px = fieldPixels(colours, 2);
  expect(px.length).toBe(16);
  expect([...px.slice(0, 4)]).toEqual([0x11, 0x22, 0x33, 255]);
  expect([...px.slice(4, 8)]).toEqual([0xaa, 0xbb, 0xcc, 255]);
  expect([...px.slice(12, 16)]).toEqual([255, 255, 255, 255]);
}]);

RA.push(["gives the green wash no alpha on bare ground and full alpha on the greenest", () => {
  const fertility = new Float32Array([0, 0.5, 0.7, 1]);
  const px = greenPixels(fertility, 2);
  expect(px[3]).toBe(0);
  expect(px[7]).toBe(0);
  expect(px[11]).toBe(Math.round(Math.min(1, (0.7 - 0.55) * 2.5) * 255));
  expect(px[15]).toBe(255);
}]);

test("ground field: matrix on tile centres and corners, cell placement, pixel layout", () => rows(RA));
