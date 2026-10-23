import { diamondSpec, iconSpec, type Atlas } from "../../art/art.ts";
import type { SpriteSpec } from "../sprite-pool.ts";
import { TILE_W } from "../world-layout.ts";

/** Sprite specs shared by every layer, built once per key. */
export class SpecCache {
  private readonly specs = new Map<string, SpriteSpec>();

  /** Spec of a painted sprite on a tile diamond, cached. */
  tile(key: string, widthTiles = 1): SpriteSpec {
    const id = `${key}|${widthTiles}`;
    let spec = this.specs.get(id);
    if (spec === undefined) {
      spec = diamondSpec(key, TILE_W * widthTiles);
      this.specs.set(id, spec);
    }
    return spec;
  }

  icon(key: string, width: number): SpriteSpec {
    const id = `${key}|icon|${width}`;
    let spec = this.specs.get(id);
    if (spec === undefined) {
      spec = iconSpec(key, width);
      this.specs.set(id, spec);
    }
    return spec;
  }

  /** Spec of one atlas frame, cached. `anchor` is the point of the frame that lands on the target (default: its middle). */
  frame(texture: string, atlas: Atlas, index: number, scale: number, useAnchor: boolean): SpriteSpec {
    const i = Math.min(atlas.frames.length - 1, Math.max(0, index));
    const id = `${texture}|${i}|${scale}|${useAnchor}`;
    let spec = this.specs.get(id);
    if (spec === undefined) {
      const f = atlas.frames[i]!;
      spec = { texture, frame: String(i), w: f.w, anchorX: useAnchor ? (f.ax ?? f.w / 2) : f.w / 2, anchorY: useAnchor ? (f.ay ?? f.h) : f.h / 2, scale };
      this.specs.set(id, spec);
    }
    return spec;
  }
}
