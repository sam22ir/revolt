import type { BuildingId } from "@revolt/rules";
import type { Language } from "../i18n/languages.ts";
import type { GameStore } from "../state/game-store.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { createHud } from "./hud.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";

export interface AppUi {
  readonly select: (id: BuildingId | null) => void;
}

interface UiDeps {
  readonly store: GameStore;
  readonly onLanguage: (lang: Language) => Promise<void>;
  readonly onSelectionChange: (id: BuildingId | null) => void;
}

/** Mounts the DOM overlay (HUD + building panel). Rebuilt on language change. */
export const mountUi = (root: HTMLElement, deps: UiDeps): AppUi => {
  let selected: BuildingId | null = null;
  let refresh = (): void => {};

  const build = (): void => {
    const switcher = createLanguageSwitcher((lang) => {
      void deps.onLanguage(lang).then(build);
    });
    const hud = createHud(switcher);
    const panel = createBuildingPanel({
      onUpgrade: (id) => deps.store.upgrade(id),
      onClose: () => select(null),
    });
    panel.show(selected);
    root.replaceChildren(hud.root, panel.root);
    refresh = () => {
      const state = deps.store.state();
      const now = deps.store.now();
      hud.update(state, now);
      panel.update(state, now);
    };
    showPanel = panel.show;
    refresh();
  };

  let showPanel = (_id: BuildingId | null): void => {};

  const select = (id: BuildingId | null): void => {
    selected = id;
    showPanel(id);
    deps.onSelectionChange(id);
    refresh();
  };

  build();
  deps.store.subscribe(() => refresh());
  return { select };
};
