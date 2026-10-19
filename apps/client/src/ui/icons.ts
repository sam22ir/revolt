import type { ResourceId } from "@revolt/rules";

import type { TroopId } from "@revolt/rules";
import { artUrl } from "../art/art.ts";

// Painted medallions (art/ui, art/units). Purely decorative: labels come from i18n, and the art has no text.
export const resourceIcon = (id: ResourceId): string => `<img class="icon" src="${artUrl(`ui/resource_${id}`)}" alt="" aria-hidden="true" draggable="false" width="96" height="96">`;

/** Built with DOM calls, not markup, so the alliance-safe screens can use it. */
export const troopIcon = (id: TroopId): HTMLImageElement => {
  const img = document.createElement("img");
  img.className = "icon troop-icon";
  img.src = artUrl(`units/troop_${id}`);
  img.alt = "";
  img.draggable = false;
  img.width = 128;
  img.height = 128;
  img.setAttribute("aria-hidden", "true");
  return img;
};
