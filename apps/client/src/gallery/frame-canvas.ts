import type { AtlasFrame } from "../art/art.ts";
import { el } from "./dom.ts";
import { loadImage } from "./image-cache.ts";

/** Radius in CSS px of the dot that marks a prop's ground anchor. */
const ANCHOR_RADIUS = 3;

/**
 * One atlas frame cropped from its sheet into a canvas at `scale`. The anchor dot is drawn into the canvas, not
 * placed in HTML, so it stays on the right pixel in RTL (canvas content never mirrors).
 */
export const frameCanvas = (sheetUrl: string, frame: AtlasFrame, scale: number, markAnchor: boolean): HTMLCanvasElement => {
  const canvas = el("canvas", "frame");
  canvas.width = Math.max(1, Math.round(frame.w * scale));
  canvas.height = Math.max(1, Math.round(frame.h * scale));
  loadImage(sheetUrl)
    .then((img) => {
      const ctx = canvas.getContext("2d");
      if (ctx === null) return;
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, canvas.width, canvas.height);
      if (markAnchor && frame.ax !== undefined && frame.ay !== undefined) {
        ctx.fillStyle = "#e0303a";
        ctx.beginPath();
        ctx.arc(frame.ax * scale, frame.ay * scale, ANCHOR_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    })
    .catch(() => canvas.classList.add("missing"));
  return canvas;
};
