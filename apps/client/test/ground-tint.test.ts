import { describe, expect, it } from "vitest";
import { blendedGround } from "../src/scene/world/ground-tint.ts";

const PALETTE = [0xc99c60, 0x6a5846];
const ch = (c: number, s: number): number => (c >> s) & 0xff;
const maxStep = (a: number, b: number): number => Math.max(...[16, 8, 0].map((s) => Math.abs(ch(a, s) - ch(b, s))));

describe("blendedGround", () => {
  it("is deterministic", () => {
    const idAt = (x: number): number => (x < 5 ? 0 : 1);
    expect(blendedGround(idAt, 3, 4, PALETTE)).toBe(blendedGround(idAt, 3, 4, PALETTE));
  });

  it("stays within the drift range of the palette colour over uniform terrain", () => {
    for (let x = 0; x < 20; x++) {
      const c = blendedGround(() => 0, x, x * 2, PALETTE);
      expect(maxStep(c, PALETTE[0] ?? 0)).toBeLessThanOrEqual(Math.ceil(255 * 0.07));
    }
  });

  it("changes by small steps from tile to tile across a terrain border", () => {
    const idAt = (x: number): number => (x < 10 ? 0 : 1);
    for (let x = 6; x < 14; x++) {
      const step = maxStep(blendedGround(idAt, x, 0, PALETTE), blendedGround(idAt, x + 1, 0, PALETTE));
      // The border contrast is about 100 per channel; a hard tile edge would step by all of it.
      expect(step).toBeLessThan(60);
    }
  });

  it("treats off-map neighbours as the tile's own terrain", () => {
    const idAt = (x: number, y: number): number => (x < 0 || y < 0 ? -1 : 1);
    const c = blendedGround(idAt, 0, 0, PALETTE);
    expect(maxStep(c, PALETTE[1] ?? 0)).toBeLessThanOrEqual(Math.ceil(255 * 0.07));
  });
});
