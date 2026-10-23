import { propsTexture, terrainAtlases } from "../../art/art.ts";
import type { SpritePool } from "../sprite-pool.ts";
import type { PropKind, PropPlan } from "../terrain-props.ts";
import { tileCenter } from "../world-layout.ts";
import type { SpecCache } from "./spec-cache.ts";

/** World px per source px of each prop kind's atlas frames (frames are at most 224 px). */
const PROP_SCALE: Readonly<Record<PropKind, number>> = { trees: 0.42, rocks: 0.22, peaks: 0.55, scrub: 0.3, terraces: 0.4 };

/** Places the planned props of one tile as pooled sprites. The caller skips occupied tiles. */
export const placeTileProps = (plans: readonly PropPlan[], size: number, x: number, y: number, specs: SpecCache, propPool: SpritePool): void => {
  for (const plan of plans) {
    const pa = terrainAtlases.props[plan.kind];
    if (pa === undefined) continue;
    const c = tileCenter(x + plan.dx, y + plan.dy);
    const pdepth = 0.91 + (0.08 * (x + y + plan.dx + plan.dy)) / (2 * size);
    const frame = plan.frames === undefined ? Math.floor(plan.pick * pa.frames.length) : (plan.frames[Math.floor(plan.pick * plan.frames.length)] ?? 0);
    const pspec = specs.frame(propsTexture(plan.kind), pa, frame, PROP_SCALE[plan.kind] * plan.scale, true);
    propPool.place(pspec, c.x, c.y, pdepth, 1, plan.flip);
  }
};
