import { GEO_BANK, GEO_OASIS, GEO_OASIS_RING, GEO_OASIS_SHORE, GEO_ROAD, GEO_WADI, type TerrainId } from "@revolt/rules";

/** A deterministic number in [0, 1) from a tile and a salt: the same tile always gets the same dressing. */
export const hash01 = (x: number, y: number, salt: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export type PropKind = "trees" | "rocks" | "peaks" | "scrub" | "terraces";

/** One prop on a tile. `pick` selects a frame (multiply by the atlas's frame count); offsets are in tiles from the tile centre. */
export interface PropPlan {
  readonly kind: PropKind;
  readonly pick: number;
  readonly dx: number;
  readonly dy: number;
  /** Multiplies the kind's base size. */
  readonly scale: number;
  readonly flip: boolean;
  /** Atlas frames to pick from instead of the whole atlas (e.g. only the olive trees). */
  readonly frames?: readonly number[];
}

/** Landmarks under a tile (GEO_* flags from `geographyOf`) and how green its ground is (0 to 1). */
export interface PropContext {
  readonly flags: number;
  readonly fertility: number;
  /** Rock-cluster strength here, 0 (outside) to 1 (core). See decor-clusters.ts. */
  readonly rocks: number;
  /** Olive or scrub cluster strength here, 0 to 1. */
  readonly grove: number;
}

/**
 * Client-only flag beside the GEO_* bits: the tile is on an oasis ring in front of the pool on screen (x + y larger), where
 * tall trees would stand in front of the water.
 */
export const OASIS_FRONT = 128;

/** Neither green nor bare, and no landmark: the terrain's own dressing. */
export const NEUTRAL_CONTEXT: PropContext = { flags: 0, fertility: 0.5, rocks: 0, grove: 0 };

/** Frames of the trees atlas that are olive trees: groves and riverbanks use only these. */
export const OLIVE_FRAMES: readonly number[] = [3, 7, 12, 15];
/** Olives and broadleaf trees: the denser green around an oasis. */
export const ORCHARD_FRAMES: readonly number[] = [...OLIVE_FRAMES, 1, 5, 13, 17];
/** Below this fertility a grove cluster is scrub rather than olives. */
const ARID = 0.38;
/** Rock clusters show only below this fertility, so green ground is never covered in boulders. */
const ROCKY = 0.6;

const prop = (x: number, y: number, salt: number, kind: PropKind, scaleLo: number, scaleHi: number, spread = 0.3, frames?: readonly number[]): PropPlan => ({
  kind,
  pick: hash01(x, y, salt),
  dx: (hash01(x, y, salt + 1) - 0.5) * 2 * spread,
  dy: (hash01(x, y, salt + 2) - 0.5) * 2 * spread,
  scale: scaleLo + hash01(x, y, salt + 3) * (scaleHi - scaleLo),
  flip: hash01(x, y, salt + 4) < 0.5,
  ...(frames === undefined ? {} : { frames }),
});

/**
 * The props on a tile. `interior` is the share of its eight neighbours with the same terrain (0 at a border, 1 deep inside),
 * so forests thicken and mountains rise toward the middle of a region and thin out at its edge, which makes each region read as one piece.
 */
export const propsFor = (terrain: TerrainId, x: number, y: number, interior: number, ctx: PropContext = NEUTRAL_CONTEXT): PropPlan[] => {
  const out: PropPlan[] = [];
  const r = hash01(x, y, 1);
  const { flags, fertility } = ctx;
  // Landmarks first: roads and pools stay clear, a riverbed has only pebbles, and water greens what is around it.
  if ((flags & (GEO_ROAD | GEO_OASIS)) !== 0) return out;
  if ((flags & GEO_WADI) !== 0) {
    if (r < 0.3) out.push(prop(x, y, 10, "rocks", 0.4, 0.6, 0.3));
    return out;
  }
  if (terrain !== "mountain" && (flags & (GEO_OASIS_SHORE | OASIS_FRONT)) !== 0) {
    if (r < 0.4) out.push(prop(x, y, 10, "scrub", 0.6, 0.85, 0.3));
    return out;
  }
  if (terrain !== "mountain" && (flags & GEO_OASIS_RING) !== 0) {
    const trees = r < 0.55 ? 2 : 1;
    for (let i = 0; i < trees; i++) out.push(prop(x, y, 10 + i * 7, "trees", 0.75, 1.0, 0.3, ORCHARD_FRAMES));
    return out;
  }
  if ((terrain === "plain" || terrain === "hills") && (flags & GEO_BANK) !== 0) {
    if (r < 0.4) out.push(prop(x, y, 10, "scrub", 0.8, 1.05, 0.3));
    else if (r < 0.62) out.push(prop(x, y, 10, "trees", 0.7, 0.9, 0.3, OLIVE_FRAMES));
    return out;
  }
  if (terrain === "plain" || terrain === "hills") {
    // Open ground is quiet: outcrops inside rock clusters, olive or scrub patches inside grove clusters, and almost nothing elsewhere.
    if (ctx.rocks > 0 && fertility < ROCKY) {
      // Rock clusters: outcrops, bigger toward the core of the cluster. Green ground keeps its groves instead.
      if (r < 0.35 + 0.5 * ctx.rocks) {
        const lo = 0.6 + 0.3 * ctx.rocks, hi = 0.9 + 0.4 * ctx.rocks;
        out.push(prop(x, y, 10, "rocks", lo, hi, 0.3));
        if (ctx.rocks > 0.5) out.push(prop(x, y, 40, "rocks", lo, hi, 0.35));
      }
    } else if (ctx.grove > 0) {
      // Grove clusters: olives where the ground is green enough, scrub where it is not; denser with fertility.
      const green = Math.min(1, Math.max(0, fertility));
      const p = Math.min(0.85, (0.3 + 0.55 * ctx.grove) * (0.6 + 0.8 * green));
      if (r < p) out.push(fertility > ARID ? prop(x, y, 10, "trees", 0.72, 0.92, 0.28, OLIVE_FRAMES) : prop(x, y, 10, "scrub", 0.75, 1.0, 0.35));
      else if (hash01(x, y, 2) < 0.15) out.push(prop(x, y, 40, "scrub", 0.75, 1.0, 0.35));
    } else {
      // Outside every cluster: at most about 3% of plain tiles get a single scrub or a small rock; hills keep a little more scrub so they still read as hills.
      const scrub = terrain === "hills" ? 0.06 : 0.02;
      if (r < scrub) out.push(prop(x, y, 10, "scrub", 0.7, 1.0, 0.35));
      else if (r < scrub + 0.01) out.push(prop(x, y, 10, "rocks", 0.5, 0.8, 0.35));
    }
    return out;
  }
  if (terrain === "forest") {
    // The outer edge is thin (10% of tiles) so forests read as compact groves with clean edges.
    const trees = interior > 0.85 ? (r < 0.55 ? 2 : 1) : interior > 0.45 ? (r < 0.6 ? 1 : 0) : r < 0.1 ? 1 : 0;
    for (let i = 0; i < trees; i++) out.push(prop(x, y, 10 + i * 7, "trees", 0.85, 1.1, i === 0 ? 0.22 : 0.3));
    if (interior > 0.45 && hash01(x, y, 2) < 0.22) out.push(prop(x, y, 40, "scrub", 0.8, 1.1, 0.35));
  } else if (terrain === "mountain") {
    // Snowy peaks look Alpine, not Algerian: only the deepest interior keeps one, the rest of a range is rock outcrops.
    if (interior > 0.85 && r < 0.45) out.push(prop(x, y, 10, "peaks", 0.7, 1.0, 0.15));
    else if (r < 0.55) out.push(prop(x, y, 10, "rocks", 1.1, 1.8, 0.25));
    if (hash01(x, y, 2) < 0.3) out.push(prop(x, y, 40, "rocks", 0.7, 1.1, 0.35));
  }
  return out;
};
