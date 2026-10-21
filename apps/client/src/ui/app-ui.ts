import type { BattleReport, BuildingId, HelpKind } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import type { Language } from "../i18n/languages.ts";
import type { GoogleSignIn } from "../net/google.ts";
import type { TileRef } from "../scene/world-scene.ts";
import type { AllianceStore } from "../state/alliance-store.ts";
import type { LiveStore, LiveTab } from "../state/live-store.ts";
import type { Platform } from "../platform/index.ts";
import { createLivePanel } from "./live-panel.ts";
import type { GameStore } from "../state/game-store.ts";
import type { WorldStore } from "../state/world-store.ts";
import { createAccountPanel } from "./account-panel.ts";
import { createAlliancePanel, type AllianceTab } from "./alliance-panel.ts";
import { activeBackground } from "../state/background.ts";
import { storyClaimable } from "../state/hero-view.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { el } from "./dom.ts";
import { createHeroesPanel } from "./heroes-panel.ts";
import { createHud } from "./hud.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";
import { createMarchDialog } from "./march-dialog.ts";
import { createMarchesList } from "./marches-list.ts";
import { createReportToast } from "./report-toast.ts";
import { createReportsPanel } from "./reports-panel.ts";
import { createStoryPanel } from "./story-panel.ts";
import { createTilePanel } from "./tile-panel.ts";

/** The two things the game canvas can show. */
export type View = "base" | "map";

export interface AppUi {
  readonly select: (id: BuildingId | null) => void;
  readonly selectTile: (tile: TileRef | null) => void;
  /** The tile in the middle of the map view, for the coordinate readout. */
  readonly setCenter: (tile: TileRef) => void;
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
  readonly google: GoogleSignIn | null;
}

/** What the current build of the overlay offers to the rest of the module. */
interface Controls {
  refresh: () => void;
  showBuilding: (id: BuildingId | null) => void;
  showTile: (tile: TileRef | null) => void;
  /** Closes every overlay panel (account, reports, alliance, heroes, story) except the one named. */
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

/** Mounts the DOM overlay (HUD, panels, dialogs). Rebuilt on language change. */
export const mountUi = (root: HTMLElement, deps: UiDeps): AppUi => {
  let view: View = "base";
  let selected: BuildingId | null = null;
  let selectedTile: TileRef | null = null;
  let center: TileRef | null = null;
  // Kept here, not in the panel, so a language change (which rebuilds the overlay) does not close it.
  const allianceView: { open: boolean; tab: AllianceTab } = { open: false, tab: "members" };
  const heroesView = { open: false };
  const storyOpen = { open: false };
  const liveView: { open: boolean; tab: LiveTab } = { open: false, tab: "events" };
  let disposeLive = noop;
  let disposeAlliance = noop;
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
    const account = createAccountPanel({ google: deps.google, onIdToken: (idToken) => deps.store.signInWithGoogle(idToken), consent: deps.platform.consent });
    const accountButton = el("button", "account-open", t("account.button"));
    accountButton.type = "button";
    accountButton.dataset.testid = "account";
    accountButton.addEventListener("click", () => {
      select(null);
      selectTile(null);
      ctl.closeOverlays("account");
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
    const hud = createHud([accountButton, switcher], [mapToggle, allianceButton, reportsButton, heroesButton, storyButton, liveButton], [marches.root, coords], () =>
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
      onSend: (id, troops, squad) => deps.store.march(id, troops, squad),
      onRallyStart: (id, troops, gatherMs, squad) => deps.store.startRally(id, troops, gatherMs, squad),
      onRallyJoin: (rallyId, troops, squad) => deps.store.joinRally(rallyId, troops, squad),
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
      onRecruit: (id) => deps.store.recruitHero(id),
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
    root.replaceChildren(hud.root, panel.root, tilePanel.root, alliance.root, heroes.root, story.root, live.root, account.root, reports.root, toast.root, dialog.root);

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
      heroes.update(state);
      story.update(state);
      live.update(state, now);
      const waiting = deps.live.badge();
      liveBadge.hidden = waiting === 0;
      liveBadge.textContent = formatAmount(currentLanguage(), waiting);
      storyBadge.hidden = !storyClaimable(state, activeBackground());
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
    openAccount: () => ctl.openAccount(),
  };
};
