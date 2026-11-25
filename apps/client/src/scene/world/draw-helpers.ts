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

/**
 * Strokes the outline of a square of `span` x `span` tiles whose top corner tile is `t`, shrunk about its centre by `fitX`
 * across and `fitY` up and down (1 = the full square). `width` is in world pixels.
 */
export function outlineTile(g: Phaser.GameObjects.Graphics, t: TileRef, color: number, width: number, span = 1, fitX = 1, fitY = 1): void {
  const p = tileToWorld(t.x, t.y);
  const hw = (TILE_W * span * fitX) / 2;
  const hh = (TILE_H * span * fitY) / 2;
  const cy = p.y + (TILE_H * span) / 2;
  g.lineStyle(width, color, 1);
  g.strokePoints(
    poly([
      { x: p.x, y: cy - hh },
      { x: p.x + hw, y: cy },
      { x: p.x, y: cy + hh },
      { x: p.x - hw, y: cy },
    ]),
    true,
  );
}
