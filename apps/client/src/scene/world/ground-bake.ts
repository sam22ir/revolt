import Phaser from "phaser";
import { hash01 } from "../terrain-props.ts";
import { tileToWorld, TILE_H, TILE_W, screenToWorld, type TileRange, type View } from "../world-layout.ts";
import { CELL_H, CELL_W, cellGrid, cellRect, cellsInRect, RIM, tilesInRect, type CellGrid, type CellRange, type WorldRect } from "./cell-grid.ts";
import { poly } from "./draw-helpers.ts";

/** Texture pixels per world px. Half resolution: the ground is soft by design, and this is a quarter of a full-size bake. */
export const BAKE_SCALE = 0.5;
/** Cells baked per frame at most, so a fresh map fills in over a few frames instead of one long stall. */
export const BAKE_PER_FRAME = 2;

/** Share of the diamond's size the ground overdraws, so neighbouring tiles overlap and leave no hairline seams. */
const SOFT_BLEED = 1.06;
/** Grain specks per tile and their half-size in world px. */
const SPECKS = 3;
const SPECK = 2;
const RIM_TOP = 0x4a3a2c;
const RIM_SIDE = 0x3a2d22;

/** What a bake draws: the map size, the colour of each tile, and the features that lie on the ground. */
export interface BakeSource {
  readonly size: number;
  /** The ground colour of each tile, 0xRRGGBB, row-major. */
  readonly colours: Uint32Array;
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

/**
 * The ground and roads as a grid of baked textures (cells). Each cell is painted once into a dynamic texture and shown as a
 * plain image, so an idle frame costs no drawing. Cells bake lazily: the ones near the view first, at most BAKE_PER_FRAME a
 * frame. Cells that are off screen are hidden, not destroyed.
 */
export class GroundBake {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly quad: [Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2, Phaser.Math.Vector2] = [
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
    new Phaser.Math.Vector2(),
  ];
  private source: BakeSource | null = null;
  private grid: CellGrid | null = null;
  private cells: Cell[] = [];
  private generation = 0;

  constructor(private readonly scene: Phaser.Scene) {
    // Not on the display list: it is only ever drawn into a texture, so the scene never renders it.
    this.g = scene.make.graphics({}, false).setScale(BAKE_SCALE);
  }

  /** Drops every cell and lays out a fresh grid for `source`; the cells bake from `update`. */
  reset(source: BakeSource): void {
    this.destroyCells();
    this.generation++;
    this.source = source;
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

  /** Paints one cell: the rim, every tile that can touch it, then the features, into its texture. */
  private bakeCell(cell: Cell, col: number, row: number): void {
    const source = this.source;
    const grid = this.grid;
    if (source === null || grid === null) return;
    const rect = cellRect(grid, col, row);
    const tiles = tilesInRect(rect, source.size);
    const g = this.g;
    g.clear();
    paintRim(g, source.size);
    for (let x = tiles.x0; x <= tiles.x1; x++) {
      for (let y = tiles.y0; y <= tiles.y1; y++) {
        paintGroundTile(g, this.quad, x, y, source.colours[y * source.size + x] ?? 0);
      }
    }
    source.paintFeatures(g, tiles);
    // The graphics is drawn into the texture now and not again: commands are buffered until render().
    cell.texture.clear();
    cell.texture.draw(g, -rect.x * BAKE_SCALE, -rect.y * BAKE_SCALE);
    cell.texture.render();
    g.clear();
    cell.baked = true;
  }

  private destroyCells(): void {
    for (const cell of this.cells) {
      cell.image.destroy();
      this.scene.textures.remove(cell.key);
    }
    this.cells = [];
  }
}

/** A tile's soft diamond and its grain specks, in world px (the tile's top corner is tileToWorld(x, y)). */
const paintGroundTile = (g: Phaser.GameObjects.Graphics, q: Phaser.Math.Vector2[], x: number, y: number, colour: number): void => {
  const p = tileToWorld(x, y);
  const hw = (TILE_W / 2) * SOFT_BLEED;
  const hh = (TILE_H / 2) * SOFT_BLEED;
  const cx = p.x;
  const cy = p.y + TILE_H / 2;
  g.fillStyle(colour, 1);
  q[0]!.set(cx, cy - hh);
  q[1]!.set(cx + hw, cy);
  q[2]!.set(cx, cy + hh);
  q[3]!.set(cx - hw, cy);
  g.fillPoints(q, true);
  for (let i = 0; i < SPECKS; i++) {
    // A point inside the diamond: |u| + |v| < 1.
    const u = (hash01(x, y, 60 + i * 3) - 0.5) * 1.4;
    const v = (hash01(x, y, 61 + i * 3) - 0.5) * 1.4;
    if (Math.abs(u) + Math.abs(v) > 0.9) continue;
    g.fillStyle(hash01(x, y, 62 + i * 3) < 0.5 ? 0x000000 : 0xffffff, 0.07);
    g.fillRect(cx + u * TILE_W - SPECK, cy + v * TILE_H - SPECK / 2, SPECK * 2, SPECK);
  }
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
