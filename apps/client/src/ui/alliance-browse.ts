import { ALLIANCE_NAME_MAX, ALLIANCE_TAG_MAX, validateAllianceName, validateAllianceTag, type AllianceListItem } from "@revolt/rules";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { AllianceOutcome, AllianceStore } from "../state/alliance-store.ts";
import { allianceResultRow } from "./alliance-rows.ts";
import { el } from "./dom.ts";

export interface AllianceBrowse {
  readonly root: HTMLElement;
  /** Loads the first page of the list. Called when the view is shown. */
  readonly open: () => void;
}

interface BrowseDeps {
  readonly store: AllianceStore;
  /** Shows a refusal (as an i18n reason code) or clears it. */
  readonly onError: (reason: string | null) => void;
}

const SEARCH_DELAY_MS = 300;

/** What a player without an alliance sees: a search over all alliances with Join, and a form to found one. */
export const createAllianceBrowse = ({ store, onError }: BrowseDeps): AllianceBrowse => {
  const root = el("div", "alliance-browse");
  root.append(el("p", "panel-desc", t("alliance.none")));

  const search = el("input", "alliance-input");
  search.type = "search";
  search.placeholder = t("alliance.searchPlaceholder");
  search.setAttribute("aria-label", t("alliance.searchLabel"));
  search.setAttribute("dir", "auto");
  search.autocomplete = "off";
  search.dataset.testid = "alliance-search";
  const status = el("p", "panel-desc alliance-status");
  status.setAttribute("role", "status");
  const results = el("ul", "alliance-list");
  results.dataset.testid = "alliance-results";

  let ticket = 0;
  let timer: number | null = null;

  const showResults = (items: readonly AllianceListItem[]): void => {
    const lang = currentLanguage();
    results.replaceChildren();
    for (const item of items) {
      const row = allianceResultRow(item, lang);
      row.join.addEventListener("click", () => {
        row.join.disabled = true;
        void store.join(item.id).then((outcome) => {
          row.join.disabled = false;
          report(outcome);
        });
      });
      results.append(row.li);
    }
    status.textContent = items.length === 0 ? t("alliance.noResults") : "";
  };

  const report = (outcome: AllianceOutcome): void => onError(outcome.ok ? null : outcome.reason);

  const run = (): void => {
    const mine = ++ticket;
    status.textContent = t("alliance.searching");
    void store.search(search.value.trim()).then((items) => {
      if (mine !== ticket) return;
      if (items === null) {
        results.replaceChildren();
        status.textContent = t("alliance.searchFailed");
        return;
      }
      showResults(items);
    });
  };

  search.addEventListener("input", () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(run, SEARCH_DELAY_MS);
  });

  const form = el("form", "alliance-create");
  form.noValidate = true;
  form.append(el("h3", "panel-sub", t("alliance.createTitle")), el("p", "panel-desc", t("alliance.createHint")));
  const field = (label: string, input: HTMLInputElement): HTMLElement => {
    const wrap = el("label", "alliance-field");
    wrap.append(el("span", undefined, label), input);
    return wrap;
  };
  const name = el("input", "alliance-input");
  name.type = "text";
  name.maxLength = ALLIANCE_NAME_MAX;
  name.setAttribute("dir", "auto");
  name.autocomplete = "off";
  name.dataset.testid = "alliance-name";
  const tag = el("input", "alliance-input alliance-tag-input");
  tag.type = "text";
  tag.maxLength = ALLIANCE_TAG_MAX;
  tag.autocapitalize = "characters";
  tag.autocomplete = "off";
  tag.spellcheck = false;
  // A tag is ASCII and drawn on the map: always left to right, whatever the page language.
  tag.setAttribute("dir", "ltr");
  tag.dataset.testid = "alliance-tag";
  const create = el("button", "upgrade-btn", t("alliance.create"));
  create.type = "submit";
  create.dataset.testid = "alliance-create";
  form.append(field(t("alliance.nameLabel"), name), field(t("alliance.tagLabel"), tag), create);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    // The same rules the server applies, so the common mistakes get an answer without a round trip.
    const cleanName = validateAllianceName(name.value);
    const cleanTag = validateAllianceTag(tag.value);
    if (cleanName === null) return onError("bad_name");
    if (cleanTag === null) return onError("bad_tag");
    create.disabled = true;
    void store.create(cleanName, cleanTag).then((outcome) => {
      create.disabled = false;
      report(outcome);
    });
  });

  root.append(search, status, results, form);
  return {
    root,
    open: () => {
      onError(null);
      run();
    },
  };
};
