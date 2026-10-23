import { expect } from "vitest";
import { clusterAt, clusterMask, type ClusterKind } from "../src/scene/decor-clusters.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

const KINDS: readonly ClusterKind[] = ["rocks", "grove"];

RA.push(["is deterministic for the same seed, tile and kind", () => {
  for (const k of KINDS) expect(clusterAt(7, 12, 34, k)).toBe(clusterAt(7, 12, 34, k));
}]);

RA.push(["stays in [0, 1] over a 64x64 map", () => {
  for (const k of KINDS)
    for (let x = 0; x < 64; x++)
      for (let y = 0; y < 64; y++) {
        const v = clusterAt(3, x, y, k);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
}]);

RA.push(["differs by seed and by kind", () => {
  const field = (seed: number, k: ClusterKind): string => Array.from({ length: 400 }, (_, i) => clusterAt(seed, i % 20, Math.floor(i / 20), k)).join(",");
  expect(field(1, "rocks")).not.toBe(field(2, "rocks"));
  expect(field(1, "rocks")).not.toBe(field(1, "grove"));
}]);

RA.push(["covers between 15% and 35% of a 64x64 map for a few seeds, for each kind", () => {
  for (const k of KINDS)
    for (const seed of [1, 2, 3, 4, 5]) {
      const mask = clusterMask(seed, 64, k);
      const share = mask.filter((v) => v > 0).length / mask.length;
      expect(share).toBeGreaterThanOrEqual(0.15);
      expect(share).toBeLessThanOrEqual(0.35);
    }
}]);

RA.push(["clusterMask matches clusterAt, scaled to 0..255, row-major", () => {
  const mask = clusterMask(5, 64, "grove");
  expect(mask.length).toBe(64 * 64);
  for (const [x, y] of [[0, 0], [17, 3], [63, 63]] as const) {
    expect(mask[y * 64 + x]).toBe(Math.round(clusterAt(5, x, y, "grove") * 255));
  }
}]);

test("decor clusters: determinism, range, seed and kind, coverage", () => rows(RA));
