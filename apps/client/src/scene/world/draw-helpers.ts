import Phaser from "phaser";
import { theme } from "../../theme/theme.ts";
import type { Vec } from "../iso-layout.ts";
import { tileToWorld, TILE_H, TILE_W } from "../world-layout.ts";
import type { TileRef } from "./world-frame.ts";

/** Alliance HQs: a pennant, teal for the player's own alliance, violet for the others. */
export const HQ_OWN = theme.alliance.own;
export const HQ_OTHER = theme.alliance.other;

export const GOLD = theme.accent.gold;
export const PAPER = theme.accent.paper;

/** Phaser's typings want `Vector2`s for polygon points; markers are few, so allocating them is fine. */
export const poly = (points: readonly Vec[]): Phaser.Math.Vector2[] => points.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/** Strokes the outline of one tile's diamond. `width` is in world pixels. */
export function outlineTile(g: Phaser.GameObjects.Graphics, t: TileRef, color: number, width: number): void {
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
