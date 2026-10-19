import Phaser from "phaser";
import { BUILDING_IDS, type BaseState, type BuildingId } from "@revolt/rules";
import type { GameStore } from "../state/game-store.ts";
import { artUrl, spriteInfo, textureKey } from "../art/art.ts";
import {
  isoToWorld,
  mapCenter,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  PLOTS,
  plotCenter,
  TILE_W,
  type Vec,
} from "./iso-layout.ts";

interface BuildingView {
  readonly sprite: Phaser.GameObjects.Image;
  /** Selection outline; also the tap target (a polygon that follows the sprite's silhouette box). */
  readonly overlay: Phaser.GameObjects.Graphics;
  readonly badge: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly progress: Phaser.GameObjects.Graphics;
  drawnKey: string;
}

/** Placement of a building sprite: where it sits in world px and how tall it stands above its plot's front corner. */
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Height of the sprite above the plot's centre line, in world px. */
  readonly height: number;
}

const GROUND = "buildings/ground_tile";
const spriteKey = (id: BuildingId): string => `buildings/${id}`;
/** Depths: ground, then buildings back to front, then tap targets, then badges and bars. */
const D_SPRITE = 10;
const D_HIT = 100;
const D_HUD = 200;
const UPGRADING_TINT = 0xb8aa94;

/** Room reserved for the DOM HUD above the map, in CSS pixels. */
const HUD_TOP = 120;
const HUD_BOTTOM = 40;

export class BaseScene extends Phaser.Scene {
  private readonly views = new Map<BuildingId, BuildingView>();
  private readonly placements = new Map<BuildingId, Placement>();
  private selected: BuildingId | null = null;
  private viewCenter: Vec = { x: 0, y: 0 };

  constructor(
    private readonly store: GameStore,
    private readonly onSelect: (id: BuildingId | null) => void,
  ) {
    super("base");
  }

  preload(): void {
    for (const key of [GROUND, ...BUILDING_IDS.map(spriteKey)]) this.load.image(textureKey(key), artUrl(key));
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#3d4a3a");
    this.drawGround();
    // Draw back-to-front so nearer buildings overlap farther ones.
    const order = [...BUILDING_IDS].sort((a, b) => plotCenter(PLOTS[a]).y - plotCenter(PLOTS[b]).y);
    order.forEach((id, i) => this.views.set(id, this.createBuilding(id, i)));
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());
    // A tap on empty ground clears the selection.
    this.input.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onSelect(null);
    });
    const unsubscribe = this.store.subscribe((state, now) => this.refresh(state, now));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.refresh(this.store.state(), this.store.now());
  }

  setSelected(id: BuildingId | null): void {
    this.selected = id;
    this.refresh(this.store.state(), this.store.now());
  }

  /** Screen (CSS px) position of a building's body, for tests and tooling. */
  buildingScreenPoint(id: BuildingId): Vec {
    const cam = this.cameras.main;
    const world = this.buildingCenter(id);
    // The camera zooms around its center, which fitCamera() points at viewCenter.
    // That gives game (device) pixels; displayScale is game px per CSS px, as input uses it.
    const { x: sx, y: sy } = this.scale.displayScale;
    return {
      x: ((world.x - this.viewCenter.x) * cam.zoom + cam.width / 2) / sx,
      y: ((world.y - this.viewCenter.y) * cam.zoom + cam.height / 2) / sy,
    };
  }

  /** A point on the building's walls, above the plot centre where its own sprite is opaque. */
  private buildingCenter(id: BuildingId): Vec {
    const c = plotCenter(PLOTS[id]);
    return { x: c.x, y: c.y - this.placement(id).height * 0.35 };
  }

  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    // Game size is in device pixels; the HUD margins are CSS pixels.
    const px = this.scale.displayScale.y;
    const hudTop = HUD_TOP * px;
    const hudBottom = HUD_BOTTOM * px;
    const usableH = Math.max(100 * px, height - hudTop - hudBottom);
    const zoom = Math.min((width - 16 * px) / MAP_WORLD_WIDTH, usableH / (MAP_WORLD_HEIGHT + 80));
    cam.setZoom(zoom);
    const center = mapCenter();
    // Shift the view so the map sits between the HUD and the bottom edge.
    const offset = (hudTop - hudBottom) / 2 / zoom;
    this.viewCenter = { x: center.x, y: center.y - 30 - offset };
    cam.centerOn(this.viewCenter.x, this.viewCenter.y);
    // Rasterize level numbers at the on-screen scale so they stay crisp when zoomed in.
    const textResolution = Math.max(1, Math.ceil(zoom));
    for (const view of this.views.values()) view.label.setResolution(textResolution);
  }

  /** The painted ground slab, stretched over the whole grid diamond (its rim shows below the near edges). */
  private drawGround(): void {
    const info = spriteInfo(GROUND);
    const rim = 26 / 571; // fraction of the sprite's height that is slab thickness
    const sx = MAP_WORLD_WIDTH / info.w;
    const sy = MAP_WORLD_HEIGHT / (info.h * (1 - rim));
    this.add
      .image(-MAP_WORLD_WIDTH / 2, 0, textureKey(GROUND))
      .setOrigin(0, 0)
      .setScale(sx, sy)
      .setDepth(0);
  }

  /** Scale so the sprite's plot diamond is as wide as the plot, and place its diamond centre on the plot centre. */
  private placement(id: BuildingId): Placement {
    const cached = this.placements.get(id);
    if (cached !== undefined) return cached;
    const info = spriteInfo(spriteKey(id));
    const scale = (PLOTS[id].size * TILE_W) / (info.right.x - info.left.x);
    const cx = (info.left.x + info.right.x) / 2;
    const cy = (info.left.y + info.right.y) / 2;
    const c = plotCenter(PLOTS[id]);
    const p: Placement = { x: c.x - cx * scale, y: c.y - cy * scale, scale, height: cy * scale };
    this.placements.set(id, p);
    return p;
  }

  private createBuilding(id: BuildingId, index: number): BuildingView {
    const place = this.placement(id);
    const sprite = this.add.image(place.x, place.y, textureKey(spriteKey(id))).setOrigin(0, 0).setScale(place.scale).setDepth(D_SPRITE + index);
    const overlay = this.add.graphics().setDepth(D_HIT + index);
    overlay.setInteractive(new Phaser.Geom.Polygon(this.points(this.hull(id))), Phaser.Geom.Polygon.Contains);
    overlay.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onSelect(id));
    const progress = this.add.graphics().setDepth(D_HUD);
    const badge = this.add.graphics().setDepth(D_HUD);
    const label = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "30px", fontStyle: "bold", color: "#fff8e6" })
      .setOrigin(0.5)
      .setDepth(D_HUD + 1);
    return { sprite, overlay, badge, label, progress, drawnKey: "" };
  }

  private refresh(state: BaseState, now: number): void {
    for (const id of BUILDING_IDS) {
      const view = this.views.get(id);
      if (view === undefined) continue;
      const level = state.levels[id];
      const upgrading = state.queue?.building === id;
      const key = `${level}|${upgrading}|${this.selected === id}`;
      if (key !== view.drawnKey) {
        this.drawBuilding(id, view, level, upgrading);
        view.drawnKey = key;
      }
      this.drawProgress(id, view, state, now);
    }
  }

  private drawBuilding(id: BuildingId, view: BuildingView, level: number, upgrading: boolean): void {
    // Under construction: the sprite is dimmed (and the progress bar runs under it).
    if (upgrading) view.sprite.setTint(UPGRADING_TINT);
    else view.sprite.clearTint();
    const g = view.overlay;
    g.clear();
    const [top, right, bottom, left] = this.footprint(id);
    if (this.selected === id) {
      g.lineStyle(5, 0xfff1b8, 1);
      g.strokePoints(this.points([top, right, bottom, left]), true);
    }
    // Level badge on the plot's front corner, clear of the walls.
    const badgePos = { x: bottom.x, y: bottom.y + 2 };
    view.badge.clear();
    view.badge.fillStyle(0x2b2a24, 0.9);
    view.badge.fillCircle(badgePos.x, badgePos.y, 23);
    view.badge.lineStyle(3, 0xfff1b8, 1);
    view.badge.strokeCircle(badgePos.x, badgePos.y, 23);
    view.label.setPosition(badgePos.x, badgePos.y).setText(String(level));
  }

  private drawProgress(id: BuildingId, view: BuildingView, state: BaseState, now: number): void {
    const g = view.progress;
    g.clear();
    const job = state.queue;
    if (job === null || job.building !== id) return;
    const total = Math.max(1, job.endsAt - job.startedAt);
    const frac = Math.min(1, Math.max(0, (now - job.startedAt) / total));
    const c = plotCenter(PLOTS[id]);
    const w = 70;
    const y = c.y + 18;
    g.fillStyle(0x2b2a24, 0.85);
    g.fillRoundedRect(c.x - w / 2 - 3, y - 3, w + 6, 14, 6);
    g.fillStyle(0xe0b040, 1);
    g.fillRoundedRect(c.x - w / 2, y, Math.max(4, w * frac), 8, 4);
  }

  /** Ground corners of a plot: top, right, bottom, left (world px). */
  private footprint(id: BuildingId): [Vec, Vec, Vec, Vec] {
    const { gx, gy, size } = PLOTS[id];
    return [isoToWorld(gx, gy), isoToWorld(gx + size, gy), isoToWorld(gx + size, gy + size), isoToWorld(gx, gy + size)];
  }

  /** Tap area: the plot diamond extruded up by the sprite's height (a hexagon). */
  private hull(id: BuildingId): Vec[] {
    const [top, right, bottom, left] = this.footprint(id);
    const h = this.placement(id).height * 0.9;
    return [{ x: top.x, y: top.y - h }, { x: right.x, y: right.y - h }, right, bottom, left, { x: left.x, y: left.y - h }];
  }

  private points(ps: readonly Vec[]): Phaser.Math.Vector2[] {
    return ps.map((p) => new Phaser.Math.Vector2(p.x, p.y));
  }
}
