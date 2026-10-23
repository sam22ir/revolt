import type Phaser from "phaser";
import { fertilityAt, GEO_OASIS_RING, geographyOf, terrainAt, TERRAIN_IDS, type MapSnapshot } from "@revolt/rules";
import { theme } from "../../theme/theme.ts";
import { groundTexture, propsTexture, terrainAtlases, type Atlas } from "../../art/art.ts";
import { SpritePool } from "../sprite-pool.ts";
import { OASIS_FRONT } from "../terrain-props.ts";
import type { FeatureLayer } from "./feature-layer.ts";
import { GroundBake } from "./ground-bake.ts";
import { buildGroundPlan, type GroundPlan } from "./ground-plan.ts";
import { placeTileProps } from "./ground-props.ts";
import type { SpecCache } from "./spec-cache.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** Props (trees, peaks, rocks) are drawn from this zoom up; farther out the ground alone reads fine and there would be too many sprites. */
const PROP_ZOOM = 0.4;

/**
 * The terrain under the map, at depth 0 (the rim, the ground and the roads are baked into cell textures; see ground-bake.ts),
 * with props as pooled sprites above it (0.91 and up).
 */
export class GroundLayer implements WorldLayer {
  private readonly bake: GroundBake;
  private readonly propPool: SpritePool;
  private readonly specs: SpecCache;
  private readonly features: FeatureLayer;
  private plan: GroundPlan = { colours: new Uint32Array(0), props: [] };
  private terrain = new Uint8Array(0);
  /** GEO_* flags and fertility per tile, row-major, rebuilt with the terrain. */
  private geoFlags: Uint8Array = new Uint8Array(0);
  private fertility = new Float32Array(0);
  private terrainKey = "";
  /** Changes when the set of occupied tiles (bases, NPCs, alliance HQs) does, so props are not drawn under them. */
  private occupiedKey = "";
  private occupied = new Set<number>();
  private propKey = "";

  constructor(scene: Phaser.Scene, specs: SpecCache, features: FeatureLayer) {
    this.bake = new GroundBake(scene);
    this.propPool = new SpritePool(scene);
    this.specs = specs;
    this.features = features;
    addAtlasFrames(scene.textures);
  }

  /** Called by the scene when the snapshot changes: rebuilds the terrain and occupied tiles when they change. */
  onSnapshot(snap: MapSnapshot): void {
    this.trackOccupied(snap);
    const key = `${snap.terrainSeed}|${snap.size}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;
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
    // The features are read when a cell bakes, which is after the scene has handed them the same snapshot.
    this.bake.reset({ size: snap.size, colours: this.plan.colours, paintFeatures: (g, range) => this.features.paintInto(g, range) });
    this.propKey = "";
  }

  invalidate(): void {
    this.propKey = "";
  }

  paint(frame: WorldFrame): void {
    const { view, snap, range } = frame;
    this.bake.update(view);
    const props = view.zoom >= PROP_ZOOM;
    const key = `${range.x0},${range.x1},${range.y0},${range.y1}|${props}|${this.occupiedKey}`;
    if (key === this.propKey) return;
    this.propKey = key;
    this.propPool.begin();
    if (props) this.placeProps(snap.size, range);
    this.propPool.end();
  }

  private placeProps(size: number, range: { x0: number; x1: number; y0: number; y1: number }): void {
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) {
        const i = y * size + x;
        if (this.occupied.has(i)) continue;
        placeTileProps(this.plan.props[i] ?? [], size, x, y, this.specs, this.propPool);
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
