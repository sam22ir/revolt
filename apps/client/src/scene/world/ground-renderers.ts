import type Phaser from "phaser";
import type { TerrainId } from "@revolt/rules";
import { groundTexture, propsTexture, terrainAtlases } from "../../art/art.ts";
import type { SpritePool } from "../sprite-pool.ts";
import { hash01, propsFor, type PropKind } from "../terrain-props.ts";
import { tileCenter, TILE_H, TILE_W } from "../world-layout.ts";
import type { SpecCache } from "./spec-cache.ts";

/** What one repaint of the ground needs, built once per repaint and shared by every tile. */
export interface GroundPaint {
  readonly g: Phaser.GameObjects.Graphics;
  readonly size: number;
  readonly props: boolean;
  readonly grid: boolean;
  /** The diamond's four corners, reused across tiles. */
  readonly quad: [Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2];
}

/** How a tile is decorated on top of its flat colour. The layer fills the diamond; a renderer adds the rest. */
export interface GroundRenderer {
  /** Called once per repaint, before the tile loop. */
  begin(paint: GroundPaint): void;
  /** `p` is the top corner of the tile diamond, world px. */
  paintTile(paint: GroundPaint, x: number, y: number, p: { readonly x: number; readonly y: number }, terrain: TerrainId, occupied: boolean): void;
}

/** Below ART_ZOOM: the flat colour, plus a grid stroke when zoomed in far enough to show one. */
export const flatGroundRenderer: GroundRenderer = {
  begin(paint) {
    if (paint.grid) paint.g.lineStyle(1.5, 0x000000, 0.18);
  },
  paintTile(paint) {
    if (paint.grid) paint.g.strokePoints(paint.quad, true);
  },
};

/** Drawn a little wider than the tile so the feathered edges of neighbours overlap and blend. */
const TILE_BLEED = 1.25;
/** World px per source px of each prop kind's atlas frames (frames are at most 224 px). */
const PROP_SCALE: Readonly<Record<PropKind, number>> = { trees: 0.42, rocks: 0.22, peaks: 0.55, scrub: 0.3, terraces: 0.4 };

export interface PaintedGroundDeps {
  readonly specs: SpecCache;
  readonly terrainPool: SpritePool;
  readonly propPool: SpritePool;
  /** Share of a tile's eight neighbours with the same terrain, 0 to 1. */
  readonly interior: (x: number, y: number, size: number) => number;
}

/** From ART_ZOOM up: the painted ground sprite on each tile, and props on the tiles that have room for them. */
export function paintedGroundRenderer(deps: PaintedGroundDeps): GroundRenderer {
  const { specs, terrainPool, propPool, interior } = deps;
  return {
    begin() {},
    paintTile(paint, x, y, p, terrain, occupied) {
      const atlas = terrainAtlases.ground[terrain];
      if (atlas === undefined) return;
      const size = paint.size;
      const hh = TILE_H / 2;
      const frame = Math.floor(hash01(x, y, 7) * atlas.frames.length);
      const flip = hash01(x, y, 8) < 0.5;
      const depth = 0.1 + (0.8 * (x + y)) / (2 * size);
      const spec = specs.frame(groundTexture(terrain), atlas, frame, (TILE_W * TILE_BLEED) / (atlas.frames[0]?.w ?? 256), false);
      terrainPool.place(spec, p.x, p.y + hh, depth, 1, flip);
      if (!paint.props || occupied) return;
      for (const plan of propsFor(terrain, x, y, interior(x, y, size))) {
        const pa = terrainAtlases.props[plan.kind];
        if (pa === undefined) continue;
        const c = tileCenter(x + plan.dx, y + plan.dy);
        const pdepth = 0.91 + (0.08 * (x + y + plan.dx + plan.dy)) / (2 * size);
        const pspec = specs.frame(propsTexture(plan.kind), pa, Math.floor(plan.pick * pa.frames.length), PROP_SCALE[plan.kind] * plan.scale, true);
        propPool.place(pspec, c.x, c.y, pdepth, 1, plan.flip);
      }
    },
  };
}
