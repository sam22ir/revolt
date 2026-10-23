import { GEO_OASIS_RING, type TerrainId } from "@revolt/rules";
import { hash01, type PropContext } from "../terrain-props.ts";

/** Weights of a tile and its eight neighbours: a small blur, so a terrain change fades over about two tiles. */
const WEIGHTS = [
  [1, 2, 1],
  [2, 4, 2],
  [1, 2, 1],
] as const;
/** The blur's weights sum to this. */
const WEIGHT_SUM = 16;
/** Cell size, in tiles, of the slow brightness drift. */
const DRIFT_CELL = 5;
/** Peak-to-peak brightness drift: 0.12 means about plus or minus 6%. */
const DRIFT_RANGE = 0.12;
/** A second, broader drift over wide stretches of sand: peak-to-peak 0.08, about plus or minus 4%. */
const WIDE_DRIFT_CELL = 16;
const WIDE_DRIFT_RANGE = 0.08;
/** The largest brightness shift either drift can give, as a fraction: half of each range added together. */
export const MAX_DRIFT = DRIFT_RANGE / 2 + WIDE_DRIFT_RANGE / 2;

/** Smooth value noise in [0, 1): a hashed lattice every `cell` tiles, bilinearly blended; `salt` picks an independent lattice. */
const smoothNoise = (x: number, y: number, cell: number, salt: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const v = (i: number, j: number): number => hash01(gx + i, gy + j, salt);
  const top = v(0, 0) * (1 - fx) + v(1, 0) * fx;
  const bottom = v(0, 1) * (1 - fx) + v(1, 1) * fx;
  return top * (1 - fy) + bottom * fy;
};

/** Brightness factor for a tile: the near drift plus the wide one, each centred on zero. */
const driftAt = (x: number, y: number): number =>
  (smoothNoise(x, y, DRIFT_CELL, 91) - 0.5) * DRIFT_RANGE + (smoothNoise(x, y, WIDE_DRIFT_CELL, 92) - 0.5) * WIDE_DRIFT_RANGE;

const channel = (c: number, shift: number): number => (c >> shift) & 0xff;

/**
 * The ground colour of a tile as a 0xRRGGBB number: its terrain colour blended with its neighbours' and shifted by a slow
 * brightness drift, so the ground reads as soft patches and the tile grid does not show.
 * `idAt` returns a terrain index (into `palette`) or -1 off the map, which counts as the tile's own terrain.
 */
export const blendedGround = (idAt: (x: number, y: number) => number, x: number, y: number, palette: readonly number[]): number => {
  const own = idAt(x, y);
  const sum = [0, 0, 0];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const id = idAt(x + dx, y + dy);
      const colour = palette[id < 0 ? own : id] ?? 0;
      const w = WEIGHTS[dy + 1]?.[dx + 1] ?? 0;
      sum[0] = (sum[0] ?? 0) + w * channel(colour, 16);
      sum[1] = (sum[1] ?? 0) + w * channel(colour, 8);
      sum[2] = (sum[2] ?? 0) + w * channel(colour, 0);
    }
  }
  const k = 1 + driftAt(x, y);
  const out = sum.map((s) => Math.max(0, Math.min(255, Math.round((s / WEIGHT_SUM) * k))));
  return ((out[0] ?? 0) << 16) | ((out[1] ?? 0) << 8) | (out[2] ?? 0);
};

const mix = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  const c = (shift: number): number => Math.round(channel(a, shift) * (1 - k) + channel(b, shift) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

/** Olive-green ground of fertile land, pale sand of bare land, damp green around an oasis. */
const FERTILE = 0xa39a58;
const BARE = 0xd9b77e;
const DAMP = 0x8f8c4c;

/**
 * Shifts an open-ground colour (plain or hills) by how green the land is: toward olive where groves grow, toward pale sand
 * where it is bare, and damp green near an oasis. Forests and mountains keep their colour.
 */
export const landTint = (colour: number, terrain: TerrainId, ctx: PropContext): number => {
  if (terrain === "forest" || terrain === "mountain") return colour;
  if ((ctx.flags & GEO_OASIS_RING) !== 0) return mix(colour, DAMP, 0.45);
  if (ctx.fertility > 0.5) return mix(colour, FERTILE, (ctx.fertility - 0.5) * 0.9);
  return mix(colour, BARE, (0.5 - ctx.fertility) * 0.8);
};
