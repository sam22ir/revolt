import Phaser from "phaser";
import type { BuildingId } from "@revolt/rules";
import { changeLanguage, initI18n } from "./i18n/i18n.ts";
import { loadLanguagePref, storeLanguagePref } from "./i18n/language-pref.ts";
import { detectLanguage } from "./i18n/languages.ts";
import { BaseScene } from "./scene/base-scene.ts";
import { followParentSize, hiDpiScaleConfig } from "./scene/hidpi-scale.ts";
import { createApi, defaultApiUrl } from "./net/api.ts";
import { googleSignIn } from "./net/google.ts";
import { connectGameStore, type GameStore } from "./state/game-store.ts";
import { mountUi } from "./ui/app-ui.ts";
import { showBootStatus } from "./ui/boot-status.ts";
import "./ui/style.css";

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
  const store = await connect(uiRoot, () => connectGameStore({ api, storage, clock: () => Date.now() }));

  let scene: BaseScene | null = null;
  const ui = mountUi(uiRoot, {
    google: googleSignIn(apiUrl),
    store,
    onLanguage: async (lang) => {
      storeLanguagePref(storage, lang);
      await changeLanguage(lang);
    },
    onSelectionChange: (id) => scene?.setSelected(id),
  });

  scene = new BaseScene(store, (id: BuildingId | null) => ui.select(id));
  const gameRoot = document.getElementById("game");
  if (gameRoot === null) throw new Error("#game missing");
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    backgroundColor: "#3d4a3a",
    scale: hiDpiScaleConfig(gameRoot),
    banner: false,
    scene,
  });
  followParentSize(game, gameRoot);

  window.setInterval(store.tick, TICK_MS);
  // Coming back to the app, or while offline: ask the server again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void store.resync();
  });
  window.setInterval(() => {
    if (store.status() === "offline") void store.resync();
  }, RETRY_MS[RETRY_MS.length - 1]);

  // Read-only hook so screenshot tests can tap buildings.
  window.__revolt = { buildingScreenPoint: (id: BuildingId) => scene.buildingScreenPoint(id) };
};

declare global {
  interface Window {
    __revolt?: { buildingScreenPoint: (id: BuildingId) => { x: number; y: number } };
  }
}

void start();
