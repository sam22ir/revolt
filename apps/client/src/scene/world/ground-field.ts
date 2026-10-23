import { TILE_H, TILE_W, tileToWorld } from "../world-layout.ts";

/** A 2D affine transform in canvas order: x' = a*u + c*v + e, y' = b*u + d*v + f. */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

/**
 * Maps the colour field's pixels to world px. Pixel (u, v) holds tile (floor u, floor v), so its centre (x + 0.5, y + 0.5) must land
 * on the tile's centre, tileToWorld(x, y) + (0, TILE_H / 2). tileToWorld is linear, so this is exactly tileToWorld(u, v).
 */
export const isoFieldMatrix = (): Affine => [TILE_W / 2, TILE_H / 2, -TILE_W / 2, TILE_H / 2, 0, 0];

/**
 * The transform that draws the field into a cell's texture: world px to texture px at `scale`, with the cell's top-left corner at
 * (originX, originY) world px. Composed with the field matrix, so the field lands in the right place in every cell.
 */
export const cellTransform = (scale: number, originX: number, originY: number): Affine => {
  const [a, b, c, d, e, f] = isoFieldMatrix();
  return [scale * a, scale * b, scale * c, scale * d, scale * (e - originX), scale * (f - originY)];
};

/** Fertility above which the green wash starts (also the bake's skip test), and the slope that brings it to full strength. */
export const GREEN_FROM = 0.55;
const GREEN_SLOPE = 2.5;
/** Colour of the green wash (dark olive); its strength is carried by the alpha channel. */
const GREEN_RGB: readonly [number, number, number] = [52, 64, 30];

/** One RGBA pixel per tile, row-major: the tile's ground colour, opaque. */
export const fieldPixels = (colours: Uint32Array, size: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const c = colours[i] ?? 0;
    out[i * 4] = (c >> 16) & 0xff;
    out[i * 4 + 1] = (c >> 8) & 0xff;
    out[i * 4 + 2] = c & 0xff;
    out[i * 4 + 3] = 255;
  }
  return out;
};

/**
 * One RGBA pixel per tile for the green wash: a fixed dark olive whose alpha rises from 0 at GREEN_FROM fertility to 1.
 * Bilinear blending of this field gives a feathered edge, so no tile diamond shows through.
 */
export const greenPixels = (fertility: Float32Array, size: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const w = Math.min(1, Math.max(0, ((fertility[i] ?? 0) - GREEN_FROM) * GREEN_SLOPE));
    out[i * 4] = GREEN_RGB[0];
    out[i * 4 + 1] = GREEN_RGB[1];
    out[i * 4 + 2] = GREEN_RGB[2];
    out[i * 4 + 3] = Math.round(w * 255);
  }
  return out;
};
