/**
 * Golden data for the Godot port of the ground look. It replays `GroundLayer.onSnapshot` (float32 fertility, byte-quantised
 * cluster masks, the OASIS_FRONT bit, the real palette) and reads the shaped road/wadi polylines from a real FeatureLayer.
 * Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 * It is a Vitest file because ground-decals.ts imports a JSON file that plain node cannot load.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fertilityAt, GEO_OASIS_RING, geographyOf, terrainAt, TERRAIN_IDS, type MapSnapshot } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import manifest from "../src/art/terrain-manifest.json";
import { clusterMask } from "../src/scene/decor-clusters.ts";
import { OASIS_FRONT } from "../src/scene/terrain-props.ts";
import { decalsFor, DECAL_KIND_FRAMES } from "../src/scene/world/ground-decals.ts";
import { FeatureLayer } from "../src/scene/world/feature-layer.ts";
import { buildGroundPlan } from "../src/scene/world/ground-plan.ts";
import { theme } from "../src/theme/theme.ts";

const SIZE = 64;
/** The last seed is the one the mock server hands out, so the map in screenshots is also a tested map. */
const SEEDS = [0, 12345, 4294967295, 2975369092] as const;
/** Shaped road and wadi polylines are ~640 points per path, so only these seeds carry them (the rest would triple the file). */
const SHAPED_SEEDS: readonly number[] = [12345, 2975369092];

const out = new URL("../../godot/data/ground-fixtures.json", import.meta.url);

const rows = (size: number, cell: (i: number) => string): string[] =>
  Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => cell(y * size + x)).join(""));
const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

interface PtLike {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}
interface PathLike {
  readonly pts: readonly PtLike[];
}

const buildSeed = (seed: number): unknown => {
  const size = SIZE;
  // The same steps as GroundLayer.onSnapshot.
  const terrain = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) terrain[y * size + x] = TERRAIN_IDS.indexOf(terrainAt(seed, x, y));
  const geo = geographyOf(seed, size);
  const flags = Uint8Array.from(geo.flags);
  for (const o of geo.oases)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.x + dx, y = o.y + dy;
        if (dx + dy < 1 || x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        if ((flags[i]! & GEO_OASIS_RING) !== 0) flags[i]! |= OASIS_FRONT;
      }
  const fertility = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) fertility[y * size + x] = fertilityAt(seed, x, y);
  const rocks = clusterMask(seed, size, "rocks");
  const grove = clusterMask(seed, size, "grove");
  const palette = TERRAIN_IDS.map((id) => theme.terrain[id][0]);
  const plan = buildGroundPlan({ size, terrain, flags, fertility, rocks, grove, palette });
  const decals = decalsFor(seed, size, terrain, fertility, flags, rocks, grove);
  const layer = new FeatureLayer();
  layer.onSnapshot({ terrainSeed: seed, size } as MapSnapshot);
  const shaped = layer as unknown as { wadis: PathLike[]; roads: PathLike[] };
  const props: unknown[] = [];
  plan.props.forEach((list, i) => {
    for (const p of list) props.push([i, p.kind, p.pick, p.dx, p.dy, p.scale, p.flip ? 1 : 0, p.frames === undefined ? null : [...p.frames]]);
  });
  return {
    seed,
    size,
    fertility: Array.from({ length: size }, (_, y) => Array.from(fertility.subarray(y * size, (y + 1) * size))),
    flags: rows(size, (i) => hex2(flags[i]!)),
    rocks: rows(size, (i) => hex2(rocks[i]!)),
    grove: rows(size, (i) => hex2(grove[i]!)),
    colours: rows(size, (i) => plan.colours[i]!.toString(16).padStart(6, "0")),
    wadis: geo.wadis.map((w) => w.map((t) => [t.x, t.y])),
    roads: geo.roads.map((r) => r.map((t) => [t.x, t.y])),
    oases: geo.oases.map((t) => [t.x, t.y]),
    props,
    decals: decals.map((d) => [d.x, d.y, d.frame, d.scale, d.flip ? 1 : 0, d.alpha]),
    featureWadis: SHAPED_SEEDS.includes(seed) ? shaped.wadis.map((p) => p.pts.map((q) => [q.x, q.y, q.w])) : null,
    featureRoads: SHAPED_SEEDS.includes(seed) ? shaped.roads.map((p) => p.pts.map((q) => [q.x, q.y, q.w])) : null,
  };
};

const build = (): unknown => ({
  size: SIZE,
  oasisFront: OASIS_FRONT,
  palette: TERRAIN_IDS.map((id) => theme.terrain[id][0]),
  decalKindFrames: DECAL_KIND_FRAMES,
  manifestFrameCounts: {
    props: Object.fromEntries(Object.entries(manifest.props).map(([k, v]) => [k, v.frames.length])),
    decals: (manifest as unknown as { decals: { frames: unknown[] } }).decals.frames.length,
  },
  seeds: SEEDS.map(buildSeed),
});

describe("Godot ground fixtures", () => {
  const writing = process.env["GODOT_EXPORT"] === "1";

  test(writing ? "writes ground-fixtures.json" : "ground-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const data = build();
    if (writing) {
      mkdirSync(dirname(out.pathname), { recursive: true });
      writeFileSync(out, `${compactJson(data)}\n`);
      return;
    }
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(JSON.parse(JSON.stringify(data)));
  });

  test("the copied terrain art is up to date (run `pnpm godot:export`)", () => {
    const same = (from: string, to: string): boolean =>
      readFileSync(new URL(from, import.meta.url)).equals(readFileSync(new URL(to, import.meta.url)));
    expect(same("../src/art/terrain-manifest.json", "../../godot/art/terrain-manifest.json")).toBe(true);
    // The props-*.webp atlases are Godot's own art; only their frames are shared.
    for (const name of ["decals"]) {
      expect(same(`../public/art/terrain/${name}.webp`, `../../godot/art/terrain/${name}.webp`), name).toBe(true);
    }
  });

  test("the fixtures exercise every prop kind used on open ground, forests, mountains and oases", () => {
    const data = build() as { seeds: { props: [number, string][] }[] };
    const kinds = new Set(data.seeds.flatMap((s) => s.props.map((p) => p[1])));
    for (const k of ["trees", "rocks", "peaks", "scrub"]) expect(kinds.has(k), k).toBe(true);
  });
});
