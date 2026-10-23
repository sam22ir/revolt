import { tileDistance, type MapBaseView } from "@revolt/rules";
import { t } from "../i18n/i18n.ts";
import { plateLift } from "../scene/marker-size.ts";
import { centerTile } from "../scene/world-layout.ts";
import type { WorldCamera } from "../scene/world-scene.ts";
import { edgeArrow, type Rect } from "./base-arrow-math.ts";
import { el } from "./dom.ts";

/** Name plates show from this zoom up; farther out they would pile up, and the canvas ring colour already says who is who. */
const PLATE_ZOOM = 0.55;
/** At most this many plates, nearest the middle of the screen first (the player's own always among them). */
const MAX_PLATES = 25;
/** Gap between the arrow and the edge of the free band, CSS px. */
const ARROW_MARGIN = 34;
/** The minimap and home button's corner, which the arrow keeps out of: its size from the band's bottom corner, CSS px. */
const CORNER_W = 190;
const CORNER_H = 100;

export interface MapLabels {
  readonly root: HTMLElement;
  /** The map camera moved or the snapshot changed. */
  readonly update: (camera: WorldCamera) => void;
  readonly setVisible: (visible: boolean) => void;
  /** Sets the texts again, after a language change. */
  readonly relabel: () => void;
}

export interface MapLabelsDeps {
  /** The arrow was tapped: go to the player's base. */
  readonly onJump: (tile: { x: number; y: number }) => void;
  /** True in right-to-left languages: the minimap corner is then on the right. */
  readonly rtl: () => boolean;
}

type Relation = "own" | "ally" | "other" | "none";

const relationOf = (b: MapBaseView, myAlliance: string | null): Relation =>
  b.mine ? "own" : b.alliance === null ? "none" : b.alliance === myAlliance ? "ally" : "other";

/**
 * Player name plates and the arrow to the player's base, as DOM over the canvas (CLAUDE.md rule 6), so Arabic handles shape
 * and run right-to-left. The map itself never mirrors, so neither do these positions: the layer is `dir="ltr"` and placed
 * with physical px from the camera (the one exception to logical properties here); each handle has its own `dir="auto"`.
 * Positions come only from the camera callback, with no layout reads.
 */
export const createMapLabels = (deps: MapLabelsDeps): MapLabels => {
  const root = el("div", "map-labels");
  root.dir = "ltr";
  root.hidden = true;
  const plates = new Map<string, { node: HTMLElement; tag: HTMLElement; name: HTMLElement }>();

  const arrow = el("button", "base-arrow");
  arrow.type = "button";
  arrow.dataset.testid = "base-arrow";
  arrow.hidden = true;
  const head = el("span", "base-arrow-head");
  const distance = el("span", "base-arrow-distance");
  arrow.append(head, distance);
  root.append(arrow);
  let mine: { x: number; y: number } | null = null;
  arrow.addEventListener("click", () => {
    if (mine !== null) deps.onJump(mine);
  });

  const plateFor = (key: string): { node: HTMLElement; tag: HTMLElement; name: HTMLElement } => {
    let p = plates.get(key);
    if (p === undefined) {
      const node = el("div", "map-plate");
      // Screen readers get names from the tile panel; the plates are decoration over the canvas.
      node.setAttribute("aria-hidden", "true");
      const tag = el("span", "map-plate-tag");
      const name = document.createElement("bdi");
      name.dir = "auto";
      node.append(tag, name);
      root.append(node);
      p = { node, tag, name };
      plates.set(key, p);
    }
    return p;
  };

  const update = (camera: WorldCamera): void => {
    const { view, snap, project } = camera;
    const top = view.insetTop ?? 0;
    const bottom = view.height - (view.insetBottom ?? 0);
    // Plates under the header or a sheet are cut off with the band, so the HUD stays readable.
    root.style.clipPath = `inset(${top}px 0 ${view.insetBottom ?? 0}px 0)`;
    const own = snap.bases.find((b) => b.mine) ?? null;
    const myAlliance = own?.alliance ?? null;
    const live = new Set<string>();

    if (view.zoom >= PLATE_ZOOM) {
      const cx = view.width / 2;
      const cy = (top + bottom) / 2;
      const shown = snap.bases
        .map((b) => ({ b, p: project(b.x, b.y) }))
        .filter(({ p }) => p.x > -80 && p.x < view.width + 80 && p.y > top - 40 && p.y < bottom + 120)
        .sort((a, z) => Number(z.b.mine) - Number(a.b.mine) || Math.hypot(a.p.x - cx, a.p.y - cy) - Math.hypot(z.p.x - cx, z.p.y - cy))
        .slice(0, MAX_PLATES);
      for (const { b, p } of shown) {
        const key = `${b.x},${b.y}`;
        live.add(key);
        const plate = plateFor(key);
        plate.node.className = `map-plate rel-${relationOf(b, myAlliance)}`;
        plate.tag.textContent = b.alliance === null ? "" : `[${b.alliance}]`;
        plate.tag.hidden = b.alliance === null;
        plate.name.textContent = b.tag;
        const y = p.y - plateLift(b.mine, view.zoom) * view.zoom;
        plate.node.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      }
    }
    for (const [key, p] of plates) {
      if (live.has(key)) continue;
      p.node.remove();
      plates.delete(key);
    }

    mine = own === null ? null : { x: own.x, y: own.y };
    const band: Rect = { left: 0, top, right: view.width, bottom };
    const corner: Rect = deps.rtl()
      ? { left: view.width - CORNER_W, top: bottom - CORNER_H, right: view.width, bottom }
      : { left: 0, top: bottom - CORNER_H, right: CORNER_W, bottom };
    const a = own === null ? null : edgeArrow(project(own.x, own.y), band, ARROW_MARGIN, corner);
    arrow.hidden = a === null;
    if (a !== null && own !== null) {
      arrow.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -50%)`;
      head.style.transform = `rotate(${a.angle}rad)`;
      distance.textContent = t("map.baseDistance", { count: Math.round(tileDistance(centerTile(view, snap.size), own)) });
    }
  };

  const relabel = (): void => {
    arrow.setAttribute("aria-label", t("map.myBase"));
  };
  relabel();

  return {
    root,
    update,
    setVisible: (visible) => {
      root.hidden = !visible;
    },
    relabel,
  };
};
