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
  /** The language switcher, shown in its own row above the account details. */
  readonly settings: HTMLElement;
  /** Told whenever the panel opens or closes, so the overlay can reopen it after a language change. */
  readonly onOpenChange?: (open: boolean) => void;
}

/** Shows whether the base is a guest's or linked to Google, and offers Google sign-in. */
export const createAccountPanel = (deps: AccountDeps): AccountPanel => {
  const root = el("section", "account-panel");
  root.hidden = true;
  root.dataset.testid = "account-panel";
  root.setAttribute("aria-live", "polite");
  let key = "";

  // The head and settings row are built once and never cleared, so they exist before any account data arrives.
  const head = el("div", "panel-head");
  const close = el("button", "panel-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("panel.close"));
  close.addEventListener("click", () => toggle(false));
  head.append(el("h2", "panel-title", t("account.title")), close);
  const settings = el("div", "account-settings");
  settings.append(deps.settings);
  // Only this body is replaced when the account changes.
  const body = el("div", "account-body");
  root.append(head, settings, body);

  const render = (account: AccountView, error: boolean): void => {
    body.replaceChildren();

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
    body.append(status, handle);

    if (deps.google === null) {
      body.append(el("p", "panel-sub", t("account.googleUnavailable")));
    } else {
      const actions = el("div", "account-actions");
      body.append(el("p", "panel-desc", linked === null ? t("account.linkHint") : t("account.switchHint")));
      const failed = (): void => render(account, true);
      deps.google.mount(
        actions,
        linked === null ? t("account.link") : t("account.switch"),
        (idToken) => void deps.onIdToken(idToken).catch(failed),
        failed,
      );
      body.append(actions);
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
      body.append(msg);
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

  const toggle = (open: boolean = Boolean(root.hidden)): void => {
    root.hidden = !open;
    deps.onOpenChange?.(open);
    if (open && last !== null) {
      key = "";
      update(last);
    }
  };

  return { root, toggle, update };
};
