import { LEADERBOARDS, type LeaderboardId } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { LiveStore } from "../state/live-store.ts";
import { el } from "./dom.ts";

/**
 * A ranking of the player's own server. Names come from other players, so they are set as text and shown with
 * `dir="auto"` inside `<bdi>`, the way chat does: an Arabic name in an English line (or the reverse) cannot scramble it.
 */
export const boardTab = (live: LiveStore, onSelect: (board: LeaderboardId) => void): HTMLElement => {
  const lang = currentLanguage();
  const root = el("div", "live-tab");
  root.dataset.testid = "live-board";
  const current = live.board();
  const tabs = el("div", "live-subtabs");
  tabs.setAttribute("role", "tablist");
  for (const id of LEADERBOARDS) {
    const b = el("button", "live-subtab", t(`live.board.${id}`));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.testid = `board-tab-${id}`;
    b.setAttribute("aria-selected", String(current?.board === id));
    b.addEventListener("click", () => onSelect(id));
    tabs.append(b);
  }
  root.append(tabs);
  if (current === null) {
    root.append(el("p", "panel-desc", t(live.offline() ? "live.offlineEmpty" : "live.loading")));
    return root;
  }
  if (current.entries.length === 0) root.append(el("p", "panel-desc", t("live.board.empty")));
  const list = el("ol", "live-board");
  for (const e of current.entries) {
    const li = el("li", e.mine ? "live-row mine" : "live-row");
    li.dataset.testid = "board-row";
    li.dataset.mine = String(e.mine);
    const name = el("bdi", "live-name", e.name);
    name.setAttribute("dir", "auto");
    li.append(el("span", "live-pos", formatAmount(lang, e.rank)), name, el("span", "live-points", formatAmount(lang, e.score)));
    list.append(li);
  }
  root.append(list);
  const me = el("p", "live-me", current.me.rank === null ? t("live.board.unranked") : t("live.board.yourRank", { rank: formatAmount(lang, current.me.rank), score: formatAmount(lang, current.me.score) }));
  me.dataset.testid = "board-me";
  root.append(me, el("p", "panel-desc live-hint", t("live.board.note")));
  return root;
};
