import { t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";
import { userText } from "./alliance-rows.ts";

export interface ConfirmDialog {
  readonly root: HTMLElement;
  /** Shows `message` and resolves true on Confirm, false on Cancel. Asking again cancels the earlier question. */
  readonly ask: (message: string) => Promise<boolean>;
}

/**
 * A yes/no question in the page itself. `window.confirm` blocks the game, looks foreign on a phone and is
 * dismissed by test runners; this one is just DOM. The message may hold a player's handle, so it is text.
 */
export const createConfirmDialog = (): ConfirmDialog => {
  const root = el("div", "dialog-backdrop");
  root.hidden = true;
  root.dataset.testid = "alliance-confirm";
  let settle: ((yes: boolean) => void) | null = null;

  const finish = (yes: boolean): void => {
    root.hidden = true;
    root.replaceChildren();
    const done = settle;
    settle = null;
    done?.(yes);
  };

  return {
    root,
    ask: (message) => {
      settle?.(false);
      const box = el("section", "dialog");
      box.setAttribute("role", "alertdialog");
      box.setAttribute("aria-modal", "true");
      const text = userText("p", message, "panel-desc confirm-text");
      text.dataset.testid = "confirm-text";
      const yes = el("button", "upgrade-btn", t("alliance.confirmYes"));
      yes.type = "button";
      yes.dataset.testid = "confirm-yes";
      yes.addEventListener("click", () => finish(true));
      const no = el("button", "secondary-btn", t("alliance.confirmNo"));
      no.type = "button";
      no.dataset.testid = "confirm-no";
      no.addEventListener("click", () => finish(false));
      box.append(text, yes, no);
      root.replaceChildren(box);
      root.hidden = false;
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
  };
};
