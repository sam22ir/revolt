import { groundUrl, terrainAtlases, type Atlas } from "../art/art.ts";
import { TERRAIN_IDS } from "@revolt/rules";
import { el, section } from "./dom.ts";
import { seamTiles } from "./gallery-data.ts";
import { loadImage } from "./image-cache.ts";
import { TILE_BLEED, TILE_W, tileCenter } from "../scene/world-layout.ts";

/** Side of the patch in tiles. */
const PATCH = 6;
/** Canvas pixels per world pixel, so seams are visible on a phone. */
const SCALE = 2;
const PAD = 8;

/** Draws one terrain's patch the way `paintedGroundRenderer` lays out tiles: same centres, same width, same order. */
const drawPatch = (canvas: HTMLCanvasElement, terrain: string, atlas: Atlas): void => {
  const tiles = seamTiles(PATCH, atlas.frames.length);
  const drawW = TILE_W * TILE_BLEED;
  const scale = drawW / (atlas.frames[0]?.w ?? 256);

  // World bounds of every drawn diamond, so the canvas fits the patch exactly.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    const frame = atlas.frames[t.frame];
    if (frame === undefined) continue;
    const c = tileCenter(t.tx, t.ty);
    const halfH = (frame.h * scale) / 2;
    minX = Math.min(minX, c.x - drawW / 2);
    maxX = Math.max(maxX, c.x + drawW / 2);
    minY = Math.min(minY, c.y - halfH);
    maxY = Math.max(maxY, c.y + halfH);
  }
  canvas.width = Math.ceil((maxX - minX + 2 * PAD) * SCALE);
  canvas.height = Math.ceil((maxY - minY + 2 * PAD) * SCALE);

  loadImage(groundUrl(terrain))
    .then((img) => {
      const ctx = canvas.getContext("2d");
      if (ctx === null) return;
      ctx.setTransform(SCALE, 0, 0, SCALE, (PAD - minX) * SCALE, (PAD - minY) * SCALE);
      for (const t of tiles) {
        const frame = atlas.frames[t.frame];
        if (frame === undefined) continue;
        const c = tileCenter(t.tx, t.ty);
        const dh = frame.h * scale;
        ctx.save();
        ctx.translate(c.x, c.y);
        if (t.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, -drawW / 2, -dh / 2, drawW, dh);
        ctx.restore();
      }
    })
    .catch(() => canvas.classList.add("missing"));
};

/** A 6x6 isometric patch per terrain from random frames of its ground atlas, on the game's diamond grid. */
export const seamSection = (): HTMLElement => {
  const s = section(
    "Seam check",
    `A ${PATCH}×${PATCH} patch per terrain on the game's tile grid (TILE_W, TILE_H, TILE_BLEED). Fixed seed: same patch on every reload.`,
  );
  for (const terrain of TERRAIN_IDS) {
    const atlas = terrainAtlases.ground[terrain];
    if (atlas === undefined) continue;
    s.append(el("h3", "", terrain));
    const canvas = el("canvas", "patch");
    drawPatch(canvas, terrain, atlas);
    s.append(canvas);
  }
  return s;
};
