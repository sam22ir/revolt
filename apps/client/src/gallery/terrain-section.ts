import { groundUrl, propsUrl, terrainAtlases } from "../art/art.ts";
import { hex, theme } from "../theme/theme.ts";
import { el, section } from "./dom.ts";
import { frameCanvas } from "./frame-canvas.ts";

/** Frames are shown at half their atlas size: legible on a phone, and a whole atlas fits on a screen. */
const FRAME_SCALE = 0.5;

const swatch = (color: number, label: string): HTMLElement => {
  const sw = el("div", "swatch");
  const chip = el("div", "chip");
  chip.style.backgroundColor = hex(color);
  sw.append(chip, el("code", "", label), el("span", "dim", hex(color)));
  return sw;
};

/** Every frame of the ground atlases and prop atlases, cropped from the shipped sheets. */
export const terrainSection = (): HTMLElement => {
  const s = section("Terrain", "Ground frames are painted tiles; the flat light and dark swatches are theme.terrain. Red dots mark a prop's ground anchor.");
  const terrainPairs: Readonly<Record<string, readonly [number, number]>> = theme.terrain;

  for (const [terrain, atlas] of Object.entries(terrainAtlases.ground)) {
    s.append(el("h3", "", `ground: ${terrain} (${atlas.frames.length} frames)`));
    const pair = terrainPairs[terrain];
    if (pair !== undefined) {
      const row = el("div", "swatches");
      row.append(swatch(pair[0], `${terrain}.light`), swatch(pair[1], `${terrain}.dark`));
      s.append(row);
    }
    const grid = el("div", "frames");
    atlas.frames.forEach((frame, i) => {
      const f = el("figure", "frame-cell");
      f.append(frameCanvas(groundUrl(terrain), frame, FRAME_SCALE, false), el("figcaption", "dim", `#${i} ${frame.w}×${frame.h}`));
      grid.append(f);
    });
    s.append(grid);
  }

  for (const [kind, atlas] of Object.entries(terrainAtlases.props)) {
    s.append(el("h3", "", `props: ${kind} (${atlas.frames.length} frames)`));
    const grid = el("div", "frames");
    atlas.frames.forEach((frame, i) => {
      const f = el("figure", "frame-cell");
      const anchored = frame.ax !== undefined && frame.ay !== undefined;
      const caption = anchored ? `#${i} ${frame.w}×${frame.h} anchor ${frame.ax},${frame.ay}` : `#${i} ${frame.w}×${frame.h}`;
      f.append(frameCanvas(propsUrl(kind), frame, FRAME_SCALE, true), el("figcaption", "dim", caption));
      grid.append(f);
    });
    s.append(grid);
  }
  return s;
};
