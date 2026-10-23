import Phaser from "phaser";
import type { MapSnapshot } from "@revolt/rules";
import type { GameStore } from "../state/game-store.ts";
import type { WorldStore } from "../state/world-store.ts";
import { hex, theme } from "../theme/theme.ts";
import { artUrl, groundUrl, propsUrl, terrainAtlases, groundTexture, propsTexture, textureKey } from "../art/art.ts";
import { artPack } from "../art/pack.ts";
import type { HudInsets, Insets } from "../ui/hud-insets.ts";
import { createGesture, type Gesture } from "./gesture.ts";
import type { Vec } from "./iso-layout.ts";
import type { PropKind } from "./terrain-props.ts";
import {
  canvasCentre,
  centerTile,
  clampCenter,
  isOutsideFreeBand,
  isTileOnMap,
  panBy,
  withInsets,
  screenToTile,
  tileCenter,
  tileToScreen,
  viewCorners,
  visibleTileRange,
  zoomAt,
  type View,
} from "./world-layout.ts";
import { AmbientLayer } from "./world/ambient-layer.ts";
import { FeatureLayer } from "./world/feature-layer.ts";
import { GroundLayer } from "./world/ground-layer.ts";
import { MarchLayer } from "./world/march-layer.ts";
import { ObjectLayer } from "./world/object-layer.ts";
import { RegionLayer } from "./world/region-layer.ts";
import { SpecCache } from "./world/spec-cache.ts";
import type { TileRef, WorldFrame } from "./world/world-frame.ts";

export type { TileRef } from "./world/world-frame.ts";

export interface WorldCallbacks {
  /** A tap on the map: the tile, or null for a tap outside it. */
  readonly onSelect: (tile: TileRef | null) => void;
  /** The tile in the middle of the screen changed (for the coordinate readout). */
  readonly onCenter: (tile: TileRef) => void;
  /** What the player is looking at, as the four corners of the free band in fractional tile coordinates. Fired only when it moves by half a tile or more. */
  readonly onView: (corners: readonly { readonly x: number; readonly y: number }[]) => void;
}

const BACKGROUND = hex(theme.ground.world);
const START_ZOOM = 0.7;
/** Finger travel (CSS px) that still counts as a tap. */
const TAP_SLOP = 8;

const PROP_KINDS: readonly PropKind[] = ["trees", "rocks", "peaks", "scrub", "terraces"];
const ART_KEYS: readonly string[] = [...Object.values(artPack.npc), artPack.camp, ...Object.values(artPack.markers)];

/**
 * The shared world (GDD §4.5): an isometric tile map you drag and pinch, with bases,
 * NPC targets and marching columns on top. This class owns the camera, input and
 * snapshot handling; the three layers (ground, objects, marches) paint each frame.
 * Terrain and objects are redrawn only when their inputs change; marches move every frame.
 * Camera state lives here, not in Phaser, so it can be set before `create`.
 */
export class WorldScene extends Phaser.Scene {
  private view: View = { cx: 0, cy: 0, zoom: START_ZOOM, width: 400, height: 800, insetTop: 0, insetBottom: 0 };
  private ready = false;
  private snapshot: MapSnapshot | null = null;
  private snapshotVersion = 0;
  private selected: TileRef | null = null;
  /** The selected tile still has to be checked against the free band (once its sheet is open). */
  private focusPending = false;
  private lastRoom: Insets = { top: 0, nav: 0, sheet: 0 };
  /** False until the first measurement of the free band; see applyInsets. */
  private bandKnown = false;
  private needsInitialCenter = true;
  private lastCenter: TileRef | null = null;
  private gesture!: Gesture;
  private readonly specs = new SpecCache();
  private ground!: GroundLayer;
  private features!: FeatureLayer;
  private regions!: RegionLayer;
  private lastViewKey = "";
  private objects!: ObjectLayer;
  private marches!: MarchLayer;
  private ambient!: AmbientLayer;

  constructor(
    private readonly store: GameStore,
    private readonly world: WorldStore,
    private readonly callbacks: WorldCallbacks,
    private readonly insets: HudInsets,
  ) {
    super("world");
  }

  preload(): void {
    // Loaded the first time the map is opened, so none of it is part of the base screen's download.
    for (const key of ART_KEYS) if (!this.textures.exists(textureKey(key))) this.load.image(textureKey(key), artUrl(key));
    for (const t of Object.keys(terrainAtlases.ground)) if (!this.textures.exists(groundTexture(t))) this.load.image(groundTexture(t), groundUrl(t));
    for (const k of PROP_KINDS) if (!this.textures.exists(propsTexture(k))) this.load.image(propsTexture(k), propsUrl(k));
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND);
    // Depths: rim 0, terrain tiles just above it (0.1 to 0.9 by row), markers 1 to 2, outlines 2.5, marches 3, labels 4.
    // Layers are built in paint order, so their Phaser objects are created in the same order as before the split.
    this.ground = new GroundLayer(this, this.specs);
    this.features = new FeatureLayer(this);
    this.regions = new RegionLayer(this);
    this.objects = new ObjectLayer(this, this.specs);
    this.marches = new MarchLayer(this, this.specs);
    this.ambient = new AmbientLayer(this);

    this.gesture = createGesture(
      {
        // A finger on the map is the player's own choice of view: it cancels any pending focus on the selection.
        pan: (dx, dy) => {
          this.focusPending = false;
          this.setView(panBy(this.view, dx, dy));
        },
        zoom: (factor, x, y) => {
          this.focusPending = false;
          this.setView(zoomAt(this.view, factor, x, y));
        },
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
      this.focusPending = false;
      this.setView(zoomAt(this.view, Math.exp(-dy * 0.0012), css(p).x, css(p).y));
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.syncSize());
    // The HUD header, nav bar or sheet changed size: the free band moved, so the camera follows.
    const unsubscribeInsets = this.insets.subscribe(() => this.syncSize());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeInsets);
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.gesture.cancel());
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.ground.invalidate();
      this.features.invalidate();
      this.regions.invalidate();
      this.objects.invalidate();
      this.lastViewKey = "";
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
    this.settleFocus();
    const snap = this.snapshot;
    if (snap === null) return;
    const frame: WorldFrame = {
      view: this.view,
      snap,
      range: visibleTileRange(this.view, snap.size),
      now: this.store.now(),
      pixelRatio: this.pixelRatio(),
      selected: this.selected,
      snapshotVersion: this.snapshotVersion,
    };
    this.ground.paint(frame);
    this.features.paint(frame);
    this.regions.paint(frame);
    this.objects.paint(frame);
    this.marches.paint(frame);
    this.ambient.paint(frame);
    this.reportView();
    const centre = centerTile(this.view, snap.size);
    if (this.lastCenter === null || this.lastCenter.x !== centre.x || this.lastCenter.y !== centre.y) {
      this.lastCenter = centre;
      this.callbacks.onCenter(centre);
    }
  }

  /** Tells the minimap where the camera looks, but only when that moved by half a tile or more. */
  private reportView(): void {
    const corners = viewCorners(this.view);
    const key = corners.map((c) => `${Math.round(c.x * 2)},${Math.round(c.y * 2)}`).join("|");
    if (key === this.lastViewKey) return;
    this.lastViewKey = key;
    this.callbacks.onView(corners);
  }

  /** Selection changed from the DOM (e.g. the panel was closed). */
  setSelectedTile(tile: TileRef | null): void {
    this.select(tile);
  }

  /**
   * Makes `tile` the selection. A tile that is newly selected is checked against the free band once
   * its sheet is open; re-selecting the same tile does not re-arm that check.
   */
  private select(tile: TileRef | null): void {
    const same = tile === null ? this.selected === null : this.selected !== null && this.selected.x === tile.x && this.selected.y === tile.y;
    this.selected = tile;
    if (!same) this.focusPending = tile !== null;
    // Before create() there are no layers yet, and the first paint starts from an empty key anyway.
    this.objects?.invalidate();
  }

  /** Once the sheet is open, pans so the selected tile sits in the middle of the free band if it is hidden. Runs once per selection. */
  private settleFocus(): void {
    if (!this.focusPending || this.lastRoom.sheet === 0 || this.snapshot === null) return;
    this.focusPending = false;
    if (this.selected !== null && isOutsideFreeBand(this.view, this.selected.x, this.selected.y)) this.centerOn(this.selected.x, this.selected.y);
  }

  /** The current zoom, for tests. */
  currentZoom(): number {
    return this.view.zoom;
  }

  /** Centers the view on a tile. Works before the scene has started. */
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
    this.applyInsets();
    this.applyView();
  }

  /**
   * The free band: below the header, above the nav bar or the open sheet, whichever is lower.
   * Once the band is known, a change keeps the picture where it is on the screen. The first
   * measurement places the view's middle at the band's middle instead, as the first centring intended.
   */
  private applyInsets(): void {
    const room = this.insets.get();
    this.lastRoom = room;
    const insetTop = room.top;
    const insetBottom = Math.max(room.nav, room.sheet);
    if (insetTop === this.view.insetTop && insetBottom === this.view.insetBottom) return;
    this.view = this.bandKnown ? withInsets(this.view, insetTop, insetBottom) : { ...this.view, insetTop, insetBottom };
    this.bandKnown = true;
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
    // Phaser centres the camera on the canvas; the view's middle is the free band's middle, which can sit lower or higher.
    const centre = canvasCentre(this.view);
    cam.centerOn(centre.x, centre.y);
  }

  private tap(x: number, y: number): void {
    const size = this.snapshot?.size ?? 0;
    const t = screenToTile(this.view, x, y);
    this.select(isTileOnMap(size, t.x, t.y) ? t : null);
    this.callbacks.onSelect(this.selected);
  }

  // --- snapshot -----------------------------------------------------------

  private setSnapshot(snap: MapSnapshot | null): void {
    this.snapshot = snap;
    this.snapshotVersion++;
    this.regions.invalidate();
    this.objects.invalidate();
    if (snap === null) return;
    this.ground.onSnapshot(snap);
    this.features.onSnapshot(snap);
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
}
