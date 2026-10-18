/** Seeds are unsigned 32-bit integers. */
export const isSeed = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

/**
 * mulberry32: a small, fast seeded PRNG. Same seed, same sequence, on every
 * JavaScript engine (32-bit integer math only). Returns floats in [0, 1).
 */
export const seededRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Stable 32-bit hash of integers, for map generation from a seed. */
export const hash32 = (...values: readonly number[]): number => {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return (h ^ (h >>> 15)) >>> 0;
};
