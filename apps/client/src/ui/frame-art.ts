import { artUrl } from "../art/art.ts";
import { artPack } from "../art/pack.ts";

/**
 * Puts the art pack's painted frames on CSS custom properties (`--art-frame-panel` …), so the stylesheets can use them
 * in border-image without naming a file. Set once at startup, like the theme colours.
 */
export const applyFrameArt = (root: HTMLElement): void => {
  const { panel, button, buttonActive, plate } = artPack.frames;
  root.style.setProperty("--art-frame-panel", `url("${artUrl(panel)}")`);
  root.style.setProperty("--art-frame-button", `url("${artUrl(button)}")`);
  root.style.setProperty("--art-frame-button-active", `url("${artUrl(buttonActive)}")`);
  root.style.setProperty("--art-frame-plate", `url("${artUrl(plate)}")`);
};
