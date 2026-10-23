import { productionMultiplier, type BattleReport, type BuildingId, type HelpKind } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { textDirection, type Language } from "../i18n/languages.ts";
import type { Platform } from "../platform/index.ts";
import type { GoogleSignIn } from "../net/google.ts";
import type { TileRef, WorldCamera } from "../scene/world-scene.ts";
import type { AllianceStore } from "../state/alliance-store.ts";
import { activeBackground } from "../state/background.ts";
import type { GameStore } from "../state/game-store.ts";
import type { LiveStore, LiveTab } from "../state/live-store.ts";
import { storyClaimable } from "../state/hero-view.ts";
import type { WorldStore } from "../state/world-store.ts";
import { createAccountPanel } from "./account-panel.ts";
import { createAlliancePanel, type AllianceTab } from "./alliance-panel.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { el } from "./dom.ts";
import { homeIcon, navIcon, searchIcon, type NavIconId } from "./icons.ts";
import { createHeroesPanel } from "./heroes-panel.ts";
import { createHud } from "./hud.ts";
import { createLivePanel } from "./live-panel.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";
import { createMarchDialog } from "./march-dialog.ts";
import { createMarchesList } from "./marches-list.ts";
import { createReportToast } from "./report-toast.ts";
import { createReportsPanel } from "./reports-panel.ts";
import { createMapLabels } from "./map-labels.ts";
import { createMinimap } from "./minimap.ts";
import { createStoryPanel } from "./story-panel.ts";
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
  /** Opens the account panel (a returning player who chose "I already have an account" lands here to sign in). */
  readonly openAccount: () => void;
}

interface UiDeps {
  readonly store: GameStore;
  readonly world: WorldStore;
  readonly alliance: AllianceStore;
  readonly live: LiveStore;
  readonly platform: Platform;
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
  /** Closes every overlay panel (account, reports, alliance, heroes, story, live) except the one named. */
  closeOverlays: (except?: Overlay) => void;
  openReport: (id: string) => void;
  announce: (report: BattleReport) => void;
  updateReports: () => void;
  updateCenter: () => void;
  updateView: () => void;
  openAccount: () => void;
}

/** The panels that share the bottom of the screen; opening one closes the others. */
type Overlay = "account" | "reports" | "alliance" | "heroes" | "story" | "live";

const noop = (): void => {};

interface NavButton {
  readonly button: HTMLButtonElement;
  readonly icon: HTMLImageElement;
  readonly label: HTMLElement;
}

/** A bottom nav button: icon, then the label (which the CSS ellipsises). Badges are appended by the caller. */
const navButton = (icon: NavIconId, text: string): NavButton => {
  const button = el("button", "nav-btn");
  button.type = "button";
  const iconEl = navIcon(icon);
  const label = el("span", "nav-label", text);
  button.append(iconEl, label);
  return { button, icon: iconEl, label };
};

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
      searchView.open = false;
      deps.onJump({ x: npc.x, y: npc.y });
      selectTile({ x: npc.x, y: npc.y });
    },
  });
  // Kept here, not in the panel, so a language change (which rebuilds the overlay) does not close it.
  const allianceView: { open: boolean; tab: AllianceTab } = { open: false, tab: "members" };
  const heroesView = { open: false };
  const storyOpen = { open: false };
  const liveView: { open: boolean; tab: LiveTab } = { open: false, tab: "events" };
  // Kept here for the same reason: a language change rebuilds the account panel, and it should stay open.
  const accountView = { open: false };
  // The target search sheet, opened from the icon beside the minimap; kept here so a rebuild does not close it.
  const searchView = { open: false };
  let disposeAlliance = noop;
  let disposeLive = noop;
  const ctl: Controls = {
    refresh: noop,
    showBuilding: noop,
    showTile: noop,
    closeOverlays: noop,
    openReport: noop,
    announce: noop,
    updateReports: noop,
    updateCenter: noop,
    updateView: noop,
    openAccount: noop,
  };

  const select = (id: BuildingId | null): void => {
    if (view !== "base") id = null;
    selected = id;
    if (id !== null) ctl.closeOverlays();
    ctl.showBuilding(id);
    deps.onSelectionChange(id);
    ctl.refresh();
  };

  const selectTile = (tile: TileRef | null): void => {
    if (view !== "map") tile = null;
    selectedTile = tile;
    if (tile !== null) ctl.closeOverlays();
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
    disposeLive();
    const switcher = createLanguageSwitcher((lang) => {
      void deps.onLanguage(lang).then(build);
    });
    const account = createAccountPanel({
      google: deps.google,
      onIdToken: (idToken) => deps.store.signInWithGoogle(idToken),
      consent: deps.platform.consent,
      settings: switcher,
      onOpenChange: (open) => (accountView.open = open),
    });
    account.toggle(accountView.open);
    // A round icon in the top inline-start corner of the HUD (not in the bottom nav).
    const accountButton = el("button", "account-open");
    accountButton.type = "button";
    accountButton.setAttribute("aria-label", t("account.button"));
    accountButton.title = t("account.button");
    accountButton.append(navIcon("account"));
    accountButton.dataset.testid = "account";
    accountButton.addEventListener("click", () => {
      select(null);
      selectTile(null);
      ctl.closeOverlays("account");
      account.toggle();
    });

    // The icon shows the view you would switch to: the map from the base, the base from the map.
    const mapNav = navButton("map", t("nav.map"));
    const mapToggle = mapNav.button;
    let mapIcon = mapNav.icon;
    mapToggle.dataset.testid = "map-toggle";
    mapToggle.classList.add("nav-corner");
    mapToggle.addEventListener("click", () => setView(view === "base" ? "map" : "base"));
    // Shown on the map toggle while the builders are idle and the player is on the map (the queue pill is hidden there).
    const idleBadge = el("span", "badge dot");
    idleBadge.dataset.testid = "builders-idle";
    idleBadge.setAttribute("aria-label", t("queue.idle"));
    idleBadge.hidden = true;
    mapToggle.append(idleBadge);

    const reportsNav = navButton("reports", t("nav.reports"));
    const reportsButton = reportsNav.button;
    reportsButton.dataset.testid = "reports-open";
    const badge = el("span", "badge");
    badge.dataset.testid = "reports-badge";
    badge.hidden = true;
    reportsButton.append(badge);
    reportsButton.addEventListener("click", () => reports.toggle());

    const allianceNav = navButton("alliance", t("nav.alliance"));
    const allianceButton = allianceNav.button;
    allianceButton.dataset.testid = "alliance-open";
    const allianceBadge = el("span", "badge");
    allianceBadge.dataset.testid = "alliance-badge";
    allianceBadge.hidden = true;
    allianceButton.append(allianceBadge);
    allianceButton.addEventListener("click", () => alliance.toggle());

    const heroesButton = el("button", "nav-btn");
    heroesButton.type = "button";
    heroesButton.dataset.testid = "heroes-open";
    heroesButton.append(el("span", undefined, t("nav.heroes")));
    heroesButton.addEventListener("click", () => heroes.toggle());

    const storyButton = el("button", "nav-btn");
    storyButton.type = "button";
    storyButton.dataset.testid = "story-open";
    const storyBadge = el("span", "badge");
    storyBadge.dataset.testid = "story-badge";
    storyBadge.hidden = true;
    storyBadge.textContent = "!";
    storyButton.append(el("span", undefined, t("nav.story")), storyBadge);
    storyButton.addEventListener("click", () => story.toggle());

    const liveButton = el("button", "nav-btn");
    liveButton.type = "button";
    liveButton.dataset.testid = "live-open";
    const liveBadge = el("span", "badge");
    liveBadge.dataset.testid = "live-badge";
    liveBadge.hidden = true;
    liveButton.append(el("span", undefined, t("nav.live")), liveBadge);
    liveButton.addEventListener("click", () => live.toggle());

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
    const hud = createHud([accountButton], [mapToggle, allianceButton, reportsButton, heroesButton, storyButton, liveButton], [marches.root], [coords], () =>
      askHelp("upgrade", (text) => hud.showHelpNote(text)),
    );
    const panel = createBuildingPanel({
      onUpgrade: (id) => deps.store.upgrade(id),
      onTrain: (troop, count) => deps.store.train(troop, count),
      onAskTrainingHelp: () => askHelp("training", (text) => panel.showTrainingHelpNote(text)),
      onOpenHeroes: () => {
        select(null);
        heroes.toggle(true);
      },
      onClose: () => select(null),
    });
    const dialog = createMarchDialog({
      onSend: (id, troops, loadout) => deps.store.march(id, troops, loadout),
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
        ctl.closeOverlays("alliance");
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
        ctl.closeOverlays("reports");
        deps.world.markSeen();
      },
      onClose: noop,
    });
    const heroes = createHeroesPanel({
      onRecruit: () => deps.store.recruitHero(),
      onLevel: (id) => deps.store.levelHero(id),
      onOpen: () => {
        select(null);
        selectTile(null);
        ctl.closeOverlays("heroes");
      },
      initial: heroesView,
      onChange: (s) => (heroesView.open = s.open),
    });
    const story = createStoryPanel({
      onClaim: () => deps.store.claimChapter(),
      onOpen: () => {
        select(null);
        selectTile(null);
        ctl.closeOverlays("story");
      },
      initial: storyOpen,
      onChange: (s) => (storyOpen.open = s.open),
    });
    const live = createLivePanel({
      live: deps.live,
      onOpen: () => {
        select(null);
        selectTile(null);
        ctl.closeOverlays("live");
      },
      initial: liveView,
      onChange: (s) => {
        liveView.open = s.open;
        liveView.tab = s.tab;
      },
    });
    disposeLive = live.dispose;
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

    // Opens the target search sheet; sits beside the minimap, after the home button.
    const searchButton = el("button", "search-open-btn");
    searchButton.type = "button";
    searchButton.dataset.testid = "search-open";
    searchButton.hidden = true;
    searchButton.setAttribute("aria-label", t("search.title"));
    searchButton.innerHTML = searchIcon();
    searchButton.addEventListener("click", () => {
      searchView.open = !searchView.open;
      ctl.refresh();
    });

    minimap.setLabel(t("map.minimap"));
    search.relabel();
    labels.relabel();
    root.replaceChildren(
      labels.root,
      hud.root,
      minimap.root,
      myBase,
      searchButton,
      search.root,
      panel.root,
      tilePanel.root,
      alliance.root,
      heroes.root,
      story.root,
      live.root,
      account.root,
      reports.root,
      toast.root,
      dialog.root,
    );

    ctl.refresh = () => {
      const state = deps.store.state();
      const now = deps.store.now();
      const snapshot = deps.world.snapshot();
      hud.update(state, now, canAskHelp("upgrade"), productionMultiplier(deps.store.world(), now));
      minimap.update(snapshot, now);
      search.update(snapshot);
      if (view !== "map" || selectedTile !== null) searchView.open = false;
      search.setVisible(view === "map" && searchView.open);
      labels.setVisible(view === "map");
      // The overview is for the bare map: any sheet or panel over it takes its place.
      const overview = view === "map" && selectedTile === null && !alliance.isOpen() && !reports.isOpen() && account.root.hidden === true;
      minimap.setVisible(overview);
      myBase.hidden = !overview;
      searchButton.hidden = !overview;
      myBase.disabled = !snapshot?.bases.some((b) => b.mine);
      hud.setOffline(deps.store.status() === "offline");
      panel.update(state, now, canAskHelp("training"));
      marches.update(state, now);
      tilePanel.update(snapshot, { alliance: deps.alliance.alliance(), now });
      alliance.update();
      heroes.update(state);
      story.update(state);
      live.update(state, now);
      const waiting = deps.live.badge();
      liveBadge.hidden = waiting === 0;
      liveBadge.textContent = formatAmount(currentLanguage(), waiting);
      storyBadge.hidden = !storyClaimable(state, activeBackground());
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
    ctl.closeOverlays = (except) => {
      const closers: Record<Overlay, () => void> = {
        account: () => account.toggle(false),
        reports: () => reports.toggle(false),
        alliance: () => alliance.toggle(false),
        heroes: () => heroes.toggle(false),
        story: () => story.toggle(false),
        live: () => live.toggle(false),
      };
      for (const name of Object.keys(closers) as Overlay[]) if (name !== except) closers[name]();
    };
    ctl.openAccount = () => {
      select(null);
      selectTile(null);
      ctl.closeOverlays("account");
      account.toggle(true);
    };
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
      const next = navIcon(view === "base" ? "map" : "base");
      mapIcon.replaceWith(next);
      mapIcon = next;
      mapNav.label.textContent = view === "base" ? t("nav.map") : t("nav.base");
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
  deps.live.subscribe(() => ctl.refresh());
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
    openAccount: () => ctl.openAccount(),
  };
};
