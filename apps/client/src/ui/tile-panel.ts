import { canPerform, type AllianceView, type MapNpcView, type MapSnapshot, type RallyView } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { TileRef } from "../scene/world-scene.ts";
import type { AllianceOutcome } from "../state/alliance-store.ts";
import { ralliesAt, tileInfo, type TileInfo } from "../state/tile-info.ts";
import { userText } from "./alliance-rows.ts";
import { el } from "./dom.ts";
import { troopList } from "./troop-format.ts";

export interface TilePanel {
  readonly root: HTMLElement;
  readonly show: (tile: TileRef | null) => void;
  readonly selected: () => TileRef | null;
  readonly update: (snapshot: MapSnapshot | null, context: TileContext) => void;
}

/** What the panel needs to know about the player beyond the map. */
export interface TileContext {
  readonly alliance: AllianceView | null;
  /** Server time as best known, to tell a gathering rally from one that has left. */
  readonly now: number;
}

interface TilePanelDeps {
  readonly onClose: () => void;
  readonly onSendMarch: (npc: MapNpcView) => void;
  readonly onStartRally: (npc: MapNpcView) => void;
  readonly onJoinRally: (npc: MapNpcView, rally: RallyView) => void;
  /** Asks the server to put the alliance HQ on this tile. */
  readonly onPlaceHq: (tile: TileRef) => Promise<AllianceOutcome>;
}

const titleOf = (info: TileInfo): string => {
  switch (info.kind) {
    case "own":
      return t("map.ownCamp");
    case "camp":
      return info.base.alliance === null ? t("map.camp", { tag: info.base.tag }) : t("map.campAlliance", { tag: info.base.tag, alliance: info.base.alliance });
    case "hq":
      return t("map.hq", { tag: info.hq.tag });
    case "npc":
      return t(`npc.${info.npc.kind}.name`);
    case "empty":
      return t(`terrain.${info.terrain}`);
  }
};

/** A rally the player can still join: it gathers, has room, and they are not in it. */
const openRallies = (snapshot: MapSnapshot, npcId: string, now: number): RallyView[] =>
  ralliesAt(snapshot, npcId).filter((r) => !r.joined && now < r.gatherUntil && r.participants < r.maxParticipants);

/** Identifies what is drawn, so the panel is rebuilt only when it changes. */
const keyOf = (tile: TileRef, info: TileInfo | null, snapshot: MapSnapshot | null, ctx: TileContext, notice: string | null): string => {
  const rank = ctx.alliance?.myRank ?? "-";
  let what = "loading";
  if (info !== null) {
    switch (info.kind) {
      case "npc":
        what = `npc:${info.npc.id}:${info.npc.level}:${rank}:${snapshot === null ? "" : ralliesAt(snapshot, info.npc.id).map((r) => `${r.id}.${r.joined ? 1 : 0}.${r.participants}.${ctx.now < r.gatherUntil ? 1 : 0}`).join(",")}`;
        break;
      case "empty":
        // Where the HQ stands now: placing or moving it changes the button, and re-enables it.
        what = `empty:${rank}:${ctx.alliance?.hq ? `${ctx.alliance.hq.x},${ctx.alliance.hq.y}` : "-"}`;
        break;
      case "hq":
        what = `hq:${info.hq.tag}:${info.hq.mine ? ctx.alliance?.name ?? "" : ""}`;
        break;
      default:
        what = `${info.kind}:${info.base.tag}:${info.base.alliance ?? ""}`;
    }
  }
  return `${currentLanguage()}|${tile.x},${tile.y}|${what}|${info?.terrain ?? ""}|${notice ?? ""}`;
};

/**
 * What is on the tapped tile: your camp, another camp, an alliance HQ, an NPC target (march, or the alliance's
 * rally) or just land (where the alliance leader can place the HQ).
 */
export const createTilePanel = (deps: TilePanelDeps): TilePanel => {
  const root = el("section", "panel tile-panel");
  root.hidden = true;
  root.dataset.testid = "tile-panel";
  root.setAttribute("aria-live", "polite");
  let current: TileRef | null = null;
  let key = "";
  /** A refusal of the last HQ placement, as a reason code. */
  let notice: string | null = null;
  let latest: { snapshot: MapSnapshot | null; ctx: TileContext } = { snapshot: null, ctx: { alliance: null, now: 0 } };

  const render = (tile: TileRef, info: TileInfo | null, snapshot: MapSnapshot | null, ctx: TileContext): void => {
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
    else if (info.kind === "hq") {
      root.dataset.hq = info.hq.tag;
      root.append(el("p", "panel-desc", t(info.hq.mine ? "map.hqOwnDesc" : "map.hqDesc")));
      // The alliance's name is player text; only the player's own alliance's name is known here.
      if (info.hq.mine && ctx.alliance !== null) {
        const stats = el("dl", "panel-stats");
        const dd = el("dd");
        dd.append(userText("bdi", ctx.alliance.name));
        stats.append(el("dt", undefined, t("map.allianceName")), dd);
        root.append(stats);
      }
    } else if (info.kind === "empty") {
      root.append(el("p", "panel-desc", t("map.nothingHere")));
      if (ctx.alliance !== null && canPerform(ctx.alliance.myRank, "set_hq")) {
        const place = el("button", "upgrade-btn", t(ctx.alliance.hq === null ? "map.placeHq" : "map.moveHq"));
        place.type = "button";
        place.dataset.testid = "place-hq";
        place.addEventListener("click", () => {
          place.disabled = true;
          notice = null;
          void deps.onPlaceHq(tile).then((outcome) => {
            // On success the map snapshot turns this tile into the HQ; on refusal say why.
            if (outcome.ok) return;
            notice = outcome.reason;
            key = "";
            refresh();
          });
        });
        root.append(place);
        if (notice !== null) {
          const why = el("p", "panel-reason", t(`reason.${notice}`));
          why.dataset.testid = "place-hq-reason";
          root.append(why);
        }
      }
    } else {
      root.dataset.npc = info.npc.id;
      const npc = info.npc;
      root.append(el("p", "panel-desc", t(`npc.${npc.kind}.desc`)));
      if (info.def !== null) {
        const stats = el("dl", "panel-stats");
        stats.append(el("dt", undefined, t("map.defenders")), el("dd", undefined, troopList(info.def.defenders)));
        root.append(stats);
      }
      const rallyOnly = info.def?.rallyOnly ?? false;
      if (rallyOnly) {
        const needed = el("p", "panel-reason rally-needed", t("rally.needed"));
        needed.dataset.testid = "rally-needed";
        root.append(needed);
      } else {
        const send = el("button", "upgrade-btn", t("map.sendMarch"));
        send.type = "button";
        send.dataset.testid = "send-march";
        send.addEventListener("click", () => deps.onSendMarch(npc));
        root.append(send);
      }
      if (ctx.alliance !== null && canPerform(ctx.alliance.myRank, "start_rally")) {
        const start = el("button", "upgrade-btn", t("rally.start"));
        start.type = "button";
        start.dataset.testid = "rally-start";
        start.addEventListener("click", () => deps.onStartRally(npc));
        root.append(start);
      }
      if (snapshot !== null) {
        for (const rally of openRallies(snapshot, npc.id, ctx.now)) {
          const join = el("button", "upgrade-btn", t("rally.join"));
          join.type = "button";
          join.dataset.testid = "rally-join";
          join.dataset.rally = rally.id;
          join.addEventListener("click", () => deps.onJoinRally(npc, rally));
          root.append(join);
        }
      }
    }

    root.dataset.kind = info.kind;
    root.dataset.terrain = info.terrain;
  };

  const refresh = (): void => {
    if (current === null) return;
    const { snapshot, ctx } = latest;
    const info = snapshot === null ? null : tileInfo(snapshot, current.x, current.y);
    const k = keyOf(current, info, snapshot, ctx, notice);
    if (k === key) return;
    key = k;
    render(current, info, snapshot, ctx);
  };

  return {
    root,
    show: (tile) => {
      current = tile;
      key = "";
      notice = null;
      root.hidden = tile === null;
    },
    selected: () => current,
    update: (snapshot, ctx) => {
      latest = { snapshot, ctx };
      refresh();
    },
  };
};
