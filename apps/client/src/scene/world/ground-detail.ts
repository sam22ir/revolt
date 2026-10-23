import type Phaser from "phaser";
import { screenToWorld, type View } from "../world-layout.ts";
import type { WorldRect } from "./cell-grid.ts";
import { rng, tileableNoise } from "./ground-grain.ts";
import type { WorldFrame, WorldLayer } from "./world-frame.ts";

/** Side of the detail texture, px. It repeats every DETAIL_SIZE world px, anchored at the world origin. */
export const DETAIL_SIZE = 512;
/** World px the overlay reaches past the view on each side, so a pan never shows its edge. */
export const DETAIL_MARGIN = 32;
/** Above the baked ground (depth 0), below the regions (0.905), props (0.91 and up) and markers (1 and up). */
export const DETAIL_DEPTH = 0.5;
/** Zoom at which the overlay is gone (below FADE_OUT) and at which it is full (above FADE_IN). */
const FADE_OUT = 0.35;
const FADE_IN = 0.6;
const TEXTURE_KEY = "ground-detail";
/** Phaser.BlendModes.MULTIPLY and Phaser.Scenes.Events.SHUTDOWN, as values: the module stays free of Phaser at import time, so the tests can load it. */
const BLEND_MULTIPLY = 2;
const SHUTDOWN = "shutdown";

export interface DetailPlacement {
  /** Top-left corner and size of the overlay sprite, world px. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The texture offset. It equals the sprite's corner, so the texture's origin stays at world (0, 0) and the marks do not move with the camera. */
  readonly tileX: number;
  readonly tileY: number;
}

/** Where the overlay sprite goes to cover `world` (the visible world rectangle), with its texture offset. Pure. */
export const detailPlacement = (world: WorldRect): DetailPlacement => {
  const x = world.x - DETAIL_MARGIN;
  const y = world.y - DETAIL_MARGIN;
  return { x, y, w: world.w + 2 * DETAIL_MARGIN, h: world.h + 2 * DETAIL_MARGIN, tileX: x, tileY: y };
};

/** Opacity of the overlay at a zoom: 0 at or below FADE_OUT, 1 at or above FADE_IN, smoothstep between. Pure. */
export const detailAlpha = (zoom: number): number => {
  const t = Math.min(1, Math.max(0, (zoom - FADE_OUT) / (FADE_IN - FADE_OUT)));
  return t * t * (3 - 2 * t);
};

/**
 * The fine detail texture, made once: a seamless white tile with soft mottling, fine grit and pale pebble clusters (2 to 5 px across), for a MULTIPLY
 * overlay. No long lines: cracks and ripples are decals. Deterministic. Browser only (uses a canvas), so call it lazily.
 */
export const makeDetailTexture = (): HTMLCanvasElement => {
  const n = DETAIL_SIZE;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d");
  if (ctx === null) return c;
  const grain = tileableNoise(n, 4, 21);
  // Broad soft mottling (cells of 64 and 128 px): the sand is lighter and darker in patches, as in painted ground.
  const mottle = tileableNoise(n, 64, 22);
  const broad = tileableNoise(n, 128, 23);
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const patch = (mottle[i]! * 0.6 + broad[i]! * 0.4) * 22;
    const grit = Math.max(0, (grain[i]! - 0.7) / 0.3) * 34;
    const dark = patch + grit;
    img.data[i * 4] = 255 - dark;
    img.data[i * 4 + 1] = 255 - dark * 1.05;
    img.data[i * 4 + 2] = 255 - dark * 1.2;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Pebbles in loose clusters: only where a mid-size noise is high, so they gather instead of dotting the sand evenly. Each is an
  // ellipse squashed for the iso ground, pale and soft, drawn at the wrap offsets so the edges match.
  const gather = tileableNoise(n, 48, 24);
  const r = rng(31);
  for (let k = 0; k < 400; k++) {
    const x = r() * n, y = r() * n, rad = 1.1 + r() * 1.3, shade = 150 + r() * 50, alpha = 0.25 + r() * 0.3;
    const g = gather[(Math.floor(y) % n) * n + (Math.floor(x) % n)] ?? 0;
    if (g < 0.58) continue;
    ctx.fillStyle = `rgba(${shade}, ${shade * 0.86}, ${shade * 0.72}, ${alpha})`;
    for (const dx of [-n, 0, n]) {
      for (const dy of [-n, 0, n]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rad, rad * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return c;
};

/** The visible world rectangle of a view, the same mapping the cells are culled with. */
const viewRect = (view: View): WorldRect => {
  const a = screenToWorld(view, 0, 0);
  const b = screenToWorld(view, view.width, view.height);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
};

/**
 * A world-space MULTIPLY overlay of fine grain and pebbles over the baked ground. The sprite follows the view each frame and its
 * texture offset follows it too, so the marks stay on the ground. Faded out at far zoom, where the detail is too small to see.
 */
export class DetailLayer implements WorldLayer {
  private readonly sprite: Phaser.GameObjects.TileSprite;
  private key = "";

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists(TEXTURE_KEY)) scene.textures.addCanvas(TEXTURE_KEY, makeDetailTexture());
    this.sprite = scene.add
      .tileSprite(0, 0, 1, 1, TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDepth(DETAIL_DEPTH)
      .setBlendMode(BLEND_MULTIPLY)
      .setVisible(false);
    scene.events.once(SHUTDOWN, () => this.sprite.destroy());
  }

  invalidate(): void {
    this.key = "";
  }

  paint(frame: WorldFrame): void {
    const alpha = detailAlpha(frame.view.zoom);
    if (alpha <= 0) {
      this.sprite.setVisible(false);
      this.key = "";
      return;
    }
    const p = detailPlacement(viewRect(frame.view));
    const key = `${p.x},${p.y},${p.w},${p.h},${alpha}`;
    if (key === this.key) return;
    this.key = key;
    this.sprite.setVisible(true).setAlpha(alpha).setPosition(p.x, p.y).setSize(p.w, p.h);
    this.sprite.tilePositionX = p.tileX;
    this.sprite.tilePositionY = p.tileY;
  }
}
