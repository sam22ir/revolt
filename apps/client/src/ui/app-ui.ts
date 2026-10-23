import { productionMultiplier, type BattleReport, type BuildingId, type HelpKind } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { textDirection, type Language } from "../i18n/languages.ts";
import type { GoogleSignIn } from "../net/google.ts";
import type { TileRef, WorldCamera } from "../scene/world-scene.ts";
import type { AllianceStore } from "../state/alliance-store.ts";
import type { GameStore } from "../state/game-store.ts";
import type { WorldStore } from "../state/world-store.ts";
import { createAccountPanel } from "./account-panel.ts";
import { createAlliancePanel, type AllianceTab } from "./alliance-panel.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { el } from "./dom.ts";
import { homeIcon } from "./icons.ts";
import { createHud } from "./hud.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";
import { createMarchDialog } from "./march-dialog.ts";
import { createMarchesList } from "./marches-list.ts";
import { createReportToast } from "./report-toast.ts";
import { createReportsPanel } from "./reports-panel.ts";
import { createMapLabels } from "./map-labels.ts";
import { createMinimap } from "./minimap.ts";
import { createTargetSearch } from "./target-search.ts";
import { createTilePanel } from "./tile-panel.ts";

/** The two things the game canvas can show. */
export type View = "base" | "map";

export interface AppUi {
  readonly select: (id: BuildingId | null) => void;
  readonly selectTile: (tile: TileRef | null) => void;
  /** The tile in the middle of the map view, for the coordinate readout. */
  readonly setCenter: (tile: TileRef) => void;
  /** Where the map camera looks, for the minimap's outline (the free band's corners in fractional tiles). */
  readonly setViewport: (corners: readonly { readonly x: number; readonly y: number }[]) => void;
  /** The map camera or snapshot changed: name plates and the arrow home follow. */
  readonly setCamera: (camera: WorldCamera) => void;
}

interface UiDeps {
  readonly store: GameStore;
  readonly world: WorldStore;
  readonly alliance: AllianceStore;
  readonly onLanguage: (lang: Language) => Promise<void>;
  readonly onSelectionChange: (id: BuildingId | null) => void;
  readonly onTileSelectionChange: (tile: TileRef | null) => void;
  readonly onViewChange: (view: View) => void;
  /** The player tapped the minimap: bring this tile to the middle of the map. */
  readonly onJump: (tile: TileRef) => void;
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
  // Built once: a language change rebuilds the overlay around it but must not redraw it.
  const minimap = createMinimap({ onJump: deps.onJump });
  const labels = createMapLabels({ onJump: deps.onJump, rtl: () => textDirection(currentLanguage()) === "rtl" });
  const search = createTargetSearch({
    snapshot: () => deps.world.snapshot(),
    // Centre first, then select: opening the tile sheet changes the free band, and the selection pans the tile above it.
    onFound: (npc) => {
      deps.onJump({ x: npc.x, y: npc.y });
      selectTile({ x: npc.x, y: npc.y });
    },
  });
  // Kept here, not in the panel, so a language change (which rebuilds the overlay) does not close it.
  const allianceView: { open: boolean; tab: AllianceTab } = { open: false, tab: "members" };
  // Kept here for the same reason: a language change rebuilds the account panel, and it should stay open.
  const accountView = { open: false };
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
    const account = createAccountPanel({
      google: deps.google,
      onIdToken: (idToken) => deps.store.signInWithGoogle(idToken),
      settings: switcher,
      onOpenChange: (open) => (accountView.open = open),
    });
    account.toggle(accountView.open);
    const accountButton = el("button", "nav-btn account-open", t("account.button"));
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
    // Shown on the map toggle while the builders are idle and the player is on the map (the queue pill is hidden there).
    const idleBadge = el("span", "badge dot");
    idleBadge.dataset.testid = "builders-idle";
    idleBadge.setAttribute("aria-label", t("queue.idle"));
    idleBadge.hidden = true;

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
    const hud = createHud([], [mapToggle, allianceButton, reportsButton, accountButton], [marches.root, search.root, coords], () =>
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
        dialog.open({ id: npcId, region: null, ...where }, { kind: "rally_join", rally });
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
    // Jumps the camera to the player's own base; shown only with the minimap, next to it.
    const myBase = el("button", "my-base-btn");
    myBase.type = "button";
    myBase.dataset.testid = "my-base";
    myBase.hidden = true;
    myBase.setAttribute("aria-label", t("map.myBase"));
    myBase.innerHTML = homeIcon();
    myBase.addEventListener("click", () => {
      const mine = deps.world.snapshot()?.bases.find((b) => b.mine);
      if (mine !== undefined) deps.onJump({ x: mine.x, y: mine.y });
    });

    minimap.setLabel(t("map.minimap"));
    search.relabel();
    labels.relabel();
    root.replaceChildren(labels.root, hud.root, minimap.root, myBase, panel.root, tilePanel.root, alliance.root, account.root, reports.root, toast.root, dialog.root);

    ctl.refresh = () => {
      const state = deps.store.state();
      const now = deps.store.now();
      const snapshot = deps.world.snapshot();
      hud.update(state, now, canAskHelp("upgrade"), productionMultiplier(deps.store.world(), now));
      minimap.update(snapshot, now);
      search.update(snapshot);
      search.setVisible(view === "map");
      labels.setVisible(view === "map");
      // The overview is for the bare map: any sheet or panel over it takes its place.
      const overview = view === "map" && selectedTile === null && !alliance.isOpen() && !reports.isOpen() && account.root.hidden === true;
      minimap.setVisible(overview);
      myBase.hidden = !overview;
      myBase.disabled = !snapshot?.bases.some((b) => b.mine);
      hud.setOffline(deps.store.status() === "offline");
      panel.update(state, now, canAskHelp("training"));
      marches.update(state, now);
      tilePanel.update(snapshot, { alliance: deps.alliance.alliance(), now });
      alliance.update();
      dialog.update(state, snapshot);
      account.update(deps.store.account());
      idleBadge.hidden = !(state.queue === null && view === "map");
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
      mapToggle.append(idleBadge);
      hud.setView(view);
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
    setViewport: (corners) => minimap.setViewport(corners),
    setCamera: (camera) => labels.update(camera),
  };
};
