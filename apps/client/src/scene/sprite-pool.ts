import type Phaser from "phaser";

/** Where a sprite's ground anchor sits in its texture (px) and how wide it should be drawn (world px). */
export interface SpriteSpec {
  readonly texture: string;
  /** Frame name inside an atlas texture, if the sprite is one frame of an atlas. */
  readonly frame?: string;
  /** Texture size and the point that lands on the target position. */
  readonly w: number;
  readonly anchorX: number;
  readonly anchorY: number;
  /** World px per texture px. */
  readonly scale: number;
}

/**
 * Reusable images for a layer that is repainted often. `begin()` hides them all, `place()` hands one out
 * (creating it on first use), so a repaint allocates nothing once the pool has grown to the visible count.
 */
export class SpritePool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  begin(): void {
    this.used = 0;
  }

  /** `k` scales about the anchor; `flip` mirrors about the sprite's own vertical axis. */
  place(spec: SpriteSpec, x: number, y: number, depth: number, k = 1, flip = false): Phaser.GameObjects.Image {
    let img = this.images[this.used];
    if (img === undefined) {
      img = this.scene.add.image(0, 0, spec.texture).setOrigin(0, 0);
      this.images.push(img);
    }
    this.used++;
    const ax = flip ? spec.w - spec.anchorX : spec.anchorX;
    // Each setter below queues work in Phaser (a depth sort, a texture rebind), so only the ones that change run.
    const frame = spec.frame ?? "__BASE";
    if (img.texture.key !== spec.texture || img.frame.name !== frame) img.setTexture(spec.texture, spec.frame);
    if (img.flipX !== flip) img.setFlipX(flip);
    const scale = spec.scale * k;
    if (img.scaleX !== scale || img.scaleY !== scale) img.setScale(scale);
    const px = x - ax * scale;
    const py = y - spec.anchorY * scale;
    if (img.x !== px || img.y !== py) img.setPosition(px, py);
    if (img.depth !== depth) img.setDepth(depth);
    if (!img.visible) img.setVisible(true);
    if (img.alpha !== 1) img.setAlpha(1);
    if (img.isTinted) img.clearTint();
    return img;
  }

  /** Hides whatever `place()` did not hand out since `begin()`. */
  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i]?.setVisible(false);
  }
}
