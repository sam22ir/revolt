import Phaser from "phaser";
import { BUILDING_IDS, type BaseState, type BuildingId } from "@revolt/rules";
import type { GameStore } from "../state/game-store.ts";
import { BUILDING_STYLES } from "./building-style.ts";
import {
  GRID_SIZE,
  isoToWorld,
  mapCenter,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  PLOTS,
  plotCenter,
  type Vec,
} from "./iso-layout.ts";

interface BuildingView {
  readonly body: Phaser.GameObjects.Graphics;
  readonly badge: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly progress: Phaser.GameObjects.Graphics;
  drawnKey: string;
}

/** Room reserved for the DOM HUD above the map, in CSS pixels. */
const HUD_TOP = 120;
const HUD_BOTTOM = 40;

export class BaseScene extends Phaser.Scene {
  private readonly views = new Map<BuildingId, BuildingView>();
  private selected: BuildingId | null = null;
  private viewCenter: Vec = { x: 0, y: 0 };

  constructor(
    private readonly store: GameStore,
    private readonly onSelect: (id: BuildingId | null) => void,
  ) {
    super("base");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#3d4a3a");
    this.drawGround();
    // Draw back-to-front so nearer buildings overlap farther ones.
    const order = [...BUILDING_IDS].sort((a, b) => plotCenter(PLOTS[a]).y - plotCenter(PLOTS[b]).y);
    for (const id of order) this.views.set(id, this.createBuilding(id));
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

  /** Screen (CSS px) position of a building's center, for tests and tooling. */
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

  private buildingCenter(id: BuildingId): Vec {
    const c = plotCenter(PLOTS[id]);
    return { x: c.x, y: c.y - BUILDING_STYLES[id].height / 2 };
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

  private drawGround(): void {
    const g = this.add.graphics();
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gy = 0; gy < GRID_SIZE; gy++) {
        const shade = (gx + gy) % 2 === 0 ? 0x8b7d55 : 0x83764f;
        g.fillStyle(shade, 1);
        g.fillPoints(this.diamond(gx, gy, 1), true);
        g.lineStyle(1, 0x6f6343, 0.5);
        g.strokePoints(this.diamond(gx, gy, 1), true);
      }
    }
    // Map edge: a thin darker rim gives the plateau some depth.
    const left = isoToWorld(0, GRID_SIZE);
    const bottom = isoToWorld(GRID_SIZE, GRID_SIZE);
    const right = isoToWorld(GRID_SIZE, 0);
    const depth = 18;
    g.fillStyle(0x5e533a, 1);
    g.fillPoints(this.points([left, bottom, { x: bottom.x, y: bottom.y + depth }, { x: left.x, y: left.y + depth }]), true);
    g.fillStyle(0x4c4330, 1);
    g.fillPoints(this.points([bottom, right, { x: right.x, y: right.y + depth }, { x: bottom.x, y: bottom.y + depth }]), true);
    // Scattered rocks and shrubs for a mountain-camp feel.
    const props: readonly [number, number, number][] = [
      [0.4, 0.5, 0x6b6b5f], [3.0, 0.3, 0x55703f], [0.3, 2.6, 0x55703f], [5.6, 2.8, 0x6b6b5f],
      [5.7, 0.4, 0x55703f], [5.6, 5.5, 0x6b6b5f], [3.4, 3.2, 0x6b6b5f], [1.3, 5.7, 0x55703f],
    ];
    for (const [gx, gy, color] of props) {
      const p = isoToWorld(gx, gy);
      g.fillStyle(color, 1);
      g.fillEllipse(p.x, p.y, 22, 12);
    }
  }

  private createBuilding(id: BuildingId): BuildingView {
    const body = this.add.graphics();
    body.setInteractive(new Phaser.Geom.Polygon(this.points(this.hull(id, 1))), Phaser.Geom.Polygon.Contains);
    body.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onSelect(id));
    const progress = this.add.graphics();
    const badge = this.add.graphics();
    const label = this.add
      .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "30px", fontStyle: "bold", color: "#fff8e6" })
      .setOrigin(0.5);
    return { body, badge, label, progress, drawnKey: "" };
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
    const style = BUILDING_STYLES[id];
    const plot = PLOTS[id];
    const h = this.wallHeight(id, level);
    const g = view.body;
    g.clear();
    // Hit area follows the drawn outline, so taller neighbours never steal taps.
    const hitArea: unknown = g.input?.hitArea;
    if (hitArea instanceof Phaser.Geom.Polygon) hitArea.setTo(this.points(this.hull(id, level)));
    const [top, right, bottom, left] = this.footprint(id);
    const up = (p: Vec): Vec => ({ x: p.x, y: p.y - h });
    // Shadow, then walls, then roof.
    g.fillStyle(0x000000, 0.18);
    g.fillPoints(this.points([right, bottom, left, { x: bottom.x, y: bottom.y + 10 }].map((p) => ({ x: p.x + 8, y: p.y + 4 }))), true);
    g.fillStyle(style.left, 1);
    g.fillPoints(this.points([left, bottom, up(bottom), up(left)]), true);
    g.fillStyle(style.right, 1);
    g.fillPoints(this.points([bottom, right, up(right), up(bottom)]), true);
    g.fillStyle(style.top, 1);
    g.fillPoints(this.points([up(top), up(right), up(bottom), up(left)]), true);
    g.lineStyle(2, 0x2b2a24, 0.6);
    g.strokePoints(this.points(this.hull(id, level)), true);
    this.drawDetail(g, id, plot.size, { top: up(top), right: up(right), bottom: up(bottom), left: up(left) });
    if (upgrading) {
      // Scaffolding stripes while under construction.
      g.lineStyle(3, 0xe0b040, 0.9);
      for (let i = 1; i <= 3; i++) {
        const tt = i / 4;
        const a = this.lerp(left, bottom, tt);
        g.lineBetween(a.x, a.y, a.x, a.y - h);
        const b = this.lerp(bottom, right, tt);
        g.lineBetween(b.x, b.y, b.x, b.y - h);
      }
    }
    if (this.selected === id) {
      g.lineStyle(4, 0xfff1b8, 1);
      g.strokePoints(this.points(this.hull(id, level)), true);
    }
    // Level badge above the roof.
    const badgePos = { x: up(top).x, y: up(top).y - 10 };
    view.badge.clear();
    view.badge.fillStyle(0x2b2a24, 0.9);
    view.badge.fillCircle(badgePos.x, badgePos.y, 23);
    view.badge.lineStyle(3, 0xfff1b8, 1);
    view.badge.strokeCircle(badgePos.x, badgePos.y, 23);
    view.label.setPosition(badgePos.x, badgePos.y).setText(String(level));
  }

  private drawDetail(g: Phaser.GameObjects.Graphics, id: BuildingId, size: number, roof: Record<"top" | "right" | "bottom" | "left", Vec>): void {
    const mid = this.lerp(roof.top, roof.bottom, 0.5);
    if (id === "hq") {
      // Pennant on a pole.
      g.lineStyle(3, 0x3a3226, 1);
      g.lineBetween(mid.x, mid.y, mid.x, mid.y - 46);
      g.fillStyle(0xb5402f, 1);
      g.fillTriangle(mid.x, mid.y - 46, mid.x + 26, mid.y - 39, mid.x, mid.y - 32);
    } else if (id === "farm") {
      // Crop rows on the roof plane.
      g.lineStyle(3, 0x5d7a2e, 1);
      for (let i = 1; i < 5; i++) {
        const a = this.lerp(roof.left, roof.top, i / 5);
        const b = this.lerp(roof.bottom, roof.right, i / 5);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    } else if (id === "armory") {
      // Crates on the roof.
      g.fillStyle(0x7a5a32, 1);
      g.fillRect(mid.x - 18, mid.y - 16, 16, 14);
      g.fillRect(mid.x + 2, mid.y - 12, 16, 12);
    } else if (id === "barracks") {
      // Rows of bunks on the roof.
      g.fillStyle(0x4f3a26, 1);
      for (let i = 0; i < 3; i++) g.fillRect(mid.x - 15, mid.y - 14 + i * 7, 30, 4);
    } else {
      // Coin stacks.
      g.fillStyle(0xf2d65c, 1);
      g.fillEllipse(mid.x - 8, mid.y - 4, 16 * (size / 1.5), 8);
      g.fillEllipse(mid.x + 9, mid.y - 2, 14 * (size / 1.5), 7);
      g.fillEllipse(mid.x - 8, mid.y - 10, 16 * (size / 1.5), 8);
    }
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

  private wallHeight(id: BuildingId, level: number): number {
    return BUILDING_STYLES[id].height + (level - 1) * 3;
  }

  /** Ground corners of a plot: top, right, bottom, left (world px). */
  private footprint(id: BuildingId): [Vec, Vec, Vec, Vec] {
    const { gx, gy, size } = PLOTS[id];
    const inset = 0.12;
    return [
      isoToWorld(gx + inset, gy + inset),
      isoToWorld(gx + size - inset, gy + inset),
      isoToWorld(gx + size - inset, gy + size - inset),
      isoToWorld(gx + inset, gy + size - inset),
    ];
  }

  /** Outline of the extruded box: used for the hit area and the selection ring. */
  private hull(id: BuildingId, level: number): Vec[] {
    const [top, right, bottom, left] = this.footprint(id);
    const h = this.wallHeight(id, level);
    return [{ x: top.x, y: top.y - h }, { x: right.x, y: right.y - h }, right, bottom, left, { x: left.x, y: left.y - h }];
  }

  private diamond(gx: number, gy: number, size: number): Phaser.Math.Vector2[] {
    return this.points([isoToWorld(gx, gy), isoToWorld(gx + size, gy), isoToWorld(gx + size, gy + size), isoToWorld(gx, gy + size)]);
  }

  private points(ps: readonly Vec[]): Phaser.Math.Vector2[] {
    return ps.map((p) => new Phaser.Math.Vector2(p.x, p.y));
  }

  private lerp(a: Vec, b: Vec, t: number): Vec {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}
