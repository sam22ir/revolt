import manifest from "../art/manifest.json";
import { artUrl, spriteInfo } from "../art/art.ts";
import { artPack } from "../art/pack.ts";
import { cell, el, section } from "./dom.ts";
import { groupManifestKeys, packKeySet } from "./gallery-data.ts";

/** Every key in manifest.json, grouped by folder, with pixel size and an "unused" badge when the pack does not name it. */
export const spritesSection = (): HTMLElement => {
  const s = section("All sprites", "Every entry of src/art/manifest.json. Unused means no artPack value uses the key.");
  for (const group of groupManifestKeys(Object.keys(manifest), packKeySet(artPack))) {
    s.append(el("h3", "", group.folder));
    const grid = el("div", "cells");
    for (const { key, unused } of group.items) {
      const info = spriteInfo(key);
      const img = el("img");
      img.src = artUrl(key);
      img.alt = key;
      img.loading = "lazy";
      const caption = [el("code", "", key), el("span", "dim", `${info.w}×${info.h}px`)];
      if (unused) caption.push(el("span", "badge", "unused"));
      grid.append(cell(img, caption));
    }
    s.append(grid);
  }
  return s;
};
