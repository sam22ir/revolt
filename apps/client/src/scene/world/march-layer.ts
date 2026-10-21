import type Phaser from "phaser";
import type { MapMarchView } from "@revolt/rules";
import { artPack } from "../../art/pack.ts";
import { SpritePool } from "../sprite-pool.ts";
import { marchPosition, tileCenter, type TileRange } from "../world-layout.ts";
import { GOLD, PAPER } from "./draw-helpers.ts";
import type { SpecCache } from "./spec-cache.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** How long the battle marker shows at the target after a column arrives. */
const BATTLE_FLASH_MS = 5000;

/** Marching columns: a line along each route and a medallion at the column's position. Depth 3 (3.1 to 3.2 for the medallions). */
export class MarchLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly pool: SpritePool;
  private marchesDrawn = false;

  constructor(
    scene: Phaser.Scene,
    private readonly specs: SpecCache,
  ) {
    this.graphics = scene.add.graphics().setDepth(3);
    this.pool = new SpritePool(scene);
  }

  /** Marches repaint every frame and have no cache key, so there is nothing to forget. */
  invalidate(): void {}

  paint(frame: WorldFrame): void {
    const { snap, range, now, view } = frame;
    const g = this.graphics;
    if (snap.marches.length === 0) {
      if (this.marchesDrawn) {
        g.clear();
        this.pool.begin();
        this.pool.end();
      }
      this.marchesDrawn = false;
      return;
    }
    this.marchesDrawn = true;
    g.clear();
    this.pool.begin();
    const zoom = view.zoom;
    // Medallions keep a thumb's worth of screen size: 30 CSS px, however far you zoom.
    const size = 30 / zoom;
    for (const m of snap.marches) {
      if (!touches(m, range)) continue;
      const pos = marchPosition(m, now);
      if (pos.leg === "done") continue;
      const a = tileCenter(m.from.x, m.from.y);
      const b = tileCenter(m.to.x, m.to.y);
      const colour = m.mine ? GOLD : PAPER;
      g.lineStyle(2 / zoom, colour, m.mine ? 0.75 : 0.35);
      g.lineBetween(a.x, a.y, b.x, b.y);
      const p = tileCenter(pos.at.x, pos.at.y);
      const img = this.pool.place(this.specs.icon(pos.leg === "outbound" ? artPack.markers.march : artPack.markers.return, size), p.x, p.y, 3.1);
      if (!m.mine) img.setAlpha(0.7);
      // The fight shows for a moment at the target when the column gets there.
      if (now >= m.arriveAt && now < m.arriveAt + BATTLE_FLASH_MS) {
        this.pool.place(this.specs.icon(artPack.markers.battle, size * 1.3), b.x, b.y - size * 0.4, 3.2);
      }
    }
    this.pool.end();
  }
}

/** Whether the march's bounding box meets the drawn tile range. */
function touches(m: MapMarchView, range: TileRange): boolean {
  return (
    Math.max(m.from.x, m.to.x) >= range.x0 &&
    Math.min(m.from.x, m.to.x) <= range.x1 &&
    Math.max(m.from.y, m.to.y) >= range.y0 &&
    Math.min(m.from.y, m.to.y) <= range.y1
  );
}
