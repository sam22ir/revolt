import Phaser from "phaser";
import type { AllianceView, BackgroundId, BuildingId, ChatMessage, HelpRequestView, MapSnapshot } from "@revolt/rules";
import { changeLanguage, initI18n } from "./i18n/i18n.ts";
import { loadLanguagePref, storeLanguagePref } from "./i18n/language-pref.ts";
import { detectLanguage } from "./i18n/languages.ts";
import { BaseScene } from "./scene/base-scene.ts";
import { followParentSize, hiDpiScaleConfig } from "./scene/hidpi-scale.ts";
import { showScene } from "./scene/scene-switch.ts";
import { WorldScene } from "./scene/world-scene.ts";
import { allianceSocketUrl, createApi, defaultApiUrl, mapSocketUrl } from "./net/api.ts";
import { createAllianceSocket } from "./net/alliance-socket.ts";
import { googleSignIn } from "./net/google.ts";
import { createMapSocket } from "./net/map-socket.ts";
import { createAllianceStore } from "./state/alliance-store.ts";
import { createLiveStore } from "./state/live-store.ts";
import { createPlatform } from "./platform/index.ts";
import { installCrashHooks } from "./platform/crash.ts";
import { connectGameStore, type GameStore } from "./state/game-store.ts";
import { createWorldStore } from "./state/world-store.ts";
import { mountUi } from "./ui/app-ui.ts";
import { pickBackground } from "./ui/background-picker.ts";
import { showBootStatus } from "./ui/boot-status.ts";
import "./ui/style.css";
import "./ui/map.css";
import "./ui/alliance.css";
import "./ui/heroes.css";
import "./ui/live.css";

const TICK_MS = 250;
const RETRY_MS = [1000, 2000, 5000, 10_000];

/** The server owns the base, so nothing is playable until it answers; keep retrying. */
const connect = async (uiRoot: HTMLElement, open: () => Promise<GameStore>): Promise<GameStore> => {
  for (let attempt = 0; ; attempt++) {
    showBootStatus(uiRoot, attempt === 0 ? "connecting" : "retrying");
    try {
      return await open();
    } catch {
      await new Promise((r) => window.setTimeout(r, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]));
    }
  }
};

const start = async (): Promise<void> => {
  const storage = window.localStorage;
  await initI18n(loadLanguagePref(storage) ?? detectLanguage(navigator.languages));

  const uiRoot = document.getElementById("ui");
  if (uiRoot === null) throw new Error("#ui missing");
  const apiUrl = defaultApiUrl();
  const api = createApi(apiUrl);
  // The device clock only predicts between server answers; rules only ever receive `now`.
  // Asked once, only when this device has no account yet. Opening is retried until the server answers, so the answer is kept.
  let returning = false;
  let asked: Promise<BackgroundId> | null = null;
  const chooseBackground = (): Promise<BackgroundId> =>
    (asked ??= pickBackground(uiRoot, storage).then((choice) => {
      returning = choice.returning;
      return choice.background;
    }));
  const store = await connect(uiRoot, () => connectGameStore({ api, storage, clock: () => Date.now(), chooseBackground }));
  // Scenes, art, names and story are all chosen by background. A Google sign-in that lands on an account of the
  // other background starts the app over rather than rebuilding every screen.
  const background = store.background();
  store.onSessionChange(() => {
    if (store.background() !== background) window.location.reload();
  });
  const socket = createMapSocket({ url: mapSocketUrl(apiUrl), token: store.token });
  const world = createWorldStore({ api, game: store, socket, storage });
  // The alliance feed opens only while the player is in an alliance (the server refuses it otherwise).
  const alliance = createAllianceStore({ api, game: store, socket: createAllianceSocket({ url: allianceSocketUrl(apiUrl), token: store.token }) });

  // Billing, analytics and crash reporting come from one place (platform/index.ts): no-ops until a release wires real ones.
  const platform = createPlatform({ billingMock: import.meta.env.VITE_BILLING_MOCK === "1", dev: import.meta.env.DEV, storage });
  installCrashHooks(platform.crash, window);
  const live = createLiveStore({
    api,
    game: store,
    billing: platform.billing,
    analytics: platform.analytics,
    clock: () => Date.now(),
    every: (fn, ms) => {
      const id = window.setInterval(fn, ms);
      return () => window.clearInterval(id);
    },
  });

  let baseScene: BaseScene | null = null;
  let worldScene: WorldScene | null = null;
  let game: Phaser.Game | null = null;
  const ui = mountUi(uiRoot, {
    google: googleSignIn(apiUrl),
    store,
    world,
    alliance,
    live,
    platform,
    onLanguage: async (lang) => {
      storeLanguagePref(storage, lang);
      await changeLanguage(lang);
    },
    onSelectionChange: (id) => baseScene?.setSelected(id),
    onTileSelectionChange: (tile) => worldScene?.setSelectedTile(tile),
    onViewChange: (view) => {
      if (game !== null) showScene(game, view === "map" ? "world" : "base");
    },
  });

  baseScene = new BaseScene(store, (id: BuildingId | null) => ui.select(id));
  worldScene = new WorldScene(store, world, { onSelect: ui.selectTile, onCenter: ui.setCenter });
  const gameRoot = document.getElementById("game");
  if (gameRoot === null) throw new Error("#game missing");
  // The base scene starts; the world scene waits until the map is first opened.
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    backgroundColor: "#3d4a3a",
    scale: hiDpiScaleConfig(gameRoot),
    banner: false,
    // By default Phaser also listens on the whole window, so a tap on a DOM panel or button would reach
    // the scene underneath it (selecting a building or tile behind the alliance panel, say). Listen on the canvas only.
    input: { windowEvents: false },
    scene: [baseScene, worldScene],
  });
  followParentSize(game, gameRoot);

  world.start();
  alliance.start();
  // The badge on the Live button needs one early answer, and a fresh one after each battle report.
  void live.refresh(true);
  world.subscribeReports(() => void live.refresh());
  if (returning) ui.openAccount();
  window.setInterval(store.tick, TICK_MS);
  // Coming back to the app, or while offline: ask the server again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void store.resync();
      void world.refreshReports();
      void alliance.refresh();
    }
  });
  window.setInterval(() => {
    if (store.status() === "offline") void store.resync();
  }, RETRY_MS[RETRY_MS.length - 1]);

  const scene = worldScene;
  // Read-only hooks so screenshot tests can tap buildings and map tiles.
  window.__revolt = {
    buildingScreenPoint: (id: BuildingId) => baseScene.buildingScreenPoint(id),
    frame: () => game?.loop.frame ?? 0,
    map: {
      snapshot: () => world.snapshot(),
      tileScreenPoint: (x, y) => scene.tileScreenPoint(x, y),
      centerOn: (x, y) => scene.centerOn(x, y),
      zoom: () => scene.currentZoom(),
    },
    alliance: {
      snapshot: () => ({ alliance: alliance.alliance(), help: alliance.help(), messages: alliance.messages() }),
    },
  };
};

declare global {
  interface Window {
    __revolt?: {
      buildingScreenPoint: (id: BuildingId) => { x: number; y: number };
      /** Frames Phaser has stepped (updated and drawn) so far, so tests can wait for the next one instead of sleeping. */
      frame: () => number;
      map: {
        snapshot: () => MapSnapshot | null;
        /** CSS-pixel position of a tile's middle on the map view; null until the map has been opened. */
        tileScreenPoint: (x: number, y: number) => { x: number; y: number } | null;
        centerOn: (x: number, y: number) => void;
        zoom: () => number;
      };
      alliance: {
        /** The alliance store as it is now, for tests: membership, open help requests and the chat log. */
        snapshot: () => { alliance: AllianceView | null; help: readonly HelpRequestView[]; messages: readonly ChatMessage[] };
      };
    };
  }
}

void start();
