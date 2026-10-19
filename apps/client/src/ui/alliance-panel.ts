import type { MapSnapshot, RallyView } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { AllianceStore } from "../state/alliance-store.ts";
import { createAllianceBrowse, type AllianceBrowse } from "./alliance-browse.ts";
import { createAllianceChat, type AllianceChat } from "./alliance-chat.ts";
import { createAllianceHelp, type AllianceHelp } from "./alliance-help.ts";
import { createAllianceMembers, type AllianceMembers } from "./alliance-members.ts";
import { createAllianceRallies, type AllianceRallies } from "./alliance-rallies.ts";
import { createConfirmDialog } from "./confirm-dialog.ts";
import { el } from "./dom.ts";

export const ALLIANCE_TABS = ["members", "chat", "help", "rallies"] as const;
export type AllianceTab = (typeof ALLIANCE_TABS)[number];

export interface AlliancePanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  readonly isOpen: () => boolean;
  /** Redraws what changed. */
  readonly update: () => void;
  readonly dispose: () => void;
}

interface PanelDeps {
  readonly store: AllianceStore;
  readonly myHandle: () => string;
  /** Server time as best known, for countdowns. */
  readonly now: () => number;
  /** The latest map, whose `rallies` the Rallies tab lists. */
  readonly snapshot: () => MapSnapshot | null;
  readonly onJoinRally: (rally: RallyView) => void;
  /** The panel opened (so the others should close). */
  readonly onOpen: () => void;
  /** The tab and open state live outside, so a language change rebuilds the overlay without losing them. */
  readonly initial: { readonly open: boolean; readonly tab: AllianceTab };
  readonly onChange: (state: { open: boolean; tab: AllianceTab }) => void;
}

/** The sub-panels of a player with an alliance. Rebuilt when the alliance changes: chat ids belong to one room. */
interface Joined {
  readonly id: string;
  readonly view: HTMLElement;
  readonly tabs: Map<AllianceTab, { readonly button: HTMLButtonElement; readonly body: HTMLElement }>;
  readonly unread: HTMLElement;
  readonly members: AllianceMembers;
  readonly chat: AllianceChat;
  readonly help: AllianceHelp;
  readonly rallies: AllianceRallies;
}

/** The alliance overlay: search and found one, or members / chat / help / rallies. */
export const createAlliancePanel = (deps: PanelDeps): AlliancePanel => {
  const { store } = deps;
  const root = el("section", "panel alliance-panel");
  root.hidden = !deps.initial.open;
  root.dataset.testid = "alliance-panel";
  let open = deps.initial.open;
  let tab: AllianceTab = deps.initial.tab;

  const head = el("div", "panel-head");
  const close = el("button", "panel-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("panel.close"));
  close.addEventListener("click", () => toggle(false));
  head.append(el("h2", "panel-title", t("alliance.title")), close);
  // Refusals from any action show here, as `reason.<code>`.
  const error = el("p", "panel-reason");
  error.dataset.testid = "alliance-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const body = el("div", "alliance-body");
  const confirm = createConfirmDialog();
  root.append(head, error, body, confirm.root);

  const showError = (reason: string | null): void => {
    error.hidden = reason === null;
    error.textContent = reason === null ? "" : t(`reason.${reason}`);
  };

  const loading = el("p", "panel-desc", t("alliance.loading"));
  let joined: Joined | null = null;
  /** What the body shows now: "loading", "browse" or "joined:<alliance id>". */
  let shown = "";

  const disposeJoined = (): void => {
    joined?.chat.dispose();
    joined = null;
  };

  /** Chat counts as read only while it is really on screen. */
  const syncChatOpen = (): void => store.setChatOpen(open && joined !== null && tab === "chat");

  const selectTab = (next: AllianceTab): void => {
    tab = next;
    deps.onChange({ open, tab });
    if (joined === null) return;
    for (const [id, part] of joined.tabs) {
      const on = id === next;
      part.body.hidden = !on;
      part.button.setAttribute("aria-selected", String(on));
      part.button.classList.toggle("active", on);
    }
    syncChatOpen();
    if (next === "chat") joined.chat.toBottom();
  };

  const buildJoined = (id: string): Joined => {
    const view = el("div", "alliance-view");
    const bar = el("div", "tab-bar");
    bar.setAttribute("role", "tablist");
    const members = createAllianceMembers({ store, confirm, onError: showError });
    const chat = createAllianceChat({ store });
    const help = createAllianceHelp({ store, onError: showError });
    const rallies = createAllianceRallies({ onJoin: deps.onJoinRally });
    const bodies: Record<AllianceTab, HTMLElement> = { members: members.root, chat: chat.root, help: help.root, rallies: rallies.root };
    const tabs = new Map<AllianceTab, { button: HTMLButtonElement; body: HTMLElement }>();
    const unread = el("span", "badge tab-badge");
    unread.dataset.testid = "chat-unread";
    unread.hidden = true;
    for (const name of ALLIANCE_TABS) {
      const button = el("button", "tab-btn");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.dataset.testid = `tab-${name}`;
      button.append(el("span", undefined, t(`alliance.tab.${name}`)));
      if (name === "chat") button.append(unread);
      button.addEventListener("click", () => selectTab(name));
      bar.append(button);
      tabs.set(name, { button, body: bodies[name] });
    }
    view.append(bar, ...ALLIANCE_TABS.map((name) => bodies[name]));
    return { id, view, tabs, unread, members, chat, help, rallies };
  };

  const show = (next: string, build: () => void): void => {
    if (next === shown) return;
    shown = next;
    disposeJoined();
    showError(null);
    build();
  };

  const update = (): void => {
    if (!open) {
      store.setChatOpen(false);
      return;
    }
    const a = store.alliance();
    if (!store.loaded()) show("loading", () => body.replaceChildren(loading));
    else if (a === null) {
      show("browse", () => {
        const browse = createAllianceBrowse({ store, onError: showError });
        body.replaceChildren(browse.root);
        browse.open();
      });
    } else {
      show(`joined:${a.id}`, () => {
        joined = buildJoined(a.id);
        body.replaceChildren(joined.view);
        selectTab(tab);
      });
    }
    syncChatOpen();
    if (a === null || joined === null) return;
    const now = deps.now();
    joined.members.update(a);
    joined.chat.update(store.messages(), deps.myHandle(), store.connected());
    joined.help.update(store.help(), now);
    joined.rallies.update(deps.snapshot()?.rallies ?? [], now);
    const unread = store.unread();
    joined.unread.hidden = unread === 0;
    joined.unread.textContent = formatAmount(currentLanguage(), unread);
  };

  const toggle = (next = !open): void => {
    const was = open;
    open = next;
    root.hidden = !open;
    deps.onChange({ open, tab });
    if (open && !was) {
      deps.onOpen();
      // Search results go stale while the panel is closed.
      if (shown === "browse") shown = "";
    }
    update();
  };

  // Restored open after a language change: draw at once.
  if (open) update();

  return { root, toggle, isOpen: () => open, update, dispose: disposeJoined };
};
