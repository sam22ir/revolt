import type { BaseState, LeaderboardId, PassTrack } from "@revolt/rules";
import { formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { LiveOutcome, LiveStore, LiveTab } from "../state/live-store.ts";
import { el } from "./dom.ts";
import { boardTab } from "./live-board-tab.ts";
import { eventsTab } from "./live-events-tab.ts";
import { passTab } from "./live-pass-tab.ts";
import { storeTab } from "./live-store-tab.ts";

export interface LivePanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  readonly isOpen: () => boolean;
  /** Called on every UI refresh: redraws only when something changed, and keeps countdowns ticking. */
  readonly update: (state: BaseState, now: number) => void;
  readonly dispose: () => void;
}

interface LiveDeps {
  readonly live: LiveStore;
  readonly onOpen: () => void;
  readonly initial: { readonly open: boolean; readonly tab: LiveTab };
  readonly onChange: (state: { open: boolean; tab: LiveTab }) => void;
}

const TABS: readonly LiveTab[] = ["events", "board", "pass", "store"];

/** One panel for events, rankings, the pass and the store, so the narrow nav row gets one button instead of four. */
export const createLivePanel = (deps: LiveDeps): LivePanel => {
  const { live } = deps;
  const root = el("section", "panel live-panel");
  root.hidden = !deps.initial.open;
  root.dataset.testid = "live-panel";
  let tab: LiveTab = deps.initial.tab;
  let drawn = "";
  let latest: { state: BaseState; now: number } | null = null;
  /** The last refusal to show under the tab it came from. */
  const notes: Record<"events" | "pass" | "store", { reason: string | null }> = { events: { reason: null }, pass: { reason: null }, store: { reason: null } };
  const body = el("div", "live-body");

  const finish = (which: keyof typeof notes) => (outcome: LiveOutcome): void => {
    notes[which].reason = outcome.ok ? null : outcome.reason;
    drawn = "";
    if (latest !== null) update(latest.state, latest.now);
  };

  const content = (state: BaseState, now: number): HTMLElement => {
    switch (tab) {
      case "events":
        return eventsTab(live, now, notes.events, (key) => void live.claimEvent(key).then(finish("events")));
      case "board":
        return boardTab(live, (id: LeaderboardId) => void live.selectBoard(id));
      case "pass":
        return passTab(
          live,
          now,
          notes.pass,
          (tier: number, track: PassTrack) => void live.claimPass(tier, track).then(finish("pass")),
          () => void live.buy("pass_premium").then(finish("pass")),
        );
      case "store":
        return storeTab(live, state, notes.store, {
          buy: (sku) => void live.buy(sku).then(finish("store")),
          equip: (slot, id) => void live.equip(slot, id).then(finish("store")),
          speedUp: (job) => void live.speedUp(job, 1).then(finish("store")),
        });
    }
  };

  const render = (state: BaseState, now: number): void => {
    root.replaceChildren();
    const head = el("div", "panel-head");
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", () => toggle(false));
    head.append(el("h2", "panel-title", t("live.title")), close);
    const tabs = el("div", "live-tabs");
    tabs.setAttribute("role", "tablist");
    for (const id of TABS) {
      const b = el("button", "live-tab-btn", t(`live.tab.${id}`));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.testid = `live-tab-${id}`;
      b.setAttribute("aria-selected", String(id === tab));
      b.addEventListener("click", () => {
        tab = id;
        deps.onChange({ open: true, tab });
        drawn = "";
        if (latest !== null) update(latest.state, latest.now);
      });
      tabs.append(b);
    }
    root.append(head, tabs);
    if (live.offline()) {
      const off = el("p", "panel-reason", t("live.offline"));
      off.dataset.testid = "live-offline";
      root.append(off);
    }
    body.replaceChildren(content(state, now));
    root.append(body);
  };

  /** Counts every `[data-ends]` down in place, without redrawing the panel. */
  const tickCountdowns = (now: number): void => {
    for (const node of root.querySelectorAll<HTMLElement>("[data-ends]")) {
      const label = node.dataset.label ?? "ends";
      node.textContent = t(label === "season" ? "live.pass.season" : `live.events.${label}`, { time: formatDuration(Math.max(0, Number(node.dataset.ends) - now)) });
    }
  };

  function update(state: BaseState, now: number): void {
    latest = { state, now };
    if (root.hidden) return;
    // Redraw when the answers, the language, the tab or what a button depends on changed.
    const key = [live.version(), currentLanguage(), tab, state.queue?.building ?? "-", state.training?.troop ?? "-", live.billing.available].join("|");
    if (key !== drawn) {
      drawn = key;
      render(state, now);
    }
    tickCountdowns(now);
  }

  function toggle(open: boolean = Boolean(root.hidden)): void {
    if (open === !root.hidden) return;
    root.hidden = !open;
    deps.onChange({ open, tab });
    live.setOpen(open);
    if (open) {
      deps.onOpen();
      for (const n of Object.values(notes)) n.reason = null;
      drawn = "";
      if (latest !== null) update(latest.state, latest.now);
    }
  }

  const unsubscribe = live.subscribe(() => {
    if (latest !== null) update(latest.state, latest.now);
  });
  if (!root.hidden) live.setOpen(true);

  return { root, toggle, isOpen: () => !root.hidden, update, dispose: unsubscribe };
};
