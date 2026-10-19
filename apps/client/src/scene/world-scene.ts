import Phaser from "phaser";
import { terrainAt, TERRAIN_IDS, type MapMarchView, type MapSnapshot, type NpcKind, type TerrainId } from "@revolt/rules";
import type { GameStore } from "../state/game-store.ts";
import { drawableTag } from "../state/tile-info.ts";
import type { WorldStore } from "../state/world-store.ts";
import { artUrl, diamondSpec, iconSpec, textureKey } from "../art/art.ts";
import { createGesture, type Gesture } from "./gesture.ts";
import { SpritePool, type SpriteSpec } from "./sprite-pool.ts";
import type { Vec } from "./iso-layout.ts";
import {
  centerTile,
  clampCenter,
  isTileOnMap,
  marchPosition,
  panBy,
  screenToTile,
  tileCenter,
  tileToScreen,
  tileToWorld,
  visibleTileRange,
  zoomAt,
  TILE_H,
  TILE_W,
  type TileRange,
  type View,
} from "./world-layout.ts";

export interface TileRef {
  readonly x: number;
  readonly y: number;
}

export interface WorldCallbacks {
  /** A tap on the map: the tile, or null for a tap outside it. */
  readonly onSelect: (tile: TileRef | null) => void;
  /** The tile in the middle of the screen changed (for the coordinate readout). */
  readonly onCenter: (tile: TileRef) => void;
}

const BACKGROUND = "#26332a";
const START_ZOOM = 0.7;
/** Finger travel (CSS px) that still counts as a tap. */
const TAP_SLOP = 8;
/** Below this zoom tiles are too small for outlines and level numbers. */
const GRID_ZOOM = 0.45;
const LABEL_ZOOM = 0.35;
const LABEL_PX = 18;

// [light, dark] per terrain: a checker of two shades keeps tiles readable without outlines.
const TERRAIN_COLORS: Readonly<Record<TerrainId, readonly [number, number]>> = {
  plain: [0x8f9b5e, 0x879356],
  hills: [0xa8a066, 0xa0985f],
  forest: [0x4e7040, 0x486a3b],
  mountain: [0x80796f, 0x77716a],
};

/** Below this zoom there are too many tiles to draw as sprites; flat colours read fine at that size. */
const ART_ZOOM = 0.3;
/** The painted tile for each terrain; "hills" has no tile of its own, so terraced fields stand in. */
const TERRAIN_ART: Readonly<Record<TerrainId, string>> = {
  plain: "map/terrain_plain",
  hills: "map/terrain_terraces",
  forest: "map/terrain_forest",
  mountain: "map/terrain_mountain",
};
/** Each NPC kind keeps its own silhouette: watch tower, cart medallion, stone yard, star fort. */
const NPC_ART: Readonly<Record<NpcKind, string>> = {
  patrol: "map/outpost_watch",
  convoy: "map/marker_convoy",
  outpost: "map/outpost_barracks",
  fortified_line: "map/outpost_fort",
};
const BASE_ART = "buildings/hq";
const MARKER_ART = ["map/marker_march", "map/marker_return", "map/marker_battle", "map/marker_rally"] as const;
const ART_KEYS: readonly string[] = [...Object.values(TERRAIN_ART), ...Object.values(NPC_ART), BASE_ART, ...MARKER_ART];
/** How long the battle marker shows at the target after a column arrives. */
const BATTLE_FLASH_MS = 5000;
/** Tile sprites are drawn a hair wider than the tile so neighbours do not show seams. */
const TILE_BLEED = 1.03;

/** Alliance HQs: a pennant, teal for the player's own alliance, violet for the others. */
const HQ_OWN = 0x2f9e8f;
const HQ_OTHER = 0x6a55a8;

const GOLD = 0xe0b040;
const PAPER = 0xf4ead6;

/** Phaser's typings want `Vector2`s for polygon points; markers are few, so allocating them is fine. */
const poly = (points: readonly Vec[]): Phaser.Math.Vector2[] => points.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/** `c` is a world position; `size` is in world pixels. */
interface Marker {
  readonly c: Vec;
  readonly size: number;
}

/**
 * The shared world (GDD §4.5): an isometric tile map you drag and pinch, with bases,
 * NPC targets and marching columns on top. Terrain and markers are redrawn only when
 * the visible tile range, the snapshot or the selection change; marching dots move
 * every frame. Camera state lives here, not in Phaser, so it can be set before `create`.
 */
export class WorldScene extends Phaser.Scene {
  private view: View = { cx: 0, cy: 0, zoom: START_ZOOM, width: 400, height: 800 };
  private ready = false;
  private snapshot: MapSnapshot | null = null;
  private snapshotVersion = 0;
  private terrain = new Uint8Array(0);
  private terrainKey = "";
  private selected: TileRef | null = null;
  private needsInitialCenter = true;
  private groundKey = "";
  private markersKey = "";
  private lastCenter: TileRef | null = null;
  private marchesDrawn = false;
  private gesture!: Gesture;
  private ground!: Phaser.GameObjects.Graphics;
  private markers!: Phaser.GameObjects.Graphics;
  private marchLayer!: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private terrainPool!: SpritePool;
  private markerPool!: SpritePool;
  private marchPool!: SpritePool;
  private readonly specs = new Map<string, SpriteSpec>();
  // Reused for every tile so a repaint allocates nothing.
  private readonly quad: [Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2] = [
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
  ];

  constructor(
    private readonly store: GameStore,
    private readonly world: WorldStore,
    private readonly callbacks: WorldCallbacks,
  ) {
    super("world");
  }

  preload(): void {
    // Loaded the first time the map is opened, so none of it is part of the base screen's download.
    for (const key of ART_KEYS) if (!this.textures.exists(textureKey(key))) this.load.image(textureKey(key), artUrl(key));
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND);
    // Depths: rim 0, terrain tiles just above it (0.1 to 0.9 by row), markers 1 to 2, outlines 2.5, marches 3, labels 4.
    this.ground = this.add.graphics().setDepth(0);
    this.terrainPool = new SpritePool(this);
    this.markers = this.add.graphics().setDepth(2.5);
    this.markerPool = new SpritePool(this);
    this.marchLayer = this.add.graphics().setDepth(3);
    this.marchPool = new SpritePool(this);

    this.gesture = createGesture(
      {
        pan: (dx, dy) => this.setView(panBy(this.view, dx, dy)),
        zoom: (factor, x, y) => this.setView(zoomAt(this.view, factor, x, y)),
        tap: (x, y) => this.tap(x, y),
      },
      TAP_SLOP,
    );
    // The mouse is one pointer; a second finger needs one more.
    this.input.addPointer(1);
    const css = (p: Phaser.Input.Pointer): Vec => ({ x: p.x / this.pixelRatio(), y: p.y / this.pixelRatio() });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.gesture.down(p.id, css(p).x, css(p).y));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.gesture.move(p.id, css(p).x, css(p).y));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.gesture.up(p.id));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.gesture.up(p.id));
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.setView(zoomAt(this.view, Math.exp(-dy * 0.0012), css(p).x, css(p).y));
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.syncSize());
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.gesture.cancel());
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.groundKey = "";
      this.markersKey = "";
      this.syncSize();
    });
    const unsubscribe = this.world.subscribeSnapshot((s) => this.setSnapshot(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    this.ready = true;
    this.syncSize();
    this.setSnapshot(this.world.snapshot());
  }

  override update(): void {
    if (!this.ready) return;
    this.syncSize();
    const snap = this.snapshot;
    if (snap === null) return;
    const range = visibleTileRange(this.view, snap.size);
    this.paintGround(snap, range);
    this.paintMarkers(snap, range);
    this.paintMarches(snap, range);
    const centre = centerTile(this.view, snap.size);
    if (this.lastCenter === null || this.lastCenter.x !== centre.x || this.lastCenter.y !== centre.y) {
      this.lastCenter = centre;
      this.callbacks.onCenter(centre);
    }
  }

  /** Selection changed from the DOM (e.g. the panel was closed). */
  setSelectedTile(tile: TileRef | null): void {
    this.selected = tile;
    this.markersKey = "";
  }

  /** Centers the view on a tile. Works before the scene has started. */
  /** The current zoom, for tests. */
  currentZoom(): number {
    return this.view.zoom;
  }

  centerOn(x: number, y: number): void {
    this.needsInitialCenter = false;
    const c = tileCenter(x, y);
    this.setView({ ...this.view, cx: c.x, cy: c.y });
  }

  /** CSS-pixel position of a tile's middle, or null while the scene is not running. */
  tileScreenPoint(x: number, y: number): Vec | null {
    if (!this.ready) return null;
    this.syncSize();
    return tileToScreen(this.view, x, y);
  }

  // --- view ---------------------------------------------------------------

  private pixelRatio(): number {
    return this.scale.displayScale.x;
  }

  /** The camera is in device pixels, the view in CSS pixels. */
  private syncSize(): void {
    const cam = this.cameras.main;
    const px = this.pixelRatio();
    const width = cam.width / px;
    const height = cam.height / px;
    if (width !== this.view.width || height !== this.view.height) this.view = { ...this.view, width, height };
    this.applyView();
  }

  private setView(next: View): void {
    this.needsInitialCenter = false;
    this.view = this.snapshot === null ? next : clampCenter(next, this.snapshot.size);
    // `centerOn` may be called before the scene has started and has a camera.
    if (this.ready) this.applyView();
  }

  private applyView(): void {
    const cam = this.cameras.main;
    const zoom = this.view.zoom * this.pixelRatio();
    if (cam.zoom !== zoom) cam.setZoom(zoom);
    cam.centerOn(this.view.cx, this.view.cy);
  }

  private tap(x: number, y: number): void {
    const size = this.snapshot?.size ?? 0;
    const t = screenToTile(this.view, x, y);
    this.selected = isTileOnMap(size, t.x, t.y) ? t : null;
    this.markersKey = "";
    this.callbacks.onSelect(this.selected);
  }

  // --- snapshot -----------------------------------------------------------

  private setSnapshot(snap: MapSnapshot | null): void {
    this.snapshot = snap;
    this.snapshotVersion++;
    this.markersKey = "";
    if (snap === null) return;
    const key = `${snap.terrainSeed}|${snap.size}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.groundKey = "";
      this.terrain = new Uint8Array(snap.size * snap.size);
      for (let x = 0; x < snap.size; x++) {
        for (let y = 0; y < snap.size; y++) this.terrain[y * snap.size + x] = TERRAIN_IDS.indexOf(terrainAt(snap.terrainSeed, x, y));
      }
    }
    if (this.needsInitialCenter) {
      const mine = snap.bases.find((b) => b.mine);
      if (mine !== undefined) {
        this.needsInitialCenter = false;
        const c = tileCenter(mine.x, mine.y);
        this.view = clampCenter({ ...this.view, cx: c.x, cy: c.y }, snap.size);
      } else {
        const c = tileCenter(snap.size / 2, snap.size / 2);
        this.view = { ...this.view, cx: c.x, cy: c.y };
      }
    } else {
      this.view = clampCenter(this.view, snap.size);
    }
    if (this.ready) this.applyView();
  }

  // --- terrain ------------------------------------------------------------

  /** Spec of a painted sprite on a tile diamond, cached. */
  private tileSpec(key: string, widthTiles = 1): SpriteSpec {
    const id = `${key}|${widthTiles}`;
    let spec = this.specs.get(id);
    if (spec === undefined) {
      spec = diamondSpec(key, TILE_W * widthTiles);
      this.specs.set(id, spec);
    }
    return spec;
  }

  private iconSpecAt(key: string, width: number): SpriteSpec {
    const id = `${key}|icon|${width}`;
    let spec = this.specs.get(id);
    if (spec === undefined) {
      spec = iconSpec(key, width);
      this.specs.set(id, spec);
    }
    return spec;
  }

  private paintGround(snap: MapSnapshot, range: TileRange): void {
    const grid = this.view.zoom >= GRID_ZOOM;
    const art = this.view.zoom >= ART_ZOOM;
    const key = `${range.x0},${range.x1},${range.y0},${range.y1}|${grid}|${art}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const g = this.ground;
    g.clear();
    this.paintRim(g, snap.size);
    this.terrainPool.begin();
    const q = this.quad;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    if (!art && grid) g.lineStyle(1.5, 0x000000, 0.18);
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) {
        const id = this.terrain[y * snap.size + x] ?? 0;
        const id2 = TERRAIN_IDS[id] ?? "plain";
        const p = tileToWorld(x, y);
        if (art) {
          // Mirror about half the tiles so a field of one terrain does not repeat a visible pattern.
          const flip = ((x * 73856093) ^ (y * 19349663)) % 2 === 0;
          const depth = 0.1 + (0.8 * (x + y)) / (2 * snap.size);
          this.terrainPool.place(this.tileSpec(TERRAIN_ART[id2], TILE_BLEED), p.x, p.y + hh, depth, 1, flip);
          continue;
        }
        g.fillStyle(TERRAIN_COLORS[id2][(x + y) & 1] ?? 0, 1);
        q[0].set(p.x, p.y);
        q[1].set(p.x + hw, p.y + hh);
        q[2].set(p.x, p.y + TILE_H);
        q[3].set(p.x - hw, p.y + hh);
        g.fillPoints(q, true);
        if (grid) g.strokePoints(q, true);
      }
    }
    this.terrainPool.end();
  }

  /** The slab edge below the map's two near sides, so the land has some thickness. */
  private paintRim(g: Phaser.GameObjects.Graphics, size: number): void {
    const left = tileToWorld(0, size);
    const bottom = tileToWorld(size, size);
    const right = tileToWorld(size, 0);
    const depth = 22;
    g.fillStyle(0x3b3f2f, 1);
    g.fillPoints(poly([left, bottom, { x: bottom.x, y: bottom.y + depth }, { x: left.x, y: left.y + depth }]), true);
    g.fillStyle(0x2f3326, 1);
    g.fillPoints(poly([bottom, right, { x: right.x, y: right.y + depth }, { x: bottom.x, y: bottom.y + depth }]), true);
  }

  // --- markers ------------------------------------------------------------

  private paintMarkers(snap: MapSnapshot, range: TileRange): void {
    const zoom = this.view.zoom;
    const sel = this.selected;
    const key = `${this.snapshotVersion}|${range.x0},${range.x1},${range.y0},${range.y1}|${Math.round(zoom * 40)}|${sel?.x},${sel?.y}`;
    if (key === this.markersKey) return;
    this.markersKey = key;
    const g = this.markers;
    g.clear();
    // Markers keep at least a thumb's worth of screen size however far out you zoom.
    const k = Math.max(1, 16 / (zoom * TILE_H));
    const inRange = (m: { x: number; y: number }): boolean => m.x >= range.x0 && m.x <= range.x1 && m.y >= range.y0 && m.y <= range.y1;

    if (sel !== null) this.outlineTile(g, sel, 0xfff1b8, 3.5 / zoom);

    this.markerPool.begin();
    const depthOf = (t: { x: number; y: number }): number => 1 + (t.x + t.y) / (2 * snap.size);
    // Back to front so nearer markers overlap farther ones.
    const bases = snap.bases.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of bases) {
      const c = tileCenter(b.x, b.y);
      if (b.mine) this.outlineTile(g, b, GOLD, 3 / zoom);
      // A base is a small headquarters; other players' are cooler in tone so the two read apart.
      const img = this.markerPool.place(this.tileSpec(BASE_ART, (b.mine ? 1.5 : 1.25) * 1.0), c.x, c.y, depthOf(b), k);
      if (!b.mine) img.setTint(0xbfc6dc);
    }

    const showLabels = zoom >= LABEL_ZOOM;
    const live = new Set<string>();
    const npcs = snap.npcs.filter(inRange).sort((a, b) => a.x + a.y - (b.x + b.y));
    const px = this.pixelRatio();
    const labelScale = Math.min(1, zoom / 0.8) / zoom;
    for (const n of npcs) {
      const c = tileCenter(n.x, n.y);
      if (n.kind === "convoy") this.markerPool.place(this.iconSpecAt(NPC_ART.convoy, TILE_H * 1.1), c.x, c.y, depthOf(n), k);
      else this.markerPool.place(this.tileSpec(NPC_ART[n.kind], 1.15), c.x, c.y, depthOf(n), k);
      const centre = { x: c.x, y: c.y + TILE_H * 0.18 * k };
      live.add(n.id);
      let label = this.labels.get(n.id);
      if (label === undefined) {
        label = this.add
          .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${LABEL_PX}px`, fontStyle: "bold", color: "#fff8e6", stroke: "#2b2a24", strokeThickness: 4 })
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
      if (h.mine) this.outlineTile(g, h, HQ_OWN, 3 / zoom);
      const r = TILE_H * 0.62 * k;
      const centre = { x: c.x, y: c.y - size * 1.3 };
      this.markerPool.place(this.iconSpecAt("map/marker_rally", r * 2), centre.x, centre.y, 2 + depthOf(h) * 0.01, 1);
      g.lineStyle(Math.max(2, r * 0.14), h.mine ? HQ_OWN : HQ_OTHER, 1);
      g.strokeCircle(centre.x, centre.y, r * 1.02);
      const tag = drawableTag(h.tag);
      if (tag === null) continue;
      const key = `hq:${h.x},${h.y}`;
      live.add(key);
      let label = this.labels.get(key);
      if (label === undefined) {
        label = this.add
          .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: `${LABEL_PX - 2}px`, fontStyle: "bold", color: "#fff8e6", stroke: "#2b2a24", strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setDepth(4);
        this.labels.set(key, label);
      }
      label.setResolution(px).setText(tag).setPosition(c.x, centre.y - r * 1.15).setScale(labelScale).setVisible(showLabels);
    }
    this.markerPool.end();
    for (const [id, label] of this.labels) {
      if (live.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }

  private outlineTile(g: Phaser.GameObjects.Graphics, t: TileRef, color: number, width: number): void {
    const p = tileToWorld(t.x, t.y);
    g.lineStyle(width, color, 1);
    g.strokePoints(
      poly([
        { x: p.x, y: p.y },
        { x: p.x + TILE_W / 2, y: p.y + TILE_H / 2 },
        { x: p.x, y: p.y + TILE_H },
        { x: p.x - TILE_W / 2, y: p.y + TILE_H / 2 },
      ]),
      true,
    );
  }

  // --- marches ------------------------------------------------------------

  private paintMarches(snap: MapSnapshot, range: TileRange): void {
    const g = this.marchLayer;
    if (snap.marches.length === 0) {
      if (this.marchesDrawn) {
        g.clear();
        this.marchPool.begin();
        this.marchPool.end();
      }
      this.marchesDrawn = false;
      return;
    }
    this.marchesDrawn = true;
    g.clear();
    this.marchPool.begin();
    const now = this.store.now();
    const zoom = this.view.zoom;
    // Medallions keep a thumb's worth of screen size: 30 CSS px, however far you zoom.
    const size = 30 / zoom;
    for (const m of snap.marches) {
      if (!this.touches(m, range)) continue;
      const pos = marchPosition(m, now);
      if (pos.leg === "done") continue;
      const a = tileCenter(m.from.x, m.from.y);
      const b = tileCenter(m.to.x, m.to.y);
      const colour = m.mine ? GOLD : PAPER;
      g.lineStyle(2 / zoom, colour, m.mine ? 0.75 : 0.35);
      g.lineBetween(a.x, a.y, b.x, b.y);
      const p = tileCenter(pos.at.x, pos.at.y);
      const img = this.marchPool.place(this.iconSpecAt(pos.leg === "outbound" ? "map/marker_march" : "map/marker_return", size), p.x, p.y, 3.1);
      if (!m.mine) img.setAlpha(0.7);
      // The fight shows for a moment at the target when the column gets there.
      if (now >= m.arriveAt && now < m.arriveAt + BATTLE_FLASH_MS) {
        this.marchPool.place(this.iconSpecAt("map/marker_battle", size * 1.3), b.x, b.y - size * 0.4, 3.2);
      }
    }
    this.marchPool.end();
  }

  /** Whether the march's bounding box meets the drawn tile range. */
  private touches(m: MapMarchView, range: TileRange): boolean {
    return (
      Math.max(m.from.x, m.to.x) >= range.x0 &&
      Math.min(m.from.x, m.to.x) <= range.x1 &&
      Math.max(m.from.y, m.to.y) >= range.y0 &&
      Math.min(m.from.y, m.to.y) <= range.y1
    );
  }
}

