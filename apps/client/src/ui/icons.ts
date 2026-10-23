import type { ResourceId } from "@revolt/rules";

import type { TroopId } from "@revolt/rules";
import { artUrl } from "../art/art.ts";
import { artPack } from "../art/pack.ts";

// Painted medallions (art/ui, art/units). Purely decorative: labels come from i18n, and the art has no text.
export const resourceIcon = (id: ResourceId): string => `<img class="icon" src="${artUrl(artPack.resources[id])}" alt="" aria-hidden="true" draggable="false" width="96" height="96">`;

/** Built with DOM calls, not markup, so the alliance-safe screens can use it. */
export const troopIcon = (id: TroopId): HTMLImageElement => {
  const img = document.createElement("img");
  img.className = "icon troop-icon";
  img.src = artUrl(artPack.troops[id]);
  img.alt = "";
  img.draggable = false;
  img.width = 128;
  img.height = 128;
  img.setAttribute("aria-hidden", "true");
  return img;
};

/** A house outline for the "my base" button. Inline SVG, drawn in currentColor; the button carries the label. */
export const homeIcon = (): string =>
  '<svg class="home-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 3.2 2.5 11l1.1 1.3L5 11.2V20h5v-5h4v5h5v-8.8l1.4 1.1 1.1-1.3z" fill="currentColor"/></svg>';
