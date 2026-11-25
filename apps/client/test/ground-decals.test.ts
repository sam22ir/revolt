import { expect } from "vitest";
import { GEO_OASIS, GEO_ROAD, GEO_WADI, TERRAIN_IDS, fertilityAt, geographyOf, terrainAt } from "@revolt/rules";
import { DECAL_KIND_FRAMES, decalsFor, type Decal, type DecalKind } from "../src/scene/world/ground-decals.ts";
import { clusterMask } from "../src/scene/decor-clusters.ts";
import { tileableNoise } from "../src/scene/world/ground-grain.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

const SIZE = 64;
const SEEDS = [1, 2, 3, 4, 5];
/** The inputs decalsFor takes, for a real map of one seed. */
const inputsOf = (seed: number) => {
  const terrain = new Uint8Array(SIZE * SIZE);
  const fertility = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    terrain[i] = TERRAIN_IDS.indexOf(terrainAt(seed, x, y));
    fertility[i] = fertilityAt(seed, x, y);
  }
  const flags = Uint8Array.from(geographyOf(seed, SIZE).flags);
  return { terrain, fertility, flags, rocks: clusterMask(seed, SIZE, "rocks"), grove: clusterMask(seed, SIZE, "grove") };
};
const decalsOf = (seed: number): Decal[] => {
  const d = inputsOf(seed);
  return decalsFor(seed, SIZE, d.terrain, d.fertility, d.flags, d.rocks, d.grove);
};
/** The kind a decal's frame belongs to. */
const kindOf = (frame: number): DecalKind | undefined => (Object.keys(DECAL_KIND_FRAMES) as DecalKind[]).find((k) => DECAL_KIND_FRAMES[k].includes(frame));

RA.push(["every decal kind has at least one frame in the atlas manifest", () => {
  for (const k of Object.keys(DECAL_KIND_FRAMES) as DecalKind[]) expect(DECAL_KIND_FRAMES[k].length).toBeGreaterThan(0);
}]);

RA.push(["is deterministic for a seed and differs between seeds", () => {
  expect(JSON.stringify(decalsOf(3))).toBe(JSON.stringify(decalsOf(3)));
  expect(JSON.stringify(decalsOf(3))).not.toBe(JSON.stringify(decalsOf(4)));
}]);

// Measured 1d: 0.17 to 0.20 of tiles on these seeds (about one per five tiles, roughly twice 1c). The bounds leave room for tuning.
RA.push(["places about one decal per four to eight tiles, more inside clusters", () => {
  for (const seed of SEEDS) {
    const share = decalsOf(seed).length / (SIZE * SIZE);
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.28);
  }
}]);

RA.push(["gives open ground about twice the 1c density: more decals inside a grove cluster than outside", () => {
  const n = SIZE * SIZE;
  const plain = new Uint8Array(n).fill(TERRAIN_IDS.indexOf("plain"));
  const flags = new Uint8Array(n);
  const fert = new Float32Array(n).fill(0.3);
  const none = new Uint8Array(n), full = new Uint8Array(n).fill(255);
  const count = (g: Uint8Array): number => decalsFor(9, SIZE, plain, fert, flags, none, g).length;
  expect(count(full)).toBeGreaterThan(count(none) * 2);
  expect(count(none) / n).toBeGreaterThan(0.12);
}]);

RA.push(["keeps decals off roads, oasis pools and riverbeds", () => {
  const d = inputsOf(1);
  // Mark every tile as a road, then as a pool, then as a riverbed: each time nothing may be placed.
  for (const bit of [GEO_ROAD, GEO_OASIS, GEO_WADI]) {
    const flags = new Uint8Array(SIZE * SIZE).fill(bit);
    expect(decalsFor(1, SIZE, d.terrain, d.fertility, flags, d.rocks, d.grove)).toEqual([]);
  }
  // A decal's centre is never inside a flagged tile of the real map.
  for (const seed of SEEDS) {
    const s = inputsOf(seed);
    for (const dec of decalsFor(seed, SIZE, s.terrain, s.fertility, s.flags, s.rocks, s.grove)) {
      const i = Math.floor(dec.y) * SIZE + Math.floor(dec.x);
      expect(((s.flags[i] ?? 0) & (GEO_ROAD | GEO_OASIS | GEO_WADI)) === 0).toBe(true);
    }
  }
}]);

RA.push(["follows the clusters: stone in rock clusters, grass in grove clusters and on green ground, sand or track on arid plain", () => {
  const n = SIZE * SIZE;
  const terrain = new Uint8Array(n).fill(TERRAIN_IDS.indexOf("plain"));
  const flags = new Uint8Array(n);
  const arid = new Float32Array(n).fill(0.2);
  const green = new Float32Array(n).fill(0.9);
  const rockAll = new Uint8Array(n).fill(255), noRock = new Uint8Array(n);
  const groveAll = new Uint8Array(n).fill(255);
  const kinds = (f: Float32Array, r: Uint8Array, g: Uint8Array): Set<DecalKind | undefined> =>
    new Set(decalsFor(7, SIZE, terrain, f, flags, r, g).map((d) => kindOf(d.frame)));
  expect([...kinds(arid, rockAll, noRock)]).toEqual(["stone"]);
  expect([...kinds(arid, noRock, groveAll)]).toEqual(["grass"]);
  expect([...kinds(green, noRock, noRock)]).toEqual(["grass"]);
  const bare = kinds(arid, noRock, noRock);
  expect(bare.has("sand") || bare.has("track")).toBe(true);
  expect(bare.has("grass") || bare.has("stone")).toBe(false);
}]);

RA.push(["sizes stamps 2 to 4 tiles across and keeps alpha and frames in range", () => {
  for (const seed of SEEDS) {
    for (const d of decalsOf(seed)) {
      expect(d.scale).toBeGreaterThanOrEqual(2);
      expect(d.scale).toBeLessThanOrEqual(4);
      expect(d.alpha).toBeGreaterThan(0);
      expect(d.alpha).toBeLessThanOrEqual(1);
      expect(kindOf(d.frame)).toBeDefined();
    }
  }
}]);

RA.push(["tiles the noise seamlessly: opposite edges match", () => {
  const n = tileableNoise(64, 8, 3);
  for (let i = 0; i < 64; i++) {
    expect(Math.abs(n[i * 64]! - n[i * 64 + 63]!)).toBeLessThan(0.2);
    expect(Math.abs(n[i]! - n[63 * 64 + i]!)).toBeLessThan(0.2);
  }
  expect(n.every((v) => v >= 0 && v < 1)).toBe(true);
  expect(tileableNoise(64, 8, 3)).toEqual(n);
}]);

test("ground decals: determinism, density, roads and water, cluster kinds; grain noise tiles", () => rows(RA));
