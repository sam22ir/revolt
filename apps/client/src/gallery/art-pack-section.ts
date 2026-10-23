import { artUrl } from "../art/art.ts";
import { artPack } from "../art/pack.ts";
import { cell, el, section } from "./dom.ts";
import { packEntries, type PackEntry } from "./gallery-data.ts";

/** Every sprite the art pack names, grouped by pack field. */
export const artPackSection = (): HTMLElement => {
  const s = section("Art pack", "Every entry of artPack (src/art/pack.ts), drawn through artUrl. Caption: id, then sprite key.");
  const groups = new Map<string, PackEntry[]>();
  for (const e of packEntries(artPack)) {
    const list = groups.get(e.field) ?? [];
    list.push(e);
    groups.set(e.field, list);
  }
  for (const [field, entries] of groups) {
    s.append(el("h3", "", field));
    const grid = el("div", "cells");
    for (const { id, key } of entries) {
      const img = el("img");
      img.src = artUrl(key);
      img.alt = key;
      img.loading = "lazy";
      grid.append(cell(img, [el("code", "", id), el("span", "dim", key)]));
    }
    s.append(grid);
  }
  return s;
};
