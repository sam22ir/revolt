import type { GoogleSignIn } from "../net/google.ts";
import type { AccountView } from "../net/api.ts";
import { t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";

export interface AccountPanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  readonly update: (account: AccountView) => void;
}

interface AccountDeps {
  readonly google: GoogleSignIn | null;
  readonly onIdToken: (idToken: string) => Promise<void>;
  /** Whether anonymous usage and crash reports may be sent. Off until the player turns it on. */
  readonly consent: { readonly get: () => boolean; readonly set: (on: boolean) => void };
}

/** Shows whether the base is a guest's or linked to Google, and offers Google sign-in. */
export const createAccountPanel = (deps: AccountDeps): AccountPanel => {
  const root = el("section", "account-panel");
  root.hidden = true;
  root.dataset.testid = "account-panel";
  root.setAttribute("aria-live", "polite");
  let key = "";

  const render = (account: AccountView, error: boolean): void => {
    root.replaceChildren();
    const head = el("div", "panel-head");
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", () => toggle(false));
    head.append(el("h2", "panel-title", t("account.title")), close);

    const linked = account.google;
    const status = el("p", "panel-desc");
    status.dataset.testid = "account-status";
    if (linked === null) status.textContent = t("account.guest");
    else if (linked.email === null) status.textContent = t("account.linkedNoEmail");
    else {
      status.append(t("account.linked"), " ", el("bdi", "account-email", linked.email));
    }
    // The name other players see in alliances and chat. It is ASCII, so it reads left to right in every language.
    const handle = el("p", "panel-desc");
    handle.dataset.testid = "account-handle";
    const handleValue = el("bdi", "account-email", account.handle);
    handleValue.setAttribute("dir", "ltr");
    handle.append(`${t("account.handleLabel")}: `, handleValue);
    root.append(head, status, handle);

    if (deps.google === null) {
      root.append(el("p", "panel-sub", t("account.googleUnavailable")));
    } else {
      const actions = el("div", "account-actions");
      root.append(el("p", "panel-desc", linked === null ? t("account.linkHint") : t("account.switchHint")));
      const failed = (): void => render(account, true);
      deps.google.mount(
        actions,
        linked === null ? t("account.link") : t("account.switch"),
        (idToken) => void deps.onIdToken(idToken).catch(failed),
        failed,
      );
      root.append(actions);
    }
    // Analytics and crash reports: off by default, one switch, and what is sent is spelled out.
    const consent = el("label", "account-consent");
    const box = el("input");
    box.type = "checkbox";
    box.checked = deps.consent.get();
    box.dataset.testid = "analytics-consent";
    box.addEventListener("change", () => deps.consent.set(box.checked));
    consent.append(box, el("span", undefined, t("settings.analytics")));
    root.append(consent, el("p", "panel-desc", t("settings.analyticsNote")));
    if (error) {
      const msg = el("p", "panel-reason", t("account.error"));
      msg.dataset.testid = "account-error";
      root.append(msg);
    }
  };

  let last: AccountView | null = null;
  const update = (account: AccountView): void => {
    last = account;
    const k = `${account.id}|${account.handle}|${account.google?.email ?? (account.google === null ? "-" : "?")}`;
    if (k === key) return;
    key = k;
    render(account, false);
  };

  const toggle = (open = root.hidden): void => {
    root.hidden = !open;
    if (open && last !== null) {
      key = "";
      update(last);
    }
  };

  return { root, toggle, update };
};
