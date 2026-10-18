import Phaser from "phaser";

/** Above 3× the extra pixels cost GPU fill-rate without a visible gain on phones. */
const MAX_PIXEL_RATIO = 3;

const pixelRatio = (): number => Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));

interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
}

/** Canvas backing size in device pixels, shown at the parent's CSS size via a 1/ratio zoom. */
const canvasSize = (parent: HTMLElement): CanvasSize => {
  const ratio = pixelRatio();
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width * ratio)),
    height: Math.max(1, Math.round(rect.height * ratio)),
    zoom: 1 / ratio,
  };
};

/**
 * Scale config that renders at devicePixelRatio. Phaser 4 has no `resolution` option, and
 * RESIZE mode always sizes the canvas in CSS pixels, so we use NONE and size it ourselves.
 * Game size (and so the camera and pointer coordinates) is in device pixels; the scene
 * reads the CSS-to-game factor from `scale.displayScale`. The stylesheet pins the canvas's
 * CSS size to its parent, so rounding the backing size never leaves a gap.
 */
export const hiDpiScaleConfig = (parent: HTMLElement): Phaser.Types.Core.ScaleConfig => {
  const { width, height, zoom } = canvasSize(parent);
  return { mode: Phaser.Scale.NONE, width, height, zoom };
};

/** Keeps the canvas matched to the parent's size and the current pixel ratio. */
export const followParentSize = (game: Phaser.Game, parent: HTMLElement): void => {
  const fit = (): void => {
    const scale = game.scale;
    const { width, height, zoom } = canvasSize(parent);
    if (zoom !== scale.zoom) scale.setZoom(zoom);
    scale.resize(width, height);
  };
  // Window resize also fires for rotation and the mobile address bar.
  window.addEventListener("resize", fit);
};
