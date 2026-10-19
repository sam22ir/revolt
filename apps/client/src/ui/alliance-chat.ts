import { CHAT_MAX_LENGTH, validateChatText, type ChatMessage } from "@revolt/rules";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { AllianceStore, ChatError } from "../state/alliance-store.ts";
import { chatMessageRow } from "./alliance-rows.ts";
import { el } from "./dom.ts";

export interface AllianceChat {
  readonly root: HTMLElement;
  readonly update: (messages: readonly ChatMessage[], myHandle: string, connected: boolean) => void;
  /** Scrolls to the newest message (when the tab is shown). */
  readonly toBottom: () => void;
  readonly focus: () => void;
  /** Stops listening to the store; call when the overlay is rebuilt. */
  readonly dispose: () => void;
}

interface ChatDeps {
  readonly store: AllianceStore;
}

/** How far from the bottom (px) still counts as "reading the latest". */
const STICK_SLOP = 24;

/**
 * History, live messages and the input. Rows are added by id, never rebuilt, so the scroll position and
 * a half-typed line survive every update; the view follows new messages unless the player scrolled up.
 */
export const createAllianceChat = ({ store }: ChatDeps): AllianceChat => {
  const root = el("div", "alliance-chat");
  const status = el("p", "panel-desc chat-status", t("chat.reconnecting"));
  status.setAttribute("role", "status");
  status.dataset.testid = "chat-status";
  const log = el("ul", "chat-log");
  log.dataset.testid = "chat-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-label", t("chat.log"));
  const empty = el("p", "panel-desc chat-empty", t("chat.empty"));

  const error = el("p", "panel-reason chat-error");
  error.dataset.testid = "chat-error";
  error.setAttribute("role", "status");
  error.hidden = true;

  const form = el("form", "chat-form");
  const input = el("input", "alliance-input chat-input");
  input.type = "text";
  input.maxLength = CHAT_MAX_LENGTH;
  input.autocomplete = "off";
  input.enterKeyHint = "send";
  input.setAttribute("dir", "auto");
  input.placeholder = t("chat.placeholder");
  input.setAttribute("aria-label", t("chat.input"));
  input.dataset.testid = "chat-input";
  const send = el("button", "chat-send", t("chat.send"));
  send.type = "submit";
  send.dataset.testid = "chat-send";
  form.append(input, send);
  root.append(status, log, empty, error, form);

  const rows = new Map<number, HTMLElement>();
  let lastId = -Infinity;

  const nearBottom = (): boolean => log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_SLOP;
  const toBottom = (): void => {
    log.scrollTop = log.scrollHeight;
  };

  const showError = (text: string | null): void => {
    error.hidden = text === null;
    error.textContent = text ?? "";
  };

  const rebuild = (): void => {
    log.replaceChildren();
    rows.clear();
    lastId = -Infinity;
  };

  const update = (messages: readonly ChatMessage[], me: string, connected: boolean): void => {
    status.hidden = connected;
    const lang = currentLanguage();
    const ids = new Set(messages.map((m) => m.id));
    const stick = nearBottom();
    let appended = false;
    let ownNew = false;
    // The store caps the log; rows that fell off the top go too.
    for (const [id, row] of rows) {
      if (ids.has(id)) continue;
      row.remove();
      rows.delete(id);
    }
    // A message older than the newest row (a history after a reconnect) needs the order redone.
    if (messages.some((m) => !rows.has(m.id) && m.id < lastId)) rebuild();
    for (const m of messages) {
      if (rows.has(m.id)) continue;
      const row = chatMessageRow(m, me, lang);
      rows.set(m.id, row);
      log.append(row);
      lastId = m.id;
      appended = true;
      if (m.handle === me) ownNew = true;
    }
    empty.hidden = messages.length > 0;
    // Follow the conversation, unless the player is reading older lines; their own message always shows.
    if (appended && (stick || ownNew)) toBottom();
  };

  const submit = (): void => {
    const text = validateChatText(input.value);
    if (text === null) {
      // An empty line is not worth a message; a refused one (control characters, too long) is.
      if (input.value.trim() !== "") showError(t("reason.bad_text"));
      return;
    }
    if (!store.sendChat(text)) {
      showError(t("chat.notSent"));
      return;
    }
    showError(null);
    input.value = "";
    // Sent lines should show even if the player had scrolled up.
    toBottom();
  };

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    submit();
  });
  input.addEventListener("input", () => showError(null));
  const unsubscribe = store.onChatError((e: ChatError) => showError(t(`reason.${e}`)));

  return {
    root,
    update,
    toBottom,
    focus: () => input.focus(),
    dispose: unsubscribe,
  };
};
