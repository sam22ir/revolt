import { expect } from "vitest";
import { fertilityAt, GEO_BANK, GEO_OASIS, GEO_OASIS_RING, GEO_OASIS_SHORE, GEO_ROAD, GEO_WADI, geographyOf, terrainAt, type TerrainId } from "@revolt/rules";
import { hash01, OASIS_FRONT, OLIVE_FRAMES, ORCHARD_FRAMES, propsFor, type PropContext } from "../src/scene/terrain-props.ts";
import { clusterMask } from "../src/scene/decor-clusters.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

RA.push(["hashes the same tile to the same number, always in [0, 1)", () => {
  expect(hash01(12, 34, 5)).toBe(hash01(12, 34, 5));
  for (let i = 0; i < 500; i++) {
    const v = hash01(i, i * 7, 3);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
}]);

RA.push(["gives the same props for the same tile and different ones for others", () => {
  expect(propsFor("forest", 4, 9, 1)).toEqual(propsFor("forest", 4, 9, 1));
  const a = JSON.stringify(propsFor("forest", 4, 9, 1));
  const some = Array.from({ length: 30 }, (_, i) => JSON.stringify(propsFor("forest", i, 9, 1)));
  expect(some.some((s) => s !== a)).toBe(true);
}]);

RA.push(["thickens a forest toward its middle", () => {
  const count = (interior: number): number => {
    let n = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) n += propsFor("forest", x, y, interior).filter((p) => p.kind === "trees").length;
    return n;
  };
  expect(count(1)).toBeGreaterThan(count(0.5));
  expect(count(0.5)).toBeGreaterThan(count(0));
}]);

RA.push(["keeps peaks rare and to the middle of mountains, and trees to forests", () => {
  const tiles = Array.from({ length: 400 }, (_, i) => [i % 20, Math.floor(i / 20)] as const);
  const peaks = (interior: number): number => tiles.filter(([x, y]) => propsFor("mountain", x, y, interior).some((p) => p.kind === "peaks")).length;
  expect(peaks(1)).toBeGreaterThan(0);
  expect(peaks(1)).toBeLessThan(tiles.length / 2);
  expect(peaks(0.6)).toBe(0);
  for (const t of ["plain", "hills", "forest", "mountain"] as const) {
    expect(tiles.every(([x, y]) => propsFor(t, x, y, 1).every((p) => p.kind !== "terraces"))).toBe(true);
  }
  for (const t of ["plain", "hills", "mountain"] as const) {
    expect(tiles.every(([x, y]) => propsFor(t, x, y, 1).every((p) => p.kind !== "trees"))).toBe(true);
  }
}]);

RA.push(["keeps offsets inside a tile and scales positive", () => {
  for (let x = 0; x < 30; x++) {
    for (let y = 0; y < 30; y++) {
      const contexts: PropContext[] = [
        { flags: 0, fertility: 0.5, rocks: 0, grove: 0 },
        { flags: 0, fertility: 0.5, rocks: 1, grove: 0 },
        { flags: 0, fertility: 0.9, rocks: 0, grove: 1 },
        { flags: 0, fertility: 0.2, rocks: 0, grove: 1 },
      ];
      for (const ctx of contexts)
        for (const t of ["plain", "hills", "forest", "mountain"] as const) {
          for (const p of propsFor(t, x, y, 0.7, ctx)) {
            expect(Math.abs(p.dx)).toBeLessThanOrEqual(0.4);
            expect(Math.abs(p.dy)).toBeLessThanOrEqual(0.4);
            expect(p.scale).toBeGreaterThan(0);
            expect(p.pick).toBeGreaterThanOrEqual(0);
            expect(p.pick).toBeLessThan(1);
          }
        }
    }
  }
}]);

const grid = Array.from({ length: 900 }, (_, i) => [i % 30, Math.floor(i / 30)] as const);
const ctxOf = (flags: number, fertility = 0.5, rocks = 0, grove = 0): PropContext => ({ flags, fertility, rocks, grove });
const all = (t: "plain" | "hills" | "forest" | "mountain", ctx: PropContext) => grid.flatMap(([x, y]) => propsFor(t, x, y, 1, ctx));

RA.push(["keeps roads and oasis pools bare, and a riverbed to small stones", () => {
  for (const t of ["plain", "hills", "forest", "mountain"] as const) {
    expect(all(t, ctxOf(GEO_ROAD, 0.5, 1, 1))).toEqual([]);
    expect(all(t, ctxOf(GEO_OASIS, 0.5, 1, 1))).toEqual([]);
    const bed = all(t, ctxOf(GEO_WADI, 0.5, 1, 1));
    expect(bed.every((p) => p.kind === "rocks" && p.scale <= 0.6)).toBe(true);
  }
}]);

RA.push(["puts rock outcrops only inside rock clusters, bigger toward the core", () => {
  const inside = (r: number) => grid.flatMap(([x, y]) => propsFor("plain", x, y, 1, ctxOf(0, 0.5, r, 0)));
  // Outside a cluster only the rare 3% dressing appears (no rock cluster involved).
  expect(inside(0).length).toBeLessThan(grid.length * 0.05);
  expect(inside(1).length).toBeGreaterThan(grid.length / 2);
  expect(inside(1).every((p) => p.kind === "rocks")).toBe(true);
  const meanScale = (ps: { scale: number }[]) => ps.reduce((s, p) => s + p.scale, 0) / ps.length;
  expect(meanScale(inside(1))).toBeGreaterThan(meanScale(inside(0.2)));
}]);

RA.push(["grows olive groves inside grove clusters on green ground, scrub on bare ground, and little outside", () => {
  const groves = (f: number) => grid.flatMap(([x, y]) => propsFor("plain", x, y, 1, ctxOf(0, f, 0, 1)));
  const green = groves(0.9);
  expect(green.filter((p) => p.kind === "trees").length).toBeGreaterThan(grid.length / 4);
  expect(green.filter((p) => p.kind === "trees").every((p) => p.frames === OLIVE_FRAMES)).toBe(true);
  const bare = groves(0.2);
  expect(bare.some((p) => p.kind === "trees")).toBe(false);
  expect(bare.length).toBeGreaterThan(0);
  expect(all("plain", ctxOf(0, 0.9)).length).toBeLessThan(grid.length * 0.04);
}]);

RA.push(["lines riverbanks with scrub and olives, rings an oasis with orchard but keeps its shore and front low", () => {
  const bank = all("plain", ctxOf(GEO_BANK));
  expect(bank.some((p) => p.kind === "trees" && p.frames === OLIVE_FRAMES)).toBe(true);
  expect(bank.some((p) => p.kind === "scrub")).toBe(true);
  const ring = all("plain", ctxOf(GEO_OASIS_RING));
  expect(ring.length).toBeGreaterThanOrEqual(grid.length);
  expect(ring.every((p) => p.kind === "trees" && p.frames === ORCHARD_FRAMES)).toBe(true);
  for (const low of [GEO_OASIS_RING | GEO_OASIS_SHORE, GEO_OASIS_RING | OASIS_FRONT]) expect(all("plain", ctxOf(low)).every((p) => p.kind === "scrub")).toBe(true);
  // Mountains keep their rock even inside a ring.
  expect(all("mountain", ctxOf(GEO_OASIS_RING)).some((p) => p.kind === "trees")).toBe(false);
}]);

RA.push(["keeps the outer edge of a forest thin: about a tenth of edge tiles get a tree", () => {
  const edge = (interior: number) => grid.filter(([x, y]) => propsFor("forest", x, y, interior).some((p) => p.kind === "trees")).length / grid.length;
  expect(edge(0)).toBeGreaterThan(0.05);
  expect(edge(0)).toBeLessThan(0.15);
  expect(grid.some(([x, y]) => propsFor("forest", x, y, 0.3).some((p) => p.kind === "scrub"))).toBe(false);
}]);

RA.push(["picks only frames that exist in the trees atlas (18 frames)", () => {
  for (const f of ORCHARD_FRAMES) expect(f >= 0 && f < 18).toBe(true);
}]);

// Statistics over real maps: 64x64, seeds 1..5, real terrain, geography, fertility and cluster masks.
// "Plain tile" here means plain terrain with no geography flags (no roads, pools, riverbeds, banks or rings), since those are dressed by their own rules.
const SIZE = 64;
const SEEDS = [1, 2, 3, 4, 5];
const interiorAt = (terrain: TerrainId[], x: number, y: number): number => {
  const id = terrain[y * SIZE + x];
  let same = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || terrain[ny * SIZE + nx] === id) same++;
    }
  return same / 8;
};
interface MapSample {
  readonly terrain: TerrainId[];
  readonly ctx: PropContext[];
  readonly dressed: boolean[];
  readonly plain: boolean[];
}
const sample = (seed: number): MapSample => {
  const terrain = Array.from({ length: SIZE * SIZE }, (_, i) => terrainAt(seed, i % SIZE, Math.floor(i / SIZE)));
  const flags = geographyOf(seed, SIZE).flags;
  const rocks = clusterMask(seed, SIZE, "rocks");
  const grove = clusterMask(seed, SIZE, "grove");
  const ctx = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return { flags: flags[i] ?? 0, fertility: fertilityAt(seed, x, y), rocks: (rocks[i] ?? 0) / 255, grove: (grove[i] ?? 0) / 255 };
  });
  const dressed = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return propsFor(terrain[i] ?? "plain", x, y, interiorAt(terrain, x, y), ctx[i]).length > 0;
  });
  const plain = Array.from({ length: SIZE * SIZE }, (_, i) => terrain[i] === "plain" && (ctx[i]?.flags ?? 0) === 0);
  return { terrain, ctx, dressed, plain };
};
const samples = SEEDS.map(sample);

RA.push(["dresses at most 4% of plain tiles outside every cluster", () => {
  for (const s of samples) {
    let outside = 0, dressed = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!s.plain[i] || (s.ctx[i]?.rocks ?? 0) > 0 || (s.ctx[i]?.grove ?? 0) > 0) continue;
      outside++;
      if (s.dressed[i]) dressed++;
    }
    expect(dressed / outside).toBeLessThanOrEqual(0.04);
  }
}]);

RA.push(["dresses between 10% and 30% of plain tiles overall", () => {
  for (const s of samples) {
    let plain = 0, dressed = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!s.plain[i]) continue;
      plain++;
      if (s.dressed[i]) dressed++;
    }
    const share = dressed / plain;
    expect(share).toBeGreaterThanOrEqual(0.1);
    expect(share).toBeLessThanOrEqual(0.3);
  }
}]);

RA.push(["clusters: a dressed plain tile has a dressed orthogonal neighbour at least 2.5x as often as a plain tile does", () => {
  for (const s of samples) {
    let plain = 0, dressed = 0, withDressedNeighbour = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        if (!s.plain[i]) continue;
        plain++;
        if (!s.dressed[i]) continue;
        dressed++;
        // Neighbours are the four orthogonal ones on the map, whatever their terrain; off-map counts as bare.
        const nbrs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        if (nbrs.some(([nx, ny]) => nx! >= 0 && ny! >= 0 && nx! < SIZE && ny! < SIZE && s.dressed[ny! * SIZE + nx!])) withDressedNeighbour++;
      }
    }
    const pDressed = dressed / plain;
    const pNeighbour = withDressedNeighbour / dressed;
    expect(pNeighbour).toBeGreaterThanOrEqual(2.5 * pDressed);
  }
}]);

test("terrain props: hash, props, forest and mountain density, offsets, landmarks, clusters and statistics", () => rows(RA));
