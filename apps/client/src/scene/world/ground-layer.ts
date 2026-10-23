import Phaser from "phaser";
import { fertilityAt, GEO_OASIS_RING, geographyOf, terrainAt, TERRAIN_IDS, type MapSnapshot } from "@revolt/rules";
import { theme } from "../../theme/theme.ts";
import { groundTexture, propsTexture, terrainAtlases, type Atlas } from "../../art/art.ts";
import { SpritePool } from "../sprite-pool.ts";
import { OASIS_FRONT } from "../terrain-props.ts";
import { buildGroundPlan, type GroundPlan } from "./ground-plan.ts";
import { TILE_H, TILE_W, tileToWorld, type TileRange } from "../world-layout.ts";
import { poly } from "./draw-helpers.ts";
import { flatGroundRenderer, softGroundRenderer, type GroundPaint, type GroundRenderer } from "./ground-renderers.ts";
import type { SpecCache } from "./spec-cache.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** Below this zoom there are too many tiles to draw as sprites; flat colours read fine at that size. */
const ART_ZOOM = 0.3;
/** Below this zoom tiles are too small for outlines and level numbers. */
const GRID_ZOOM = 0.45;
/** Props (trees, peaks, rocks) are drawn from this zoom up; farther out the ground alone reads fine and there would be too many sprites. */
const PROP_ZOOM = 0.4;

const TERRAIN_COLORS = theme.terrain;

/** The terrain under the map: flat colours when far out, soft blended ground and props when close. Depth 0 (the rim) to 0.9 (tiles) and 0.91 to 0.99 (props). */
export class GroundLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly propPool: SpritePool;
  private readonly flat: GroundRenderer = flatGroundRenderer;
  private readonly soft: GroundRenderer;
  private terrain = new Uint8Array(0);
  /** GEO_* flags and fertility per tile, row-major, rebuilt with the terrain. */
  private geoFlags: Uint8Array = new Uint8Array(0);
  private fertility = new Float32Array(0);
  private terrainKey = "";
  private groundKey = "";
  /** Changes when the set of occupied tiles (bases, NPCs, alliance HQs) does, so props are not drawn under them. */
  private occupiedKey = "";
  private occupied = new Set<number>();
  private plan: GroundPlan = { colours: new Uint32Array(0), props: [] };
  // Reused for every tile so a repaint allocates nothing.
  private readonly quad: [Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2] = [
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
  ];

  constructor(scene: Phaser.Scene, specs: SpecCache) {
    this.graphics = scene.add.graphics().setDepth(0);
    this.propPool = new SpritePool(scene);
    addAtlasFrames(scene.textures);
    this.soft = softGroundRenderer({ specs, propPool: this.propPool });
  }

  /** Called by the scene when the snapshot changes: rebuilds the terrain and occupied tiles when they change. */
  onSnapshot(snap: MapSnapshot): void {
    this.trackOccupied(snap);
    const key = `${snap.terrainSeed}|${snap.size}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.groundKey = "";
      this.terrain = new Uint8Array(snap.size * snap.size);
      for (let x = 0; x < snap.size; x++) {
        for (let y = 0; y < snap.size; y++) this.terrain[y * snap.size + x] = TERRAIN_IDS.indexOf(terrainAt(snap.terrainSeed, x, y));
      }
      const geo = geographyOf(snap.terrainSeed, snap.size);
      this.geoFlags = Uint8Array.from(geo.flags);
      // The ring tiles in front of a pool on screen keep low dressing, so the water stays visible.
      for (const o of geo.oases)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = o.x + dx, y = o.y + dy;
            if (dx + dy < 1 || x < 0 || y < 0 || x >= snap.size || y >= snap.size) continue;
            const i = y * snap.size + x;
            if ((this.geoFlags[i]! & GEO_OASIS_RING) !== 0) this.geoFlags[i]! |= OASIS_FRONT;
          }
      this.fertility = new Float32Array(snap.size * snap.size);
      for (let y = 0; y < snap.size; y++) for (let x = 0; x < snap.size; x++) this.fertility[y * snap.size + x] = fertilityAt(snap.terrainSeed, x, y);
      this.plan = buildGroundPlan({ size: snap.size, terrain: this.terrain, flags: this.geoFlags, fertility: this.fertility, palette: TERRAIN_IDS.map((id) => theme.terrain[id][0]) });
    }
  }

  invalidate(): void {
    this.groundKey = "";
  }

  paint(frame: WorldFrame): void {
    const { view, snap, range } = frame;
    const grid = view.zoom >= GRID_ZOOM;
    const art = view.zoom >= ART_ZOOM;
    const props = view.zoom >= PROP_ZOOM;
    const key = `${range.x0},${range.x1},${range.y0},${range.y1}|${grid}|${art}|${props}|${this.occupiedKey}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const g = this.graphics;
    g.clear();
    this.paintRim(g, snap.size);
    this.propPool.begin();
    const renderer = art ? this.soft : this.flat;
    const paint: GroundPaint = { g, size: snap.size, props, grid, quad: this.quad, plan: this.plan };
    renderer.begin(paint);
    this.paintTiles(paint, range, renderer);
    this.propPool.end();
  }

  private paintTiles(paint: GroundPaint, range: TileRange, renderer: GroundRenderer): void {
    const { g, size, quad: q } = paint;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) {
        const id = this.terrain[y * size + x] ?? 0;
        const id2 = TERRAIN_IDS[id] ?? "plain";
        const p = tileToWorld(x, y);
        // A flat colour under every tile: it backs the feathered edges of the painted tiles and is the whole look when zoomed far out.
        g.fillStyle(TERRAIN_COLORS[id2][(x + y) & 1] ?? 0, 1);
        q[0].set(p.x, p.y);
        q[1].set(p.x + hw, p.y + hh);
        q[2].set(p.x, p.y + TILE_H);
        q[3].set(p.x - hw, p.y + hh);
        g.fillPoints(q, true);
        renderer.paintTile(paint, x, y, p, id2, this.occupied.has(y * size + x));
      }
    }
  }

  private trackOccupied(snap: MapSnapshot): void {
    const tiles = [...snap.bases, ...snap.npcs, ...snap.hqs];
    let h = tiles.length;
    for (const t of tiles) h = (Math.imul(h, 31) + t.y * snap.size + t.x) | 0;
    const key = String(h);
    if (key === this.occupiedKey) return;
    this.occupiedKey = key;
    // Bases and targets are drawn wider than their tile: keep the ring of tiles around them clear of trees and rocks too.
    this.occupied = new Set();
    for (const t of tiles)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = t.x + dx, y = t.y + dy;
          if (x >= 0 && y >= 0 && x < snap.size && y < snap.size) this.occupied.add(y * snap.size + x);
        }
  }

  /** The slab edge below the map's two near sides, so the land has some thickness. */
  private paintRim(g: Phaser.GameObjects.Graphics, size: number): void {
    const left = tileToWorld(0, size);
    const bottom = tileToWorld(size, size);
    const right = tileToWorld(size, 0);
    const depth = 22;
    g.fillStyle(0x4a3a2c, 1);
    g.fillPoints(poly([left, bottom, { x: bottom.x, y: bottom.y + depth }, { x: left.x, y: left.y + depth }]), true);
    g.fillStyle(0x3a2d22, 1);
    g.fillPoints(poly([bottom, right, { x: right.x, y: right.y + depth }, { x: bottom.x, y: bottom.y + depth }]), true);
  }
}

/** Registers each atlas frame as a named frame of its texture. */
function addAtlasFrames(textures: Phaser.Textures.TextureManager): void {
  const add = (key: string, atlas: Atlas): void => {
    const tex = textures.get(key);
    if (tex.has("0")) return;
    atlas.frames.forEach((f, i) => tex.add(String(i), 0, f.x, f.y, f.w, f.h));
  };
  for (const [t, atlas] of Object.entries(terrainAtlases.ground)) add(groundTexture(t), atlas);
  for (const [k, atlas] of Object.entries(terrainAtlases.props)) add(propsTexture(k), atlas);
}
