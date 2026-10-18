import Phaser from "phaser";
import type { BuildingId } from "@revolt/rules";
import { changeLanguage, initI18n } from "./i18n/i18n.ts";
import { loadLanguagePref, storeLanguagePref } from "./i18n/language-pref.ts";
import { detectLanguage } from "./i18n/languages.ts";
import { BaseScene } from "./scene/base-scene.ts";
import { followParentSize, hiDpiScaleConfig } from "./scene/hidpi-scale.ts";
import { createGameStore } from "./state/game-store.ts";
import { mountUi } from "./ui/app-ui.ts";
import "./ui/style.css";

const TICK_MS = 250;

const start = async (): Promise<void> => {
  const storage = window.localStorage;
  await initI18n(loadLanguagePref(storage) ?? detectLanguage(navigator.languages));

  // The clock lives in the client; rules only ever receive `now`.
  const store = createGameStore(storage, () => Date.now());

  let scene: BaseScene | null = null;
  const uiRoot = document.getElementById("ui");
  if (uiRoot === null) throw new Error("#ui missing");
  const ui = mountUi(uiRoot, {
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
  const persist = (): void => {
    store.tick();
    store.save();
  };
  document.addEventListener("visibilitychange", persist);
  window.addEventListener("pagehide", persist);

  // Read-only hook so screenshot tests can tap buildings.
  window.__revolt = { buildingScreenPoint: (id: BuildingId) => scene.buildingScreenPoint(id) };
};

declare global {
  interface Window {
    __revolt?: { buildingScreenPoint: (id: BuildingId) => { x: number; y: number } };
  }
}

void start();
