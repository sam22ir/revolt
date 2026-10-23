import Phaser from "phaser";
import { decalsTexture } from "../../art/art.ts";
import { tileToWorld, TILE_W, screenToWorld, type TileRange, type View } from "../world-layout.ts";
import { CELL_H, CELL_W, cellGrid, cellRect, cellsInRect, RIM, tilesInRect, type CellGrid, type CellRange, type WorldRect } from "./cell-grid.ts";
import { poly } from "./draw-helpers.ts";
import { cellTransform, fieldPixels, GREEN_FROM, greenPixels } from "./ground-field.ts";
import { type Decal } from "./ground-decals.ts";
import { makeGreenGrain } from "./ground-grain.ts";

/** Texture pixels per world px. Half resolution: the ground is soft by design, and this is a quarter of a full-size bake. */
export const BAKE_SCALE = 0.5;
/** Cells baked per frame at most, so a fresh map fills in over a few frames instead of one long stall. */
export const BAKE_PER_FRAME = 1;

const RIM_TOP = 0x4a3a2c;
const RIM_SIDE = 0x3a2d22;
/** Strength of the green wash over fertile ground. */
const GREEN_ALPHA = 0.6;
/** Dev only: bake time is averaged over this many cells and logged. */
const TIMING_CELLS = 20;

let instances = 0;

/** The steps of one cell's bake, in order, for the dev timing log. */
type BakeLayer = "field" | "green" | "decals" | "upload" | "features";
const BAKE_LAYERS: readonly BakeLayer[] = ["field", "green", "decals", "upload", "features"];

/** What a bake draws: the map size, the colour and fertility of each tile, the decals, and the features that lie on the ground. */
export interface BakeSource {
  readonly size: number;
  /** The ground colour of each tile, 0xRRGGBB, row-major. */
  readonly colours: Uint32Array;
  readonly fertility: Float32Array;
  readonly decals: readonly Decal[];
  /** Draws the features that touch `range` into `g` (world px). */
  readonly paintFeatures: (g: Phaser.GameObjects.Graphics, range: TileRange) => void;
}

interface Cell {
  readonly key: string;
  readonly image: Phaser.GameObjects.Image;
  readonly texture: Phaser.Textures.DynamicTexture;
  baked: boolean;
}

/** The world rectangle the screen shows, in world px. */
const viewRect = (view: View): WorldRect => {
  const a = screenToWorld(view, 0, 0);
  const b = screenToWorld(view, view.width, view.height);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
};

const expand = (r: CellRange, n: number, grid: CellGrid): CellRange => ({
  c0: Math.max(0, r.c0 - n),
  c1: Math.min(grid.cols - 1, r.c1 + n),
  r0: Math.max(0, r.r0 - n),
  r1: Math.min(grid.rows - 1, r.r1 + n),
});

const within = (r: CellRange, col: number, row: number): boolean => col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1;

/** A plain canvas of the given size, for scratch drawing. */
const scratchCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/**
 * The ground and roads as a grid of baked textures (cells). Each cell is painted once into a dynamic texture and shown as a
 * plain image, so an idle frame costs no drawing. Cells bake lazily: the ones near the view first, at most BAKE_PER_FRAME a
 * frame. Cells that are off screen are hidden, not destroyed.
 *
 * A bake paints the smooth colour field (one pixel per tile, drawn with the isometric transform, so colours blend between tile
 * centres), a green wash over fertile ground and the decals, all into one scratch canvas. That canvas is then uploaded to the
 * cell's texture once, with the rim below it and the features (roads, markers) above it. The fine grain is not baked: it is a
 * runtime overlay (ground-detail.ts).
 */
export class GroundBake {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly rim: Phaser.GameObjects.Graphics;
  private readonly cellCanvas = scratchCanvas(Math.ceil(CELL_W * BAKE_SCALE), Math.ceil(CELL_H * BAKE_SCALE));
  private readonly cctx: CanvasRenderingContext2D;
  private readonly greenCanvas = scratchCanvas(Math.ceil(CELL_W * BAKE_SCALE), Math.ceil(CELL_H * BAKE_SCALE));
  private readonly gctx: CanvasRenderingContext2D;
  private readonly scratchKey: string;
  private readonly scratchTexture: Phaser.Textures.CanvasTexture | null;
  private grain: HTMLCanvasElement | null = null;
  private fieldCanvas: HTMLCanvasElement | null = null;
  private greenField: HTMLCanvasElement | null = null;
  private source: BakeSource | null = null;
  private grid: CellGrid | null = null;
  private cells: Cell[] = [];
  private generation = 0;
  private timedCells = 0;
  private lastMark = 0;
  private readonly layerMs: Record<BakeLayer, number> = { field: 0, green: 0, decals: 0, upload: 0, features: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    // Not on the display list: it is only ever drawn into a texture, so the scene never renders it.
    this.g = scene.make.graphics({}, false).setScale(BAKE_SCALE);
    this.rim = scene.make.graphics({}, false).setScale(BAKE_SCALE);
    this.cctx = this.cellCanvas.getContext("2d") ?? throwNoCanvas();
    this.gctx = this.greenCanvas.getContext("2d") ?? throwNoCanvas();
    this.cctx.imageSmoothingEnabled = true;
    this.cctx.imageSmoothingQuality = "high";
    this.scratchKey = `ground-scratch-${++instances}`;
    this.scratchTexture = scene.textures.addCanvas(this.scratchKey, this.cellCanvas);
    // Textures outlive the scene, so the cells and the scratch texture are dropped with it or they would pile up on every rebuild.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroyCells();
      scene.textures.remove(this.scratchKey);
    });
  }

  /** Drops every cell and lays out a fresh grid for `source`; the cells bake from `update`. */
  reset(source: BakeSource): void {
    this.destroyCells();
    this.generation++;
    this.source = source;
    this.fieldCanvas = scratchCanvas(source.size, source.size);
    this.greenField = scratchCanvas(source.size, source.size);
    this.fieldCanvas.getContext("2d")?.putImageData(imageOf(this.fieldCanvas, source.size, fieldPixels(source.colours, source.size)), 0, 0);
    this.greenField.getContext("2d")?.putImageData(imageOf(this.greenField, source.size, greenPixels(source.fertility, source.size)), 0, 0);
    const grid = cellGrid(source.size);
    this.grid = grid;
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const rect = cellRect(grid, col, row);
        const key = `ground-cell-${this.generation}-${col}-${row}`;
        const texture = this.scene.textures.addDynamicTexture(key, Math.ceil(CELL_W * BAKE_SCALE), Math.ceil(CELL_H * BAKE_SCALE));
        if (texture === null) continue;
        const image = this.scene.add.image(rect.x, rect.y, key).setOrigin(0, 0).setScale(1 / BAKE_SCALE).setDepth(0).setVisible(false);
        this.cells.push({ key, image, texture, baked: false });
      }
    }
  }

  /** Bakes the cells near `view` within the per-frame budget, and shows the baked cells near it. */
  update(view: View): void {
    const { grid } = this;
    if (this.source === null || grid === null) return;
    const core = cellsInRect(grid, viewRect(view));
    const near = expand(core, 1, grid);
    let budget = this.bakeRange(core, BAKE_PER_FRAME, grid);
    this.bakeRange(near, budget, grid);
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const cell = this.cells[row * grid.cols + col];
        if (cell === undefined) continue;
        const show = cell.baked && within(near, col, row);
        if (cell.image.visible !== show) cell.image.setVisible(show);
      }
    }
  }

  /** Bakes unbaked cells in `r` while the budget lasts; returns what is left. */
  private bakeRange(r: CellRange, budget: number, grid: CellGrid): number {
    let left = budget;
    for (let row = r.r0; row <= r.r1 && left > 0; row++) {
      for (let col = r.c0; col <= r.c1 && left > 0; col++) {
        const cell = this.cells[row * grid.cols + col];
        if (cell === undefined || cell.baked) continue;
        this.bakeCell(cell, col, row);
        left--;
      }
    }
    return left;
  }

  /** Paints one cell into its texture: the field, green wash and decals (scratch canvas), then the rim and features around them. */
  private bakeCell(cell: Cell, col: number, row: number): void {
    const source = this.source;
    const grid = this.grid;
    if (source === null || grid === null || this.fieldCanvas === null || this.scratchTexture === null) return;
    this.mark("start");
    const rect = cellRect(grid, col, row);
    const tiles = tilesInRect(rect, source.size);
    const g = this.g;
    const cctx = this.cctx;
    const S = BAKE_SCALE;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, this.cellCanvas.width, this.cellCanvas.height);
    cctx.setTransform(...cellTransform(S, rect.x, rect.y));
    cctx.drawImage(this.fieldCanvas, 0, 0);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    this.mark("field");
    if (anyFertile(source.fertility, source.size, tiles)) this.paintGreen(rect);
    this.mark("green");
    this.paintTop(rect, source);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.globalAlpha = 1;
    cctx.globalCompositeOperation = "source-over";
    this.scratchTexture.refresh();
    // The rim, the scratch canvas (the field and everything on it) and the features, in that order, into the cell's texture.
    // Draw calls on a texture are buffered and run at render(), so each graphics object keeps its commands until then.
    const offX = -rect.x * BAKE_SCALE, offY = -rect.y * BAKE_SCALE;
    cell.texture.clear();
    this.rim.clear();
    paintRim(this.rim, source.size);
    cell.texture.draw(this.rim, offX, offY);
    // A texture key is drawn by its centre, so this puts the scratch canvas at the texture's top-left corner.
    cell.texture.draw(this.scratchKey, this.cellCanvas.width / 2, this.cellCanvas.height / 2);
    this.mark("upload");
    g.clear();
    source.paintFeatures(g, tiles);
    cell.texture.draw(g, offX, offY);
    cell.texture.render();
    g.clear();
    this.rim.clear();
    cell.baked = true;
    this.mark("features");
    this.logTiming();
  }

  /** The green wash: a feathered green grain, weighted by the fertility field, laid over the field at GREEN_ALPHA. */
  private paintGreen(rect: WorldRect): void {
    const grain = this.grainTiles();
    const gctx = this.gctx;
    const S = BAKE_SCALE;
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = "source-over";
    gctx.clearRect(0, 0, this.greenCanvas.width, this.greenCanvas.height);
    gctx.setTransform(S, 0, 0, S, -S * rect.x, -S * rect.y);
    const pattern = gctx.createPattern(grain, "repeat");
    if (pattern !== null) {
      gctx.fillStyle = pattern;
      gctx.fillRect(rect.x, rect.y, CELL_W, CELL_H);
    }
    gctx.globalCompositeOperation = "destination-in";
    gctx.setTransform(...cellTransform(S, rect.x, rect.y));
    if (this.greenField !== null) gctx.drawImage(this.greenField, 0, 0);
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = "source-over";
    const cctx = this.cctx;
    cctx.globalAlpha = GREEN_ALPHA;
    cctx.drawImage(this.greenCanvas, 0, 0);
    cctx.globalAlpha = 1;
  }

  /** Stamps the decals that reach this cell, each as a feathered diamond of its frame from the decal atlas. */
  private paintDecals(rect: WorldRect, decals: readonly Decal[]): void {
    const sheet = this.scene.textures.exists(decalsTexture) ? this.scene.textures.get(decalsTexture).getSourceImage() : null;
    if (!(sheet instanceof HTMLImageElement || sheet instanceof HTMLCanvasElement)) return;
    const cctx = this.cctx;
    const S = BAKE_SCALE;
    for (const d of decals) {
      const frame = this.scene.textures.getFrame(decalsTexture, String(d.frame));
      if (frame === null || frame === undefined) continue;
      const c = tileToWorld(d.x, d.y);
      const w = d.scale * TILE_W, h = w / 2;
      // Skip stamps that cannot reach this cell.
      if (c.x + w / 2 < rect.x || c.x - w / 2 > rect.x + CELL_W || c.y + h / 2 < rect.y || c.y - h / 2 > rect.y + CELL_H) continue;
      cctx.save();
      cctx.setTransform(S, 0, 0, S, -S * rect.x, -S * rect.y);
      cctx.globalAlpha = d.alpha;
      cctx.translate(c.x, c.y);
      if (d.flip) cctx.scale(-1, 1);
      cctx.drawImage(sheet, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, -w / 2, -h / 2, w, h);
      cctx.restore();
    }
  }

  /** The decals, clipped to the map's top face so no stamp floats past the edge onto the rim or the background. */
  private paintTop(rect: WorldRect, source: BakeSource): void {
    const cctx = this.cctx;
    const S = BAKE_SCALE;
    cctx.save();
    cctx.setTransform(S, 0, 0, S, -S * rect.x, -S * rect.y);
    cctx.beginPath();
    const corners = [tileToWorld(0, 0), tileToWorld(source.size, 0), tileToWorld(source.size, source.size), tileToWorld(0, source.size)];
    corners.forEach((p, i) => (i === 0 ? cctx.moveTo(p.x, p.y) : cctx.lineTo(p.x, p.y)));
    cctx.closePath();
    cctx.clip();
    this.paintDecals(rect, source.decals);
    this.mark("decals");
    cctx.restore();
  }

  private grainTiles(): HTMLCanvasElement {
    this.grain ??= makeGreenGrain();
    return this.grain;
  }

  /** Dev only: the per-layer clock for one cell. Does nothing in production builds. */
  private mark(layer: BakeLayer | "start"): void {
    if (!import.meta.env.DEV) return;
    const now = performance.now();
    if (layer === "start") this.lastMark = now;
    else {
      this.layerMs[layer] += now - this.lastMark;
      this.lastMark = now;
    }
  }

  /** Dev only: every TIMING_CELLS cells, logs the average time per layer, in ms per cell. */
  private logTiming(): void {
    if (!import.meta.env.DEV) return;
    this.timedCells++;
    if (this.timedCells < TIMING_CELLS) return;
    const avg = (layer: BakeLayer): string => (this.layerMs[layer] / this.timedCells).toFixed(2);
    const total = BAKE_LAYERS.reduce((sum, l) => sum + this.layerMs[l], 0) / this.timedCells;
    console.debug(`[ground] bake ${total.toFixed(2)} ms per cell (last ${this.timedCells}): ${BAKE_LAYERS.map((l) => `${l} ${avg(l)}`).join(", ")}`);
    for (const l of BAKE_LAYERS) this.layerMs[l] = 0;
    this.timedCells = 0;
  }

  private destroyCells(): void {
    for (const cell of this.cells) {
      cell.image.destroy();
      this.scene.textures.remove(cell.key);
    }
    this.cells = [];
  }
}

/** Whether any tile in `tiles` is fertile enough to take the green wash. */
const anyFertile = (fertility: Float32Array, size: number, tiles: TileRange): boolean => {
  for (let x = tiles.x0; x <= tiles.x1; x++) for (let y = tiles.y0; y <= tiles.y1; y++) if ((fertility[y * size + x] ?? 0) > GREEN_FROM) return true;
  return false;
};

/** ImageData of a size×size canvas holding the given RGBA bytes. */
const imageOf = (canvas: HTMLCanvasElement, size: number, bytes: Uint8ClampedArray): ImageData => {
  const img = (canvas.getContext("2d") ?? throwNoCanvas()).createImageData(size, size);
  img.data.set(bytes);
  return img;
};

const throwNoCanvas = (): never => {
  throw new Error("2D canvas is not available");
};

/** The slab edge below the map's two near sides, so the land has some thickness. Drawn into every cell; the texture clips it. */
const paintRim = (g: Phaser.GameObjects.Graphics, size: number): void => {
  const left = tileToWorld(0, size);
  const bottom = tileToWorld(size, size);
  const right = tileToWorld(size, 0);
  g.fillStyle(RIM_TOP, 1);
  g.fillPoints(poly([left, bottom, { x: bottom.x, y: bottom.y + RIM }, { x: left.x, y: left.y + RIM }]), true);
  g.fillStyle(RIM_SIDE, 1);
  g.fillPoints(poly([bottom, right, { x: right.x, y: right.y + RIM }, { x: bottom.x, y: bottom.y + RIM }]), true);
};
