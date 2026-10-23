import { expect } from "vitest";
import { GEO_OASIS_RING } from "@revolt/rules";
import { blendedGround, landTint, MAX_DRIFT } from "../src/scene/world/ground-tint.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

const PALETTE = [0xc99c60, 0x6a5846];
const ch = (c: number, s: number): number => (c >> s) & 0xff;
const maxStep = (a: number, b: number): number => Math.max(...[16, 8, 0].map((s) => Math.abs(ch(a, s) - ch(b, s))));

RA.push(["is deterministic", () => {
  const idAt = (x: number): number => (x < 5 ? 0 : 1);
  expect(blendedGround(idAt, 3, 4, PALETTE)).toBe(blendedGround(idAt, 3, 4, PALETTE));
}]);

RA.push(["stays within the drift range of the palette colour over uniform terrain", () => {
  for (let x = 0; x < 20; x++) {
    const c = blendedGround(() => 0, x, x * 2, PALETTE);
    expect(maxStep(c, PALETTE[0] ?? 0)).toBeLessThanOrEqual(Math.ceil(255 * (MAX_DRIFT + 0.01)));
  }
}]);

RA.push(["changes by small steps from tile to tile across a terrain border", () => {
  const idAt = (x: number): number => (x < 10 ? 0 : 1);
  for (let x = 6; x < 14; x++) {
    const step = maxStep(blendedGround(idAt, x, 0, PALETTE), blendedGround(idAt, x + 1, 0, PALETTE));
    // The border contrast is about 100 per channel; a hard tile edge would step by all of it.
    expect(step).toBeLessThan(60);
  }
}]);

RA.push(["treats off-map neighbours as the tile's own terrain", () => {
  const idAt = (x: number, y: number): number => (x < 0 || y < 0 ? -1 : 1);
  const c = blendedGround(idAt, 0, 0, PALETTE);
  expect(maxStep(c, PALETTE[1] ?? 0)).toBeLessThanOrEqual(Math.ceil(255 * (MAX_DRIFT + 0.01)));
}]);

RA.push(["land tint: greener where fertile, paler where bare, damp by an oasis, forests and mountains untouched", () => {
  const sand = 0xc99c60;
  const green = (c: number): number => ch(c, 8) - ch(c, 16);
  const tint = (fertility: number, flags = 0, t: "plain" | "forest" | "mountain" = "plain"): number => landTint(sand, t, { flags, fertility, rocks: 0, grove: 0 });
  expect(tint(0.5)).toBe(sand);
  expect(green(tint(0.95))).toBeGreaterThan(green(sand));
  const light = (c: number): number => ch(c, 16) + ch(c, 8) + ch(c, 0);
  expect(light(tint(0.05))).toBeGreaterThan(light(sand));
  expect(green(tint(0.5, GEO_OASIS_RING))).toBeGreaterThan(green(tint(0.95)));
  expect(tint(0.95, 0, "forest")).toBe(sand);
  expect(tint(0.05, GEO_OASIS_RING, "mountain")).toBe(sand);
}]);

test("ground tint: determinism, drift range, border steps, off-map neighbours, land tint", () => rows(RA));
