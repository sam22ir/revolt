import { expect, test } from "vitest";
import { MAX_PIXEL_RATIO, pixelRatioFor } from "../src/scene/pixel-ratio.ts";
import { rows, type Row } from "./rows.ts";

const RA: Row[] = [];

RA.push(["the cap is 2, so a 3x phone renders at 2x", () => {
  expect(MAX_PIXEL_RATIO).toBe(2);
  expect(pixelRatioFor(3)).toBe(2);
  expect(pixelRatioFor(4)).toBe(2);
}]);

RA.push(["ratios up to the cap are kept as they are", () => {
  expect(pixelRatioFor(1)).toBe(1);
  expect(pixelRatioFor(1.5)).toBe(1.5);
  expect(pixelRatioFor(2)).toBe(2);
}]);

RA.push(["a missing, zero or fractional-below-1 ratio renders at 1", () => {
  expect(pixelRatioFor(undefined)).toBe(1);
  expect(pixelRatioFor(0)).toBe(1);
  expect(pixelRatioFor(0.75)).toBe(1);
}]);

test("pixel ratio: capped at 2 and never below 1", () => rows(RA));
