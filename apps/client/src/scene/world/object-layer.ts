import type Phaser from "phaser";
import { theme, hex } from "../../theme/theme.ts";
import { artPack } from "../../art/pack.ts";
import { drawableTag } from "../../state/tile-info.ts";
import { SpritePool } from "../sprite-pool.ts";
import { tileCenter, TILE_H } from "../world-layout.ts";
import { GOLD, HQ_OTHER, HQ_OWN, outlineTile } from "./draw-helpers.ts";
import type { SpecCache } from "./spec-cache.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

const LABEL_ZOOM = 0.35;
const LABEL_PX = 18;

/** Bases, NPC targets, alliance HQs, the selection outline and their level labels. Depth 2.5 (outlines) to 2 (markers) and 4 (labels). */
export class ObjectLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly pool: SpritePool;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private markersKey = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly specs: SpecCache,
  ) {
    this.graphics = scene.add.graphics().setDepth(2.5);
    this.pool = new SpritePool(scene);
  }

  invalidate(): void {
    this.markersKey = "";
  }

  paint(frame: WorldFrame): void {
    const { view, snap, range, selected: sel } = frame;
    const zoom = view.zoom;
    const key = `${frame.snapshotVersion}|${range.x0},${range.x1},${range.y0},${range.y1}|${Math.round(zoom * 40)}|${sel?.x},${sel?.y}`;
    if (key === this.markersKey) return;
    this.markersKey = key;
    const g = this.graphics;
    g.clear();
    // Markers keep at least a thumb's worth of screen size however far out you zoom.
    const k = Math.max(1, 16 / (zoom * TILE_H));
    const inRange = (m: { x: number; y: number }): boolean => m.x >= range.x0 && m.x <= range.x1 && m.y >= range.y0 && m.y <= range.y1;

    if (sel !== null) outlineTile(g, sel, 0xfff1b8, 3.5 / zoom);

    this.pool.begin();
    const depthOf = (t: { x: number; y: number }): number => 1 + (t.x + t.y) / (2 * snap.size);
    // Back to front so nearer markers overlap farther ones.
    const bases = snap.bases.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of bases) {
      const c = tileCenter(b.x, b.y);
      if (b.mine) outlineTile(g, b, GOLD, 3 / zoom);
      // A base is a small headquarters; other players' are cooler in tone so the two read apart.
      const img = this.pool.place(this.specs.tile(artPack.camp, (b.mine ? 1.5 : 1.25) * 1.0), c.x, c.y, depthOf(b), k);
      if (!b.mine) img.setTint(0xbfc6dc);
    }

    const showLabels = zoom >= LABEL_ZOOM;
    const live = new Set<string>();
    const npcs = snap.npcs.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    const px = frame.pixelRatio;
    const labelScale = Math.min(1, zoom / 0.8) / zoom;
    for (const n of npcs) {
      const c = tileCenter(n.x, n.y);
      if (n.kind === "convoy") this.pool.place(this.specs.icon(artPack.npc.convoy, TILE_H * 1.1), c.x, c.y, depthOf(n), k);
      else this.pool.place(this.specs.tile(artPack.npc[n.kind], 1.15), c.x, c.y, depthOf(n), k);
      const centre = { x: c.x, y: c.y + TILE_H * 0.18 * k };
      live.add(n.id);
      let label = this.labels.get(n.id);
      if (label === undefined) {
        label = this.scene.add
          .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${LABEL_PX}px`, fontStyle: "bold", color: "#fff8e6", stroke: hex(theme.ink.base), strokeThickness: 4 })
          .setOrigin(0.5)
          .setDepth(4);
        this.labels.set(n.id, label);
      }
      label.setResolution(px).setText(String(n.level)).setPosition(centre.x, centre.y).setScale(labelScale).setVisible(showLabels);
    }

    // Alliance HQs: a flag medallion ringed teal (the player's own alliance) or violet, drawn over the camps and NPCs
    // they stand among. The only alliance text on the canvas is the ASCII tag, and only if it looks like one.
    const hqs = snap.hqs.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const h of hqs) {
      const c = tileCenter(h.x, h.y);
      const size = TILE_H * 0.4 * k;
      if (h.mine) outlineTile(g, h, HQ_OWN, 3 / zoom);
      const r = TILE_H * 0.62 * k;
      const centre = { x: c.x, y: c.y - size * 1.3 };
      this.pool.place(this.specs.icon(artPack.markers.rally, r * 2), centre.x, centre.y, 2 + depthOf(h) * 0.01, 1);
      g.lineStyle(Math.max(2, r * 0.14), h.mine ? HQ_OWN : HQ_OTHER, 1);
      g.strokeCircle(centre.x, centre.y, r * 1.02);
      const tag = drawableTag(h.tag);
      if (tag === null) continue;
      const key = `hq:${h.x},${h.y}`;
      live.add(key);
      let label = this.labels.get(key);
      if (label === undefined) {
        label = this.scene.add
          .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${LABEL_PX - 2}px`, fontStyle: "bold", color: "#fff8e6", stroke: hex(theme.ink.base), strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(4);
        this.labels.set(key, label);
      }
      label.setResolution(px).setText(tag).setPosition(c.x, centre.y - r * 1.15).setScale(labelScale).setVisible(showLabels);
    }
    this.pool.end();
    for (const [id, label] of this.labels) {
      if (live.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }
}
