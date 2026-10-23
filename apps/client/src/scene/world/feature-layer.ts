import type Phaser from "phaser";
import { geographyOf, type GeoTile, type MapSnapshot } from "@revolt/rules";
import { hash01 } from "../terrain-props.ts";
import { TILE_H, TILE_W, tileCenter, type TileRange } from "../world-layout.ts";

/** Tiles of margin around a range, so a curve that leaves it is not cut short at its edge. */
const MARGIN = 2;
/** Chaikin passes that round a path's tile-by-tile steps into a curve. */
const SMOOTH = 4;
/** Tiles cut from each end of a road, so it stops at the stronghold's plate instead of running under the sprite. */
const ROAD_TRIM = 0.55;
/** Round joins on every few points only: after the smoothing passes neighbouring segments are nearly straight. */
const JOIN_EVERY = 3;
/** Segments per join disc: they are a few pixels across, so a coarse polygon is invisible and much cheaper. */
const DISC_SMOOTHNESS = 8;

const WADI_BANK = 0x9c784a;
const WADI_BED = 0xc9b48a;
const WADI_SHINE = 0xdccaa0;
const PEBBLE = 0x6f5a40;
const ROAD_EDGE = 0xb09062;
const ROAD_TOP = 0xcdae7f;
const OASIS_RIM = 0x6e6236;
const OASIS_WATER = 0x3d7a7e;
const OASIS_SHINE = 0x8cc0b8;

/** A point in tile coordinates and the local width factor of the band through it. */
type Pt = { x: number; y: number; w: number };

/** A path's extent in tile coordinates, so a range that misses it skips the whole path. */
interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

interface Path {
  readonly pts: Pt[];
  readonly box: Box;
}

const pathOf = (pts: Pt[]): Path => {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of pts) {
    box.x0 = Math.min(box.x0, p.x);
    box.x1 = Math.max(box.x1, p.x);
    box.y0 = Math.min(box.y0, p.y);
    box.y1 = Math.max(box.y1, p.y);
  }
  return { pts, box };
};

/** Chaikin corner cutting in tile space; keeps both end points. */
const smooth = (pts: readonly Pt[], passes: number): Pt[] => {
  let cur: Pt[] = [...pts];
  for (let k = 0; k < passes && cur.length > 2; k++) {
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!, b = cur[i + 1]!;
      const at = (k: number): Pt => ({ x: a.x * (1 - k) + b.x * k, y: a.y * (1 - k) + b.y * k, w: a.w * (1 - k) + b.w * k });
      next.push(at(0.25), at(0.75));
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
};

/** Removes `trim` tiles of length from each end of a polyline. */
const trimEnds = (pts: Pt[], trim: number): Pt[] => {
  const cut = (line: Pt[]): Pt[] => {
    let left = trim;
    while (line.length > 2) {
      const a = line[0]!, b = line[1]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > left) {
        line[0] = { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d, w: a.w };
        return line;
      }
      left -= d;
      line.shift();
    }
    return line;
  };
  return cut(cut(pts).reverse()).reverse();
};

/**
 * A path's tile centres in tile coordinates (x + 0.5, y + 0.5 is the middle of a tile), each nudged by up to `jitter` tiles so
 * the curve does not follow the grid, with a width factor between `wLo` and `wHi`. The ends stay put so paths still meet.
 */
const centres = (path: readonly GeoTile[], salt: number, jitter: number, wLo: number, wHi: number): Pt[] =>
  path.map((t, i) => {
    const end = i === 0 || i === path.length - 1;
    const j = end ? 0 : jitter;
    return { x: t.x + 0.5 + (hash01(t.x, t.y, salt) - 0.5) * 2 * j, y: t.y + 0.5 + (hash01(t.x, t.y, salt + 1) - 0.5) * 2 * j, w: wLo + hash01(t.x, t.y, salt + 2) * (wHi - wLo) };
  });

const inRange = (p: Pt, r: TileRange): boolean => p.x >= r.x0 - MARGIN && p.x <= r.x1 + 1 + MARGIN && p.y >= r.y0 - MARGIN && p.y <= r.y1 + 1 + MARGIN;

const boxMeets = (b: Box, r: TileRange): boolean => b.x1 >= r.x0 - MARGIN && b.x0 <= r.x1 + 1 + MARGIN && b.y1 >= r.y0 - MARGIN && b.y0 <= r.y1 + 1 + MARGIN;

/**
 * Dry riverbeds, dirt roads and oasis pools (GDD §4.5, §7), drawn in code on the ground from the map seed. Not a layer of its
 * own: the ground bake calls `paintInto` for each cell, so the features are baked into the same textures as the ground.
 */
export class FeatureLayer {
  private geoKey = "";
  private wadis: Path[] = [];
  private roads: Path[] = [];
  private oases: GeoTile[] = [];

  onSnapshot(snap: MapSnapshot): void {
    const key = `${snap.terrainSeed}|${snap.size}`;
    if (key === this.geoKey) return;
    this.geoKey = key;
    const geo = geographyOf(snap.terrainSeed, snap.size);
    this.wadis = geo.wadis.map((w) => pathOf(smooth(centres(w, 70, 0.35, 0.65, 1.35), SMOOTH)));
    this.roads = geo.roads.map((r) => pathOf(trimEnds(smooth(centres(r, 80, 0.2, 0.9, 1.1), SMOOTH), ROAD_TRIM)));
    this.oases = [...geo.oases];
  }

  /** Draws the features that touch the tile range `range` into `g`, which is in world px. */
  paintInto(g: Phaser.GameObjects.Graphics, range: TileRange): void {
    // Widths are in tile heights; the iso squash flattens a stroke's look on its own, so one width per stroke is enough.
    for (const w of this.wadis) {
      if (!boxMeets(w.box, range)) continue;
      this.stroke(g, w.pts, range, WADI_BANK, TILE_H * 0.9);
      this.stroke(g, w.pts, range, WADI_BED, TILE_H * 0.66);
      // Pale gravel bars only where the bed is wide, so the middle line breaks up.
      this.stroke(g, w.pts, range, WADI_SHINE, TILE_H * 0.22, 1.05);
      this.pebbles(g, w.pts, range);
    }
    for (const r of this.roads) {
      if (!boxMeets(r.box, range)) continue;
      this.stroke(g, r.pts, range, ROAD_EDGE, TILE_H * 0.3);
      this.stroke(g, r.pts, range, ROAD_TOP, TILE_H * 0.17);
    }
    for (const o of this.oases) {
      if (!inRange({ x: o.x + 0.5, y: o.y + 0.5, w: 1 }, range)) continue;
      const c = tileCenter(o.x, o.y);
      g.fillStyle(OASIS_RIM, 0.55);
      g.fillEllipse(c.x, c.y, TILE_W * 1.6, TILE_H * 1.6);
      g.fillStyle(OASIS_WATER, 1);
      g.fillEllipse(c.x, c.y, TILE_W * 1.3, TILE_H * 1.2);
      g.fillStyle(OASIS_SHINE, 0.55);
      g.fillEllipse(c.x - TILE_W * 0.18, c.y - TILE_H * 0.14, TILE_W * 0.55, TILE_H * 0.32);
    }
  }

  /**
   * Strokes the visible runs of a tile-space polyline with round joins (a disc at every vertex), scaling `width` by each point's
   * width factor. Opaque, so overlapping joins leave no dark blots. Points whose factor is under `minW` are skipped.
   */
  private stroke(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], range: TileRange, color: number, width: number, minW = 0): void {
    g.fillStyle(color, 1);
    let prev: Pt | null = null;
    let prevIn = false;
    for (const [i, p] of pts.entries()) {
      const isIn = inRange(p, range);
      const on = p.w >= minW;
      const w = tileCenter(p.x - 0.5, p.y - 0.5);
      if (prev !== null && (isIn || prevIn) && on && prev.w >= minW) {
        const a = tileCenter(prev.x - 0.5, prev.y - 0.5);
        g.lineStyle(width * (p.w + prev.w) * 0.5, color, 1);
        g.lineBetween(a.x, a.y, w.x, w.y);
      }
      if (isIn && on && (i % JOIN_EVERY === 0 || i === pts.length - 1)) g.fillEllipse(w.x, w.y, width * p.w, width * p.w * 0.6, DISC_SMOOTHNESS);
      prev = p;
      prevIn = isIn;
    }
  }

  /** A few dark stones scattered along a riverbed. */
  private pebbles(g: Phaser.GameObjects.Graphics, pts: readonly Pt[], range: TileRange): void {
    g.fillStyle(PEBBLE, 0.55);
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i]!;
      if (!inRange(p, range)) continue;
      const salt = i * 13;
      if (hash01(Math.floor(p.x * 7), Math.floor(p.y * 7), salt) > 0.45) continue;
      const c = tileCenter(p.x - 0.5 + (hash01(i, 1, 90) - 0.5) * 0.4, p.y - 0.5 + (hash01(i, 2, 90) - 0.5) * 0.4);
      const r = 1.5 + hash01(i, 3, 90) * 2;
      g.fillEllipse(c.x, c.y, r * 2, r * 1.2, 6);
    }
  }
}
