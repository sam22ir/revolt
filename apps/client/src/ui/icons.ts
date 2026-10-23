import type { ResourceId } from "@revolt/rules";

import type { TroopId } from "@revolt/rules";
import { artUrl } from "../art/art.ts";
import { artPack } from "../art/pack.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

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

export type NavIconId = "map" | "base" | "alliance" | "reports" | "account";

// Simple silhouettes on a 24-unit grid, filled with currentColor. Drawn as paths only, so the bottom nav needs no art pack.
const NAV_PATHS: Readonly<Record<NavIconId, string>> = {
  // A folded map: three panels with gaps between the folds.
  map: "M2.5 5.2 8.8 3.4v15.4l-6.3 1.8zM10.3 3.4l3.4 1.1v16.1l-3.4-1.1zM16.7 4.5l4.8-1.6v15.4l-4.8 1.6z",
  // A small fort: crenellated wall with a gate.
  base: "M4 5h3v3h2.5V5h3v3H15V5h3v3h2v13H4zM10.5 21v-4a1.5 1.5 0 0 1 3 0v4z",
  // A pole with a flag.
  alliance: "M5.5 3H7.5V21H5.5zM8 4h10l-2.6 3.6L18 11.2H8z",
  // An envelope: the flap is a cut-out line (evenodd).
  reports: "M3 5h18v14H3zM4.8 6.5 12 12l7.2-5.5v.8L12 13.5 4.8 7.3z",
  // A head and shoulders.
  account: "M12 3.5a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zM4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z",
};

/** A bottom-nav icon, built with DOM calls (no markup strings). Decorative: the button's label names it. */
export const navIcon = (id: NavIconId): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("fill-rule", "evenodd");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "nav-icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", NAV_PATHS[id]);
  svg.append(path);
  return svg;
};
