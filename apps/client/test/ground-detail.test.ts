import { expect } from "vitest";
import { DETAIL_MARGIN, detailAlpha, detailPlacement } from "../src/scene/world/ground-detail.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

RA.push(["covers the visible world rectangle with a margin on every side", () => {
  const world = { x: 120, y: -40, w: 800, h: 1200 };
  const p = detailPlacement(world);
  expect(p.x).toBe(world.x - DETAIL_MARGIN);
  expect(p.y).toBe(world.y - DETAIL_MARGIN);
  expect(p.w).toBe(world.w + 2 * DETAIL_MARGIN);
  expect(p.h).toBe(world.h + 2 * DETAIL_MARGIN);
  expect(p.x).toBeLessThan(world.x);
  expect(p.x + p.w).toBeGreaterThan(world.x + world.w);
}]);

RA.push(["sets the texture offset to the sprite's corner, so the marks stay on the ground", () => {
  for (const world of [
    { x: 0, y: 0, w: 400, h: 800 },
    { x: -1234.5, y: 987.25, w: 300, h: 500 },
  ]) {
    const p = detailPlacement(world);
    expect(p.tileX).toBe(p.x);
    expect(p.tileY).toBe(p.y);
    // The texture repeats every 512 px, so a world point stays on the same texel however far the view moves.
    const texel = (wx: number, off: number): number => (((wx - off) % 512) + 512) % 512;
    expect(texel(world.x + 10, p.tileX)).toBeCloseTo(texel(world.x + 10 + 512, p.tileX), 9);
  }
}]);

RA.push(["moves the texture offset with the view, one for one, so the pan does not drag the marks", () => {
  const a = detailPlacement({ x: 100, y: 100, w: 400, h: 400 });
  const b = detailPlacement({ x: 130, y: 90, w: 400, h: 400 });
  expect(b.tileX - a.tileX).toBe(30);
  expect(b.tileY - a.tileY).toBe(-10);
}]);

RA.push(["is gone at far zoom, full at close zoom, and smooth between", () => {
  expect(detailAlpha(0.2)).toBe(0);
  expect(detailAlpha(0.35)).toBe(0);
  expect(detailAlpha(0.6)).toBe(1);
  expect(detailAlpha(1.5)).toBe(1);
  const mid = detailAlpha(0.475);
  expect(mid).toBeCloseTo(0.5, 9);
  let last = -1;
  for (let z = 0.35; z <= 0.6; z += 0.01) {
    const a = detailAlpha(z);
    expect(a).toBeGreaterThanOrEqual(last);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    last = a;
  }
}]);

test("ground detail: placement covers the view, offsets follow the view, alpha fades with zoom", () => rows(RA));
