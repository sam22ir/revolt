import { t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";

/** Shown in the overlay until the server has answered. */
export const showBootStatus = (root: HTMLElement, status: "connecting" | "retrying"): void => {
  const box = el("p", "boot-status", t(status === "connecting" ? "sync.connecting" : "sync.retrying"));
  box.setAttribute("role", "status");
  box.dataset.testid = "boot-status";
  root.replaceChildren(box);
};
