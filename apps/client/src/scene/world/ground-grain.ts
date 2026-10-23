/** Side of the green grain tile, px. It repeats every GRAIN_SIZE world px, anchored at the world origin, so neighbouring cells line up. */
export const GRAIN_SIZE = 256;

/** Seamless value noise in [0, 1): random values on a lattice `cell` px apart, bilinearly blended, with the lattice wrapping at `size`. */
export const tileableNoise = (size: number, cell: number, salt: number): Float32Array => {
  const n = Math.max(1, Math.round(size / cell));
  const lattice = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) lattice[j * n + i] = hash(i, j, salt);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / cell) % n;
    const j0 = Math.floor(fy), ty = smooth(fy - j0);
    const j1 = (j0 + 1) % n;
    for (let x = 0; x < size; x++) {
      const fx = (x / cell) % n;
      const i0 = Math.floor(fx), tx = smooth(fx - i0);
      const i1 = (i0 + 1) % n;
      const top = lattice[j0 * n + i0]! * (1 - tx) + lattice[j0 * n + i1]! * tx;
      const bottom = lattice[j1 * n + i0]! * (1 - tx) + lattice[j1 * n + i1]! * tx;
      out[y * size + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
};

/** Integer hash to [0, 1). */
const hash = (i: number, j: number, salt: number): number => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A seeded generator in [0, 1), so scattered marks come out the same every time. */
export const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * The green grain tile, made once: dark olive mottling with alpha, drawn as a wash over fertile ground and weighted there by the
 * fertility field. GRAIN_SIZE square and seamless. Browser only (uses a canvas), so call it lazily.
 */
export const makeGreenGrain = (): HTMLCanvasElement => {
  const n = GRAIN_SIZE;
  const fine = tileableNoise(n, 8, 12), coarse = tileableNoise(n, 32, 11);
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const gctx = c.getContext("2d");
  if (gctx !== null) {
    const img = gctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      // Mottled: patches of the coarse noise, with the fine grain breaking them up.
      const m = Math.max(0, Math.min(1, (0.6 * coarse[i]! + 0.4 * fine[i]! - 0.42) * 2.4));
      img.data[i * 4] = 58;
      img.data[i * 4 + 1] = 70;
      img.data[i * 4 + 2] = 32;
      img.data[i * 4 + 3] = Math.round(m * 200);
    }
    gctx.putImageData(img, 0, 0);
  }
  return c;
};
