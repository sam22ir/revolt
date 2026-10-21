import { BACKGROUND_IDS, type BackgroundId, DEFAULT_BACKGROUND } from "@revolt/rules";
import { changeLanguage, t } from "../i18n/i18n.ts";
import { storeLanguagePref } from "../i18n/language-pref.ts";
import type { Language } from "../i18n/languages.ts";
import { createConfirmDialog } from "./confirm-dialog.ts";
import { el } from "./dom.ts";
import { createLanguageSwitcher } from "./language-switcher.ts";

/** What the new player chose. `returning` means "I already have an account": sign in with Google first. */
export interface BackgroundChoice {
  readonly background: BackgroundId;
  readonly returning: boolean;
}

/**
 * The first screen of a new device (GDD §2.2): which revolution to play. The choice is made once and cannot be
 * changed (the server fixes it with the account), so tapping a choice asks to confirm it. Plain DOM, so Arabic
 * shaping and right-to-left layout work. A returning player is not trapped here: "I already have an account"
 * starts the default base and opens the account panel, where Google sign-in switches to their own.
 */
export const pickBackground = (root: HTMLElement, storage: Storage): Promise<BackgroundChoice> =>
  new Promise((resolve) => {
    const dialog = createConfirmDialog();

    const build = (): void => {
      const screen = el("section", "bg-picker");
      screen.dataset.testid = "background-picker";
      const bar = el("div", "bg-picker-bar");
      bar.append(
        createLanguageSwitcher((lang: Language) => {
          storeLanguagePref(storage, lang);
          void changeLanguage(lang).then(build);
        }),
      );
      const title = el("h1", "bg-picker-title", t("background.pick.title"));
      const intro = el("p", "panel-desc bg-picker-intro", t("background.pick.desc"));
      const choices = el("div", "bg-choices");
      for (const background of BACKGROUND_IDS) {
        const button = el("button", "bg-choice");
        button.type = "button";
        button.dataset.testid = `background-pick-${background}`;
        button.append(el("strong", "bg-choice-name", t(`background.${background}.name`)), el("span", "bg-choice-desc", t(`background.${background}.desc`)));
        button.addEventListener("click", () => {
          void dialog.ask(t("background.pick.confirm", { name: t(`background.${background}.name`) })).then((yes) => {
            if (!yes) return;
            screen.remove();
            dialog.root.remove();
            resolve({ background, returning: false });
          });
        });
        choices.append(button);
      }
      const returning = el("button", "secondary-btn bg-returning", t("background.pick.returning"));
      returning.type = "button";
      returning.dataset.testid = "background-returning";
      returning.addEventListener("click", () => {
        screen.remove();
        dialog.root.remove();
        resolve({ background: DEFAULT_BACKGROUND, returning: true });
      });
      screen.append(bar, title, intro, choices, el("p", "panel-desc bg-picker-note", t("background.pick.note")), returning);
      root.replaceChildren(screen, dialog.root);
    };
    build();
  });
