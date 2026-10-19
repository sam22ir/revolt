import type { AllianceListItem, ChatMessage } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { t } from "../i18n/i18n.ts";
import { numberLocale, type Language } from "../i18n/languages.ts";
import { el } from "./dom.ts";

/*
 * Alliance names, player handles and chat are written by other players. Every piece of them goes into the
 * page through `textContent` (never `innerHTML`) on an element with `dir="auto"`, so an Arabic name inside an
 * English sentence, or the reverse, lays out by its own script. The rows are built here, apart from the
 * panels, so a test can feed them hostile text.
 */

/** An element showing player-written text safely. */
export const userText = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] => {
  const node = el(tag, className);
  node.textContent = text;
  node.setAttribute("dir", "auto");
  return node;
};

/** "14:05", in the device's time zone and the language's digits. */
export const clockTime = (at: number, lang: Language): string =>
  new Intl.DateTimeFormat(numberLocale(lang), { hour: "2-digit", minute: "2-digit" }).format(new Date(at));

/** One chat line: who (handle and rank), when, and the text. `myHandle` marks the player's own lines. */
export const chatMessageRow = (msg: ChatMessage, myHandle: string, lang: Language): HTMLLIElement => {
  const mine = msg.handle === myHandle;
  const li = el("li", mine ? "chat-msg mine" : "chat-msg");
  li.dataset.testid = "chat-message";
  li.dataset.id = String(msg.id);
  li.dataset.handle = msg.handle;
  li.dataset.mine = mine ? "1" : "0";
  const meta = el("div", "chat-meta");
  const rank = el("span", "rank-badge", t(`alliance.rank.${msg.rank}`));
  rank.dataset.rank = msg.rank;
  const time = el("time", "chat-time", clockTime(msg.at, lang));
  time.setAttribute("datetime", new Date(msg.at).toISOString());
  meta.append(userText("bdi", msg.handle, "chat-handle"), rank, time);
  li.append(meta, userText("p", msg.text, "chat-text"));
  return li;
};

export interface ResultRow {
  readonly li: HTMLLIElement;
  readonly join: HTMLButtonElement;
}

/** One alliance in the search results: name, tag, how many members, and a Join button. */
export const allianceResultRow = (item: AllianceListItem, lang: Language): ResultRow => {
  const li = el("li", "alliance-row");
  li.dataset.testid = "alliance-result";
  li.dataset.id = item.id;
  const text = el("div", "alliance-row-text");
  const name = userText("span", item.name, "alliance-row-name");
  const tag = userText("span", item.tag, "alliance-row-tag");
  const count = el("span", "alliance-row-count", t("alliance.memberCount", { count: formatAmount(lang, item.members), max: formatAmount(lang, item.maxMembers) }));
  text.append(name, tag, count);
  const join = el("button", "alliance-join", t("alliance.join"));
  join.type = "button";
  join.dataset.testid = "alliance-join";
  join.disabled = item.members >= item.maxMembers;
  li.append(text, join);
  return { li, join };
};
