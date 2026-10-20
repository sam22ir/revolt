import { describe, expect, it } from "vitest";
import { hash01, propsFor } from "../src/scene/terrain-props.ts";

describe("terrain props", () => {
  it("hashes the same tile to the same number, always in [0, 1)", () => {
    expect(hash01(12, 34, 5)).toBe(hash01(12, 34, 5));
    for (let i = 0; i < 500; i++) {
      const v = hash01(i, i * 7, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gives the same props for the same tile and different ones for others", () => {
    expect(propsFor("forest", 4, 9, 1)).toEqual(propsFor("forest", 4, 9, 1));
    const a = JSON.stringify(propsFor("forest", 4, 9, 1));
    const some = Array.from({ length: 30 }, (_, i) => JSON.stringify(propsFor("forest", i, 9, 1)));
    expect(some.some((s) => s !== a)).toBe(true);
  });

  it("thickens a forest toward its middle", () => {
    const count = (interior: number): number => {
      let n = 0;
      for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) n += propsFor("forest", x, y, interior).filter((p) => p.kind === "trees").length;
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0.5));
    expect(count(0.5)).toBeGreaterThan(count(0));
  });

  it("raises peaks in the middle of mountains and keeps trees to forests", () => {
    const tiles = Array.from({ length: 400 }, (_, i) => [i % 20, Math.floor(i / 20)] as const);
    expect(tiles.every(([x, y]) => propsFor("mountain", x, y, 1).some((p) => p.kind === "peaks"))).toBe(true);
    for (const t of ["plain", "hills", "mountain"] as const) {
      expect(tiles.every(([x, y]) => propsFor(t, x, y, 1).every((p) => p.kind !== "trees"))).toBe(true);
    }
  });

  it("keeps offsets inside a tile and scales positive", () => {
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        for (const t of ["plain", "hills", "forest", "mountain"] as const) {
          for (const p of propsFor(t, x, y, 0.7)) {
            expect(Math.abs(p.dx)).toBeLessThanOrEqual(0.4);
            expect(Math.abs(p.dy)).toBeLessThanOrEqual(0.4);
            expect(p.scale).toBeGreaterThan(0);
            expect(p.pick).toBeGreaterThanOrEqual(0);
            expect(p.pick).toBeLessThan(1);
          }
        }
      }
    }
  });
});
