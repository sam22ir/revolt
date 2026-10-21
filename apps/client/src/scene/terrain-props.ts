import type { TerrainId } from "@revolt/rules";

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
}

const prop = (x: number, y: number, salt: number, kind: PropKind, scaleLo: number, scaleHi: number, spread = 0.3): PropPlan => ({
  kind,
  pick: hash01(x, y, salt),
  dx: (hash01(x, y, salt + 1) - 0.5) * 2 * spread,
  dy: (hash01(x, y, salt + 2) - 0.5) * 2 * spread,
  scale: scaleLo + hash01(x, y, salt + 3) * (scaleHi - scaleLo),
  flip: hash01(x, y, salt + 4) < 0.5,
});

/**
 * The props on a tile. `interior` is the share of its eight neighbours with the same terrain (0 at a border, 1 deep inside),
 * so forests thicken and mountains rise toward the middle of a region and thin out at its edge, which makes each region read as one piece.
 */
export const propsFor = (terrain: TerrainId, x: number, y: number, interior: number): PropPlan[] => {
  const out: PropPlan[] = [];
  const r = hash01(x, y, 1);
  if (terrain === "forest") {
    const trees = interior > 0.85 ? (r < 0.55 ? 2 : 1) : interior > 0.45 ? (r < 0.6 ? 1 : 0) : r < 0.3 ? 1 : 0;
    for (let i = 0; i < trees; i++) out.push(prop(x, y, 10 + i * 7, "trees", 0.85, 1.1, i === 0 ? 0.22 : 0.3));
    if (hash01(x, y, 2) < 0.22) out.push(prop(x, y, 40, "scrub", 0.8, 1.1, 0.35));
  } else if (terrain === "mountain") {
    if (interior > 0.6) out.push(prop(x, y, 10, "peaks", 1.05, 1.5, 0.15));
    else if (r < 0.5) out.push(prop(x, y, 10, "peaks", 0.65, 0.95, 0.2));
    if (hash01(x, y, 2) < 0.25) out.push(prop(x, y, 40, "rocks", 0.7, 1.1, 0.35));
  } else if (terrain === "hills") {
    if (r < 0.07) out.push(prop(x, y, 10, "terraces", 0.85, 1, 0.1));
    else if (r < 0.25) out.push(prop(x, y, 10, "scrub", 0.8, 1.1, 0.35));
    else if (r < 0.34) out.push(prop(x, y, 10, "rocks", 0.6, 0.95, 0.35));
  } else {
    if (r < 0.14) out.push(prop(x, y, 10, "scrub", 0.8, 1.1, 0.35));
    else if (r < 0.2) out.push(prop(x, y, 10, "rocks", 0.55, 0.9, 0.35));
  }
  return out;
};
