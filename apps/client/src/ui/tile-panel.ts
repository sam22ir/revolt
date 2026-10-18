import type { MapNpcView, MapSnapshot } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { TileRef } from "../scene/world-scene.ts";
import { tileInfo, type TileInfo } from "../state/tile-info.ts";
import { el } from "./dom.ts";
import { troopList } from "./troop-format.ts";

export interface TilePanel {
  readonly root: HTMLElement;
  readonly show: (tile: TileRef | null) => void;
  readonly selected: () => TileRef | null;
  readonly update: (snapshot: MapSnapshot | null) => void;
}

interface TilePanelDeps {
  readonly onClose: () => void;
  readonly onSendMarch: (npc: MapNpcView) => void;
}

const titleOf = (info: TileInfo): string => {
  switch (info.kind) {
    case "own":
      return t("map.ownCamp");
    case "camp":
      return t("map.camp", { tag: info.base.tag });
    case "npc":
      return t(`npc.${info.npc.kind}.name`);
    case "empty":
      return t(`terrain.${info.terrain}`);
  }
};

/** Identifies what is drawn, so the panel is rebuilt only when it changes. */
const keyOf = (tile: TileRef, info: TileInfo | null): string => {
  const what = info === null ? "loading" : info.kind === "npc" ? `npc:${info.npc.id}:${info.npc.level}` : info.kind === "empty" ? "empty" : `${info.kind}:${info.base.tag}`;
  return `${currentLanguage()}|${tile.x},${tile.y}|${what}|${info?.terrain ?? ""}`;
};

/** What is on the tapped tile: your camp, another camp, an NPC target (with a march button) or just land. */
export const createTilePanel = (deps: TilePanelDeps): TilePanel => {
  const root = el("section", "panel tile-panel");
  root.hidden = true;
  root.dataset.testid = "tile-panel";
  root.setAttribute("aria-live", "polite");
  let current: TileRef | null = null;
  let key = "";

  const render = (tile: TileRef, info: TileInfo | null): void => {
    const lang = currentLanguage();
    root.replaceChildren();
    delete root.dataset.npc;
    delete root.dataset.kind;
    delete root.dataset.terrain;
    const head = el("div", "panel-head");
    const title = el("h2", "panel-title", info === null ? t("map.loading") : titleOf(info));
    head.append(title);
    if (info?.kind === "npc") head.append(el("span", "panel-level", t("panel.level", { level: formatAmount(lang, info.npc.level) })));
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", deps.onClose);
    head.append(close);

    const coords = el("p", "panel-desc tile-coords", t("map.coords", { x: formatAmount(lang, tile.x), y: formatAmount(lang, tile.y) }));
    coords.dataset.testid = "tile-coords";
    root.append(head, coords);
    if (info === null) return;

    if (info.kind === "own") root.append(el("p", "panel-desc", t("map.ownCampDesc")));
    else if (info.kind === "camp") root.append(el("p", "panel-desc", t("map.campDesc")));
    else if (info.kind === "empty") root.append(el("p", "panel-desc", t("map.nothingHere")));
    else {
      root.dataset.npc = info.npc.id;
      root.append(el("p", "panel-desc", t(`npc.${info.npc.kind}.desc`)));
      if (info.def !== null) {
        const stats = el("dl", "panel-stats");
        stats.append(el("dt", undefined, t("map.defenders")), el("dd", undefined, troopList(info.def.defenders)));
        root.append(stats);
      }
      const send = el("button", "upgrade-btn", t("map.sendMarch"));
      send.type = "button";
      send.dataset.testid = "send-march";
      const npc = info.npc;
      send.addEventListener("click", () => deps.onSendMarch(npc));
      root.append(send);
    }

    root.dataset.kind = info.kind;
    root.dataset.terrain = info.terrain;
  };

  return {
    root,
    show: (tile) => {
      current = tile;
      key = "";
      root.hidden = tile === null;
    },
    selected: () => current,
    update: (snapshot) => {
      if (current === null) return;
      const info = snapshot === null ? null : tileInfo(snapshot, current.x, current.y);
      const k = keyOf(current, info);
      if (k === key) return;
      key = k;
      render(current, info);
    },
  };
};
