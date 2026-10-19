import type Phaser from "phaser";

/** Where a sprite's ground anchor sits in its texture (px) and how wide it should be drawn (world px). */
export interface SpriteSpec {
  readonly texture: string;
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
    img
      .setTexture(spec.texture)
      .setFlipX(flip)
      .setScale(spec.scale * k)
      .setPosition(x - ax * spec.scale * k, y - spec.anchorY * spec.scale * k)
      .setDepth(depth)
      .setVisible(true)
      .setAlpha(1)
      .clearTint();
    return img;
  }

  /** Hides whatever `place()` did not hand out since `begin()`. */
  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i]?.setVisible(false);
  }
}
