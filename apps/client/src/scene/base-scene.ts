import Phaser from "phaser";
import { BUILDING_IDS, type BaseState, type BuildingId } from "@revolt/rules";
import type { GameStore } from "../state/game-store.ts";
import type { HudInsets } from "../ui/hud-insets.ts";
import { hex, theme } from "../theme/theme.ts";
import { artKeyFor, artUrl, spriteInfo, textureKey } from "../art/art.ts";
import { artPack } from "../art/pack.ts";
import { activeBackground } from "../state/background.ts";
import { baseSpan, fitBase, isoToWorld, PLOTS, placeGround, placeSprite, plotCenter, type Placement, type Vec } from "./iso-layout.ts";

interface BuildingView {
  readonly sprite: Phaser.GameObjects.Image;
  /** Selection outline. */
  readonly overlay: Phaser.GameObjects.Graphics;
  readonly badge: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly progress: Phaser.GameObjects.Graphics;
  drawnKey: string;
}

const ground = (): string => artKeyFor(activeBackground(), "buildings/ground_tile");
const spriteKey = (id: BuildingId): string => artKeyFor(activeBackground(), `buildings/${id}`);
/** Depths: ground, then buildings back to front, then outlines, then badges and bars. */
const D_SPRITE = 10;
const D_OUTLINE = 100;
/** Pixels at least this opaque (0 to 255) count as part of a building when tapped. */
const ALPHA_TAP = 40;
const D_HUD = 200;
const UPGRADING_TINT = 0xb8aa94;

export class BaseScene extends Phaser.Scene {
  private readonly views = new Map<BuildingId, BuildingView>();
  private readonly placements = new Map<BuildingId, Placement>();
  private selected: BuildingId | null = null;
  private viewCenter: Vec = { x: 0, y: 0 };
  /** The HUD room the camera was last fitted to; a sheet opening does not refit the base. */
  private fitted: { top: number; nav: number } | null = null;
  /** Put to sleep by showScene while the map is open; the store is not drawn then, and WAKE redraws it all. */
  private asleep = false;

  constructor(
    private readonly store: GameStore,
    private readonly onSelect: (id: BuildingId | null) => void,
    private readonly insets: HudInsets,
  ) {
    super("base");
  }

  preload(): void {
    for (const key of [ground(), ...BUILDING_IDS.map(spriteKey)]) this.load.image(textureKey(key), artUrl(key));
  }

  create(): void {
    this.cameras.main.setBackgroundColor(hex(theme.ground.base));
    this.drawGround();
    // Draw back-to-front so nearer buildings overlap farther ones.
    const order = [...BUILDING_IDS].sort((a, b) => plotCenter(PLOTS[a]).y - plotCenter(PLOTS[b]).y);
    order.forEach((id, i) => this.views.set(id, this.createBuilding(id, i)));
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());
    // The HUD header or nav bar changed size (e.g. a third march row, or a new home-indicator inset).
    const unsubscribeInsets = this.insets.subscribe(() => {
      const now = this.insets.get();
      if (this.fitted === null || Math.abs(now.top - this.fitted.top) >= 1 || Math.abs(now.nav - this.fitted.nav) >= 1) this.fitCamera();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeInsets);
    // A tap on empty ground clears the selection.
    this.input.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onSelect(null);
    });
    const unsubscribe = this.store.subscribe((state, now) => {
      if (!this.asleep) this.refresh(state, now);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.on(Phaser.Scenes.Events.SLEEP, () => {
      this.asleep = true;
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.asleep = false;
      this.refresh(this.store.state(), this.store.now());
    });
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
    // Game size is in device pixels; the HUD room is in CSS pixels. The base keeps clear of the nav bar,
    // not of an open sheet: it must not shrink when a building panel opens.
    const room = this.insets.get();
    this.fitted = { top: room.top, nav: room.nav };
    const px = this.scale.displayScale.y;
    // Fit the buildings and the whole ground diamond: a cropped slab reads as a cut-off edge, so its corners stay on screen.
    const span = baseSpan(BUILDING_IDS.map((id) => ({ x: this.placement(id).x, width: spriteInfo(artPack.buildings[id]).w * this.placement(id).scale })));
    const fit = fitBase(width, height, px, room, span);
    cam.setZoom(fit.zoom);
    const zoom = fit.zoom;
    this.viewCenter = fit.center;
    cam.centerOn(this.viewCenter.x, this.viewCenter.y);
    // Rasterize level numbers at the on-screen scale so they stay crisp when zoomed in.
    const textResolution = Math.max(1, Math.ceil(zoom));
    for (const view of this.views.values()) view.label.setResolution(textResolution);
  }

  /** The painted ground slab, stretched over the whole grid diamond (its rim shows below the near edges). */
  private drawGround(): void {
    const info = spriteInfo(ground());
    const g = placeGround(info);
    this.add.image(g.x, g.y, textureKey(ground())).setOrigin(0, 0).setScale(g.sx, g.sy).setDepth(0);
  }

  private placement(id: BuildingId): Placement {
    const cached = this.placements.get(id);
    if (cached !== undefined) return cached;
    const p = placeSprite(PLOTS[id], spriteInfo(artPack.buildings[id]));
    this.placements.set(id, p);
    return p;
  }

  private createBuilding(id: BuildingId, index: number): BuildingView {
    const place = this.placement(id);
    const sprite = this.add.image(place.x, place.y, textureKey(artPack.buildings[id])).setOrigin(0, 0).setScale(place.scale).setDepth(D_SPRITE + index);
    // Taps hit the painted pixels, so where sprites overlap the one drawn on top (the nearer building) wins.
    sprite.setInteractive({ pixelPerfect: true, alphaTolerance: ALPHA_TAP });
    sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onSelect(id));
    const overlay = this.add.graphics().setDepth(D_OUTLINE + index);
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
    view.badge.fillStyle(theme.ink.base, 0.9);
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
    const y = c.y - 6;
    g.fillStyle(theme.ink.base, 0.85);
    g.fillRoundedRect(c.x - w / 2 - 3, y - 3, w + 6, 14, 6);
    g.fillStyle(theme.accent.gold, 1);
    g.fillRoundedRect(c.x - w / 2, y, Math.max(4, w * frac), 8, 4);
  }

  /** Ground corners of a plot: top, right, bottom, left (world px). */
  private footprint(id: BuildingId): [Vec, Vec, Vec, Vec] {
    const { gx, gy, size } = PLOTS[id];
    return [isoToWorld(gx, gy), isoToWorld(gx + size, gy), isoToWorld(gx + size, gy + size), isoToWorld(gx, gy + size)];
  }

  private points(ps: readonly Vec[]): Phaser.Math.Vector2[] {
    return ps.map((p) => new Phaser.Math.Vector2(p.x, p.y));
  }
}
