import type { BattleReport, BuildingId, HelpKind } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import type { Language } from "../i18n/languages.ts";
import type { GoogleSignIn } from "../net/google.ts";
import type { TileRef } from "../scene/world-scene.ts";
import type { AllianceStore } from "../state/alliance-store.ts";
import type { GameStore } from "../state/game-store.ts";
import type { WorldStore } from "../state/world-store.ts";
import { createAccountPanel } from "./account-panel.ts";
import { createAlliancePanel, type AllianceTab } from "./alliance-panel.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { el } from "./dom.ts";
import { createHud } from "./hud.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";
import { createMarchDialog } from "./march-dialog.ts";
import { createMarchesList } from "./marches-list.ts";
import { createReportToast } from "./report-toast.ts";
import { createReportsPanel } from "./reports-panel.ts";
import { createTilePanel } from "./tile-panel.ts";

/** The two things the game canvas can show. */
export type View = "base" | "map";

export interface AppUi {
  readonly select: (id: BuildingId | null) => void;
  readonly selectTile: (tile: TileRef | null) => void;
  /** The tile in the middle of the map view, for the coordinate readout. */
  readonly setCenter: (tile: TileRef) => void;
}

interface UiDeps {
  readonly store: GameStore;
  readonly world: WorldStore;
  readonly alliance: AllianceStore;
  readonly onLanguage: (lang: Language) => Promise<void>;
  readonly onSelectionChange: (id: BuildingId | null) => void;
  readonly onTileSelectionChange: (tile: TileRef | null) => void;
  readonly onViewChange: (view: View) => void;
  readonly google: GoogleSignIn | null;
}

/** What the current build of the overlay offers to the rest of the module. */
interface Controls {
  refresh: () => void;
  showBuilding: (id: BuildingId | null) => void;
  showTile: (tile: TileRef | null) => void;
  closeAccount: () => void;
  closeAlliance: () => void;
  closeReports: () => void;
  openReport: (id: string) => void;
  announce: (report: BattleReport) => void;
  updateReports: () => void;
  updateCenter: () => void;
  updateView: () => void;
}

const noop = (): void => {};

/** Mounts the DOM overlay (HUD, panels, dialogs). Rebuilt on language change. */
export const mountUi = (root: HTMLElement, deps: UiDeps): AppUi => {
  let view: View = "base";
  let selected: BuildingId | null = null;
  let selectedTile: TileRef | null = null;
  let center: TileRef | null = null;
  // Kept here, not in the panel, so a language change (which rebuilds the overlay) does not close it.
  const allianceView: { open: boolean; tab: AllianceTab } = { open: false, tab: "members" };
  let disposeAlliance = noop;
  const ctl: Controls = {
    refresh: noop,
    showBuilding: noop,
    showTile: noop,
    closeAccount: noop,
    closeAlliance: noop,
    closeReports: noop,
    openReport: noop,
    announce: noop,
    updateReports: noop,
    updateCenter: noop,
    updateView: noop,
  };

  const select = (id: BuildingId | null): void => {
    if (view !== "base") id = null;
    selected = id;
    if (id !== null) {
      ctl.closeAccount();
      ctl.closeReports();
      ctl.closeAlliance();
    }
    ctl.showBuilding(id);
    deps.onSelectionChange(id);
    ctl.refresh();
  };

  const selectTile = (tile: TileRef | null): void => {
    if (view !== "map") tile = null;
    selectedTile = tile;
    if (tile !== null) {
      ctl.closeAccount();
      ctl.closeReports();
      ctl.closeAlliance();
    }
    ctl.showTile(tile);
    deps.onTileSelectionChange(tile);
    ctl.refresh();
  };

  const setView = (next: View): void => {
    if (next === view) return;
    view = next;
    select(null);
    selectTile(null);
    ctl.updateView();
    deps.onViewChange(next);
  };

  /** The player can ask the alliance for help on a job of this kind: they have an alliance and no open request for it. */
  const canAskHelp = (kind: HelpKind): boolean => deps.alliance.alliance() !== null && deps.alliance.ownRequest(kind, deps.store.now()) === null;

  const build = (): void => {
    disposeAlliance();
    const switcher = createLanguageSwitcher((lang) => {
      void deps.onLanguage(lang).then(build);
    });
    const account = createAccountPanel({ google: deps.google, onIdToken: (idToken) => deps.store.signInWithGoogle(idToken) });
    const accountButton = el("button", "account-open", t("account.button"));
    accountButton.type = "button";
    accountButton.dataset.testid = "account";
    accountButton.addEventListener("click", () => {
      select(null);
      selectTile(null);
      reports.toggle(false);
      alliance.toggle(false);
      account.toggle();
    });

    const mapToggle = el("button", "nav-btn");
    mapToggle.type = "button";
    mapToggle.dataset.testid = "map-toggle";
    mapToggle.addEventListener("click", () => setView(view === "base" ? "map" : "base"));

    const reportsButton = el("button", "nav-btn");
    reportsButton.type = "button";
    reportsButton.dataset.testid = "reports-open";
    const reportsLabel = el("span", undefined, t("nav.reports"));
    const badge = el("span", "badge");
    badge.dataset.testid = "reports-badge";
    badge.hidden = true;
    reportsButton.append(reportsLabel, badge);
    reportsButton.addEventListener("click", () => reports.toggle());

    const allianceButton = el("button", "nav-btn");
    allianceButton.type = "button";
    allianceButton.dataset.testid = "alliance-open";
    const allianceLabel = el("span", undefined, t("nav.alliance"));
    const allianceBadge = el("span", "badge");
    allianceBadge.dataset.testid = "alliance-badge";
    allianceBadge.hidden = true;
    allianceButton.append(allianceLabel, allianceBadge);
    allianceButton.addEventListener("click", () => alliance.toggle());

    const coords = el("div", "coord-pill");
    coords.dataset.testid = "coords";
    coords.hidden = true;
    const marches = createMarchesList();

    // Asking for help is refused now and then (no job any more, already asked); say why for a moment.
    const askHelp = (kind: HelpKind, note: (text: string) => void): void => {
      void deps.alliance.requestHelp(kind).then((outcome) => {
        if (!outcome.ok) note(t(`reason.${outcome.reason}`));
      });
    };
    const hud = createHud([accountButton, switcher], [mapToggle, allianceButton, reportsButton], [marches.root, coords], () =>
      askHelp("upgrade", (text) => hud.showHelpNote(text)),
    );
    const panel = createBuildingPanel({
      onUpgrade: (id) => deps.store.upgrade(id),
      onTrain: (troop, count) => deps.store.train(troop, count),
      onAskTrainingHelp: () => askHelp("training", (text) => panel.showTrainingHelpNote(text)),
      onClose: () => select(null),
    });
    const dialog = createMarchDialog({
      onSend: (id, troops) => deps.store.march(id, troops),
      onRallyStart: (id, troops, gatherMs) => deps.store.startRally(id, troops, gatherMs),
      onRallyJoin: (rallyId, troops) => deps.store.joinRally(rallyId, troops),
      onClosed: noop,
    });
    const tilePanel = createTilePanel({
      onClose: () => selectTile(null),
      onSendMarch: (npc) => dialog.open(npc),
      onStartRally: (npc) => dialog.open(npc, { kind: "rally_start" }),
      onJoinRally: (npc, rally) => dialog.open(npc, { kind: "rally_join", rally }),
      onPlaceHq: (tile) => deps.alliance.placeHq(tile.x, tile.y),
    });
    const alliance = createAlliancePanel({
      store: deps.alliance,
      myHandle: () => deps.store.account().handle,
      now: () => deps.store.now(),
      snapshot: () => deps.world.snapshot(),
      onJoinRally: (rally) => {
        const { npcId, ...where } = rally.target;
        dialog.open({ id: npcId, ...where }, { kind: "rally_join", rally });
      },
      onOpen: () => {
        select(null);
        selectTile(null);
        ctl.closeAccount();
        ctl.closeReports();
      },
      initial: allianceView,
      onChange: (state) => {
        allianceView.open = state.open;
        allianceView.tab = state.tab;
      },
    });
    disposeAlliance = alliance.dispose;
    const reports = createReportsPanel({
      onOpen: () => {
        select(null);
        selectTile(null);
        ctl.closeAccount();
        ctl.closeAlliance();
        deps.world.markSeen();
      },
      onClose: noop,
    });
    const toast = createReportToast((id) => reports.showReport(id));

    panel.show(selected);
    tilePanel.show(selectedTile);
    root.replaceChildren(hud.root, panel.root, tilePanel.root, alliance.root, account.root, reports.root, toast.root, dialog.root);

    ctl.refresh = () => {
      const state = deps.store.state();
      const now = deps.store.now();
      const snapshot = deps.world.snapshot();
      hud.update(state, now, canAskHelp("upgrade"));
      hud.setOffline(deps.store.status() === "offline");
      panel.update(state, now, canAskHelp("training"));
      marches.update(state, now);
      tilePanel.update(snapshot, { alliance: deps.alliance.alliance(), now });
      alliance.update();
      dialog.update(state, snapshot);
      account.update(deps.store.account());
      const unread = deps.world.unread();
      badge.hidden = unread === 0;
      badge.textContent = formatAmount(currentLanguage(), unread);
      const chatUnread = deps.alliance.unread();
      allianceBadge.hidden = chatUnread === 0;
      allianceBadge.textContent = formatAmount(currentLanguage(), chatUnread);
    };
    ctl.showBuilding = panel.show;
    ctl.showTile = tilePanel.show;
    ctl.closeAccount = () => account.toggle(false);
    ctl.closeAlliance = () => alliance.toggle(false);
    ctl.closeReports = () => reports.toggle(false);
    ctl.openReport = reports.showReport;
    ctl.announce = (report) => {
      if (!reports.isOpen()) toast.show(report);
    };
    ctl.updateReports = () => {
      reports.update(deps.world.reports());
      // A list the player is looking at has nothing new to announce.
      if (reports.isOpen()) deps.world.markSeen();
    };
    ctl.updateCenter = () => {
      coords.hidden = view !== "map" || center === null;
      if (center === null) return;
      const lang = currentLanguage();
      coords.textContent = t("map.coords", { x: formatAmount(lang, center.x), y: formatAmount(lang, center.y) });
    };
    ctl.updateView = () => {
      mapToggle.textContent = view === "base" ? t("nav.map") : t("nav.base");
      ctl.updateCenter();
    };
    ctl.updateView();
    ctl.updateReports();
    ctl.refresh();
  };

  build();
  deps.store.subscribe(() => ctl.refresh());
  deps.world.subscribeSnapshot(() => ctl.refresh());
  deps.alliance.subscribe(() => ctl.refresh());
  deps.world.subscribeReports((_reports, fresh) => {
    ctl.updateReports();
    ctl.refresh();
    if (fresh !== null) ctl.announce(fresh);
  });
  return {
    select,
    selectTile,
    setCenter: (tile) => {
      center = tile;
      ctl.updateCenter();
    },
  };
};
