import Phaser from "phaser";
import { liberatedRegions } from "@revolt/rules";
import { theme } from "../../theme/theme.ts";
import { regionEdges } from "../region-edges.ts";
import { regionGridFor } from "../region-grid.ts";
import { TILE_H, TILE_W, tileToWorld } from "../world-layout.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** Just under the props (0.91 to 0.99) and above the tiles (up to 0.9): the borders and wash lie on the ground, trees overlap them. */
const DEPTH = 0.905;
/** Share of the diamond overdrawn so neighbouring washed tiles overlap instead of leaving hairline seams. */
const WASH_BLEED = 1.02;
const WASH_ALPHA = 0.24;
/** Border width on screen, CSS px; the world width follows the zoom so a border is as thin close up as far out. */
const BORDER_SCREEN_PX = 2.5;
const MAX_BORDER_WORLD = 18;
/** Below this zoom (the far overview) ordinary borders stay a faint dark line; closer in they are a warm seam. */
const FAR_ZOOM = 0.3;
/** Opacity of the warm seam between ordinary regions: visible on sand without reading as a crack. */
const SEAM_ALPHA = 0.32;

/** Zoom steps of half an octave: a pinch redraws the borders only when it crosses one. */
const zoomBucket = (zoom: number): number => Math.round(Math.log2(zoom) * 2);

/** Region borders and the wash over liberated regions (GDD §4.5), drawn on the ground. */
export class RegionLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private key = "";

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH);
  }

  invalidate(): void {
    this.key = "";
  }

  paint(frame: WorldFrame): void {
    const { view, snap, range, now } = frame;
    const held = liberatedRegions({ liberations: snap.liberations }, now);
    const bucket = zoomBucket(view.zoom);
    // A region freed by the player's own alliance is washed in its teal; any other liberated region in the movement's gold.
    const myAlliance = snap.bases.find((b) => b.mine)?.alliance ?? null;
    const ours = new Set(
      snap.liberations
        .filter((l) => l.from <= now && (l.until === null || l.until > now) && myAlliance !== null && l.alliance === myAlliance)
        .map((l) => l.region),
    );
    // `far` is its own key term: the 0.3 switch falls inside one zoom bucket, so the bucket alone would keep a stale style.
    const far = view.zoom < FAR_ZOOM;
    const key = `${range.x0},${range.x1},${range.y0},${range.y1}|${snap.terrainSeed}|${snap.size}|${[...held].sort((a, b) => a - b).join(",")}|${[...ours].join(",")}|${bucket}|${far}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.graphics;
    g.clear();
    const grid = regionGridFor(snap.terrainSeed, snap.size);
    const hw = (TILE_W / 2) * WASH_BLEED;
    const hh = (TILE_H / 2) * WASH_BLEED;
    if (held.size > 0) {
      for (let x = range.x0; x <= range.x1; x++) {
        for (let y = range.y0; y <= range.y1; y++) {
          const region = grid[y * snap.size + x] ?? -1;
          if (!held.has(region)) continue;
          g.fillStyle(ours.has(region) ? theme.alliance.own : theme.region.liberated, WASH_ALPHA);
          const p = tileToWorld(x, y);
          const cy = p.y + TILE_H / 2;
          g.fillPoints([new Phaser.Math.Vector2(p.x, cy - hh), new Phaser.Math.Vector2(p.x + hw, cy), new Phaser.Math.Vector2(p.x, cy + hh), new Phaser.Math.Vector2(p.x - hw, cy)], true);
        }
      }
    }
    const width = Math.min(MAX_BORDER_WORLD, BORDER_SCREEN_PX / 2 ** (bucket / 2));
    for (const e of regionEdges(grid, snap.size, range)) {
      const liberated = held.has(e.a) || held.has(e.b);
      const own = ours.has(e.a) || ours.has(e.b);
      if (own || liberated) {
        g.lineStyle(width, own ? theme.alliance.own : theme.region.liberated, 0.9);
      } else if (far) {
        // Far out, a faint dark line keeps the regions readable on the overview.
        g.lineStyle(width, theme.region.border, 0.55);
      } else {
        // Ordinary borders are a soft, wider warm seam rather than a crack.
        g.lineStyle(width * 2, theme.region.seam, SEAM_ALPHA);
      }
      const p = tileToWorld(e.x, e.y);
      const right = { x: p.x + TILE_W / 2, y: p.y + TILE_H / 2 };
      const bottom = { x: p.x, y: p.y + TILE_H };
      const left = { x: p.x - TILE_W / 2, y: p.y + TILE_H / 2 };
      const [from, to] = e.side === "right" ? [right, bottom] : [left, bottom];
      g.lineBetween(from.x, from.y, to.x, to.y);
    }
  }
}
