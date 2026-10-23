import type Phaser from "phaser";
import { theme, hex } from "../../theme/theme.ts";
import { artPack } from "../../art/pack.ts";
import { drawableTag } from "../../state/tile-info.ts";
import { BASE_SCALE_OTHER, BASE_SCALE_OWN, markerFactor, NPC_SCALE } from "../marker-size.ts";
import { SpritePool } from "../sprite-pool.ts";
import { tileCenter, TILE_H, TILE_W } from "../world-layout.ts";
import { GOLD, HQ_OTHER, HQ_OWN, outlineTile } from "./draw-helpers.ts";
import type { SpecCache } from "./spec-cache.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

const LABEL_ZOOM = 0.35;
const LABEL_PX = 18;
/** Ground plates sit over the props (up to 0.99) and under the markers (1 and up), so a tree never hides a target's footing. */
const PLATE_DEPTH = 0.995;
const SHADOW = 0x1c140c;
/** Level badge: a dark disc with a bronze ring behind the number. */
const BADGE_FILL = 0x2b2219;
const BADGE_RING = 0xc8964a;
/** Ring of a base with no alliance. */
const NEUTRAL_RING = 0xf0e4c8;

/** Sets a text's raster resolution only when it changed: each change re-renders the text texture. */
const withResolution = (text: Phaser.GameObjects.Text, px: number): Phaser.GameObjects.Text =>
  text.style.resolution === px ? text : text.setResolution(px);

/** Plate colour of a base: the player's own gold, their alliance teal, another alliance violet, none a pale ring. */
export const relationColor = (b: { mine: boolean; alliance: string | null }, myAlliance: string | null): number =>
  b.mine ? GOLD : b.alliance === null ? NEUTRAL_RING : b.alliance === myAlliance ? HQ_OWN : HQ_OTHER;

/** Bases, NPC targets, alliance HQs, the selection outline and their level labels. Depth 2.5 (outlines) to 2 (markers) and 4 (labels). */
export class ObjectLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  /** Shadows and plates under bases and targets. */
  private readonly plates: Phaser.GameObjects.Graphics;
  private readonly pool: SpritePool;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private markersKey = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly specs: SpecCache,
  ) {
    this.graphics = scene.add.graphics().setDepth(2.5);
    this.plates = scene.add.graphics().setDepth(PLATE_DEPTH);
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
    const pg = this.plates;
    pg.clear();
    // Markers keep at least a thumb's worth of screen size however far out you zoom.
    const k = markerFactor(zoom);
    const inRange = (m: { x: number; y: number }): boolean => m.x >= range.x0 && m.x <= range.x1 && m.y >= range.y0 && m.y <= range.y1;

    if (sel !== null) outlineTile(g, sel, 0xfff1b8, 3.5 / zoom);

    this.pool.begin();
    const depthOf = (t: { x: number; y: number }): number => 1 + (t.x + t.y) / (2 * snap.size);
    // Back to front so nearer markers overlap farther ones.
    const bases = snap.bases.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    const myAlliance = snap.bases.find((b) => b.mine)?.alliance ?? null;
    const showLabels = zoom >= LABEL_ZOOM;
    const live = new Set<string>();
    const px = frame.pixelRatio;
    const labelScale = Math.min(1, zoom / 0.8) / zoom;
    for (const b of bases) {
      const c = tileCenter(b.x, b.y);
      // The plate says whose base it is; the player's own also gets a soft gold glow.
      this.plate(pg, c, k, relationColor(b, myAlliance), b.mine ? 2.2 : 1.9, b.mine);
      // A base is a small headquarters; other players' are cooler in tone so the two read apart.
      // Names and alliance tags are DOM plates above the canvas (ui/map-labels.ts), so Arabic handles shape correctly.
      const img = this.pool.place(this.specs.tile(artPack.camp, b.mine ? BASE_SCALE_OWN : BASE_SCALE_OTHER), c.x, c.y, depthOf(b), k);
      if (!b.mine) img.setTint(0xbfc6dc);
    }

    const npcs = snap.npcs.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const n of npcs) {
      const c = tileCenter(n.x, n.y);
      let centre: { x: number; y: number };
      if (n.kind === "convoy") {
        // The convoy medallion stands on a short post over its own shadow, so it reads as on the tile, not floating over it.
        const lift = TILE_H * 0.85 * k;
        this.plate(pg, c, k, BADGE_RING, 0.8, false);
        // The post is on the plate graphics, under the medallion, so it shows only below it.
        pg.lineStyle(Math.max(2, 4 * k), BADGE_FILL, 0.9);
        pg.lineBetween(c.x, c.y, c.x, c.y - lift);
        this.pool.place(this.specs.icon(artPack.npc.convoy, TILE_H * 1.1), c.x, c.y - lift, depthOf(n), k);
        centre = { x: c.x + TILE_H * 0.42 * k, y: c.y - lift + TILE_H * 0.32 * k };
      } else {
        this.plate(pg, c, k, n.kind === "fortified_line" ? 0xb5452f : BADGE_RING, n.kind === "fortified_line" ? 1.85 : 1.65, false);
        this.pool.place(this.specs.tile(artPack.npc[n.kind], NPC_SCALE), c.x, c.y, depthOf(n), k);
        centre = { x: c.x, y: c.y + TILE_H * 0.18 * k };
      }
      live.add(n.id);
      if (showLabels) {
        const r = LABEL_PX * 0.72 * labelScale;
        g.fillStyle(BADGE_FILL, 0.92);
        g.fillCircle(centre.x, centre.y, r);
        g.lineStyle(Math.max(1.5, r * 0.18), n.kind === "fortified_line" ? 0xd0573a : BADGE_RING, 1);
        g.strokeCircle(centre.x, centre.y, r);
      }
      withResolution(this.label(n.id, LABEL_PX, 0, 0.5), px).setText(String(n.level)).setPosition(centre.x, centre.y).setScale(labelScale).setVisible(showLabels);
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
      withResolution(this.label(key, LABEL_PX - 2, 3, 1), px).setText(tag).setPosition(c.x, centre.y - r * 1.15).setScale(labelScale).setVisible(showLabels);
    }
    this.pool.end();
    for (const [id, label] of this.labels) {
      if (live.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }

  /** The label kept under `key`, created on first use. `stroke` 0 means no outline (the number sits on its badge). */
  private label(key: string, sizePx: number, stroke: number, originY: number): Phaser.GameObjects.Text {
    let label = this.labels.get(key);
    if (label === undefined) {
      label = this.scene.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${sizePx}px`, fontStyle: "bold", color: "#fff8e6", stroke: hex(theme.ink.base), strokeThickness: stroke })
        .setOrigin(0.5, originY)
        .setDepth(4);
      this.labels.set(key, label);
    }
    return label;
  }

  /** A soft shadow and a coloured ring on the ground under a marker; `glow` adds a faint fill of the ring colour. */
  private plate(g: Phaser.GameObjects.Graphics, c: { x: number; y: number }, k: number, ring: number, size: number, glow: boolean): void {
    const w = TILE_W * 0.82 * size * k;
    const h = TILE_H * 0.82 * size * k;
    g.fillStyle(SHADOW, 0.3);
    g.fillEllipse(c.x, c.y + h * 0.06, w, h);
    if (glow) {
      g.fillStyle(ring, 0.22);
      g.fillEllipse(c.x, c.y, w * 1.1, h * 1.1);
    }
    g.lineStyle(Math.max(1.5, 2.5 * k), ring, glow ? 0.95 : 0.7);
    g.strokeEllipse(c.x, c.y, w, h);
  }
}
