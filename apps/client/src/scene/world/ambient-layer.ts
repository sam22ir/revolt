import type Phaser from "phaser";
import { hash01 } from "../terrain-props.ts";
import { tileCenter, TILE_H, TILE_W } from "../world-layout.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** Below this zoom the map is too small for smoke and dust to read; same threshold as the painted ground. */
const AMBIENT_ZOOM = 0.3;
/** Redraws at most this often: the motion is slow, and a lower rate spares phone batteries. */
const FRAME_MS = 66;
/** Smoke sources drawn at once; the nearest ones in view win. */
const MAX_SOURCES = 12;
const PUFFS = 4;
/** Seconds one puff takes to rise and fade. */
const PUFF_S = 3.2;
const SMOKE = 0x8f877d;

/**
 * Small signs of life over the map (GDD §7): smoke rising from bases and camps. Purely cosmetic and client-side, so it runs on the display clock, not game time. Off when the player asks
 * for reduced motion. Depth 3.5: over the markers, under the labels.
 */
export class AmbientLayer implements WorldLayer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private last = 0;
  private drawn = false;
  private readonly reduced: MediaQueryList | null;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(3.5);
    this.reduced = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }

  invalidate(): void {
    this.last = 0;
  }

  paint(frame: WorldFrame): void {
    const g = this.graphics;
    if (this.reduced?.matches === true || frame.view.zoom < AMBIENT_ZOOM) {
      if (this.drawn) g.clear();
      this.drawn = false;
      return;
    }
    const clock = performance.now();
    if (clock - this.last < FRAME_MS) return;
    this.last = clock;
    this.drawn = true;
    g.clear();
    const t = clock / 1000;
    const { snap, range } = frame;
    const k = Math.max(1, 16 / (frame.view.zoom * TILE_H));
    const inRange = (p: { x: number; y: number }): boolean => p.x >= range.x0 && p.x <= range.x1 && p.y >= range.y0 && p.y <= range.y1;

    // Smoke from bases and from the camps and forts of the occupier (not from convoys, which are on the move).
    const sources = [...snap.bases, ...snap.npcs.filter((n) => n.kind !== "convoy")].filter(inRange).slice(0, MAX_SOURCES);
    for (const s of sources) {
      const c = tileCenter(s.x, s.y);
      const seed = hash01(s.x, s.y, 77);
      const ox = c.x + (seed - 0.5) * TILE_W * 0.3 * k;
      const oy = c.y - TILE_H * 0.85 * k;
      for (let i = 0; i < PUFFS; i++) {
        const phase = (t / PUFF_S + i / PUFFS + seed) % 1;
        const r = (7 + phase * 16) * k;
        g.fillStyle(SMOKE, 0.75 * (1 - phase) * Math.min(1, phase * 6));
        g.fillCircle(ox + Math.sin(phase * 4 + i + seed * 6) * 7 * k + phase * 18 * k, oy - phase * TILE_H * 1.8 * k, r);
      }
    }
  }
}
