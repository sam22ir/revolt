import { valueNoise } from "@revolt/rules";

/** Kinds of decoration clusters on open ground: outcrops of rock, and patches of olive or scrub. */
export type ClusterKind = "rocks" | "grove";

/** Tiles per noise cell: clusters span a few tiles, so a patch is several tiles across. */
const CELL = 6;
/** Seed salt per kind, far from the salts terrain and geography use (seed, +1, +30, +31 and the rest). */
const SALT: Readonly<Record<ClusterKind, number>> = { rocks: 700, grove: 800 };
/** Raw noise below this is outside a cluster; tuned so about a quarter of tiles are inside (see decor-clusters.test.ts). */
const THRESHOLD = 0.65;

/**
 * Cluster strength in [0, 1] at a tile: 0 outside a cluster, rising to 1 at the cluster's core. A pure function of the seed,
 * so the same map always has the same clusters.
 */
export const clusterAt = (seed: number, x: number, y: number, kind: ClusterKind): number => {
  const n = valueNoise(seed + SALT[kind], x, y, CELL);
  return Math.max(0, (n - THRESHOLD) / (1 - THRESHOLD));
};

/** Cluster strength for every tile of a size × size map, row-major, as 0..255. */
export const clusterMask = (seed: number, size: number, kind: ClusterKind): Uint8Array => {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = Math.round(clusterAt(seed, x, y, kind) * 255);
  }
  return out;
};
