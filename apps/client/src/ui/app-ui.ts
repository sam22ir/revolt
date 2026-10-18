import type { BuildingId } from "@revolt/rules";
import type { Language } from "../i18n/languages.ts";
import type { GoogleSignIn } from "../net/google.ts";
import type { GameStore } from "../state/game-store.ts";
import { createAccountPanel } from "./account-panel.ts";
import { createBuildingPanel } from "./building-panel.ts";
import { el } from "./dom.ts";
import { createHud } from "./hud.ts";
import { t } from "../i18n/i18n.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";

export interface AppUi {
  readonly select: (id: BuildingId | null) => void;
}

interface UiDeps {
  readonly store: GameStore;
  readonly onLanguage: (lang: Language) => Promise<void>;
  readonly onSelectionChange: (id: BuildingId | null) => void;
  readonly google: GoogleSignIn | null;
}

/** Mounts the DOM overlay (HUD + building panel). Rebuilt on language change. */
export const mountUi = (root: HTMLElement, deps: UiDeps): AppUi => {
  let selected: BuildingId | null = null;
  let refresh = (): void => {};

  const build = (): void => {
    const switcher = createLanguageSwitcher((lang) => {
      void deps.onLanguage(lang).then(build);
    });
    const account = createAccountPanel({ google: deps.google, onIdToken: (idToken) => deps.store.signInWithGoogle(idToken) });
    const accountButton = el("button", "account-open", t("account.button"));
    accountButton.type = "button";
    accountButton.dataset.testid = "account";
    accountButton.addEventListener("click", () => {
      select(null);
      account.toggle();
    });
    const hud = createHud([accountButton, switcher]);
    const panel = createBuildingPanel({
      onUpgrade: (id) => deps.store.upgrade(id),
      onClose: () => select(null),
    });
    panel.show(selected);
    root.replaceChildren(hud.root, panel.root, account.root);
    refresh = () => {
      const state = deps.store.state();
      const now = deps.store.now();
      hud.update(state, now);
      hud.setOffline(deps.store.status() === "offline");
      panel.update(state, now);
      account.update(deps.store.account());
    };
    closeAccount = () => account.toggle(false);
    showPanel = panel.show;
    refresh();
  };

  let showPanel = (_id: BuildingId | null): void => {};
  let closeAccount = (): void => {};

  const select = (id: BuildingId | null): void => {
    selected = id;
    if (id !== null) closeAccount();
    showPanel(id);
    deps.onSelectionChange(id);
    refresh();
  };

  build();
  deps.store.subscribe(() => refresh());
  return { select };
};
