import type { HelpRequestView } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { AllianceOutcome, AllianceStore } from "../state/alliance-store.ts";
import { userText } from "./alliance-rows.ts";
import { el } from "./dom.ts";

export interface AllianceHelp {
  readonly root: HTMLElement;
  readonly update: (requests: readonly HelpRequestView[], now: number) => void;
}

interface HelpDeps {
  readonly store: AllianceStore;
  readonly onError: (reason: string | null) => void;
}

/** Whether the viewer can still help this request. */
export const canHelp = (r: HelpRequestView): boolean => !r.mine && !r.helped && r.helps < r.maxHelps;

const rowKey = (r: HelpRequestView): string => `${r.id}:${r.kind}:${r.helps}:${r.mine ? 1 : 0}:${r.helped ? 1 : 0}`;

/** Open help requests of the members, each with a countdown and a Help button. */
export const createAllianceHelp = ({ store, onError }: HelpDeps): AllianceHelp => {
  const root = el("div", "alliance-help");
  const empty = el("p", "panel-desc", t("help.empty"));
  const list = el("ul", "help-list");
  list.setAttribute("aria-label", t("help.list"));
  root.append(list, empty);
  const countdowns = new Map<string, { el: HTMLElement; endsAt: number }>();
  let key = "";

  const report = (outcome: AllianceOutcome): void => onError(outcome.ok ? null : outcome.reason);

  const rebuild = (open: readonly HelpRequestView[]): void => {
    const lang = currentLanguage();
    list.replaceChildren();
    countdowns.clear();
    for (const r of open) {
      const li = el("li", "help-row");
      li.dataset.testid = "help-request";
      li.dataset.id = r.id;
      li.dataset.kind = r.kind;
      li.dataset.mine = r.mine ? "1" : "0";
      const who = el("div", "help-who");
      who.append(userText("bdi", r.handle, "member-handle"), el("span", "help-kind", t(`help.kind.${r.kind}`)));
      const progress = el("span", "help-progress", t("help.progress", { count: formatAmount(lang, r.helps), max: formatAmount(lang, r.maxHelps) }));
      const time = el("span", "help-time");
      countdowns.set(r.id, { el: time, endsAt: r.endsAt });
      const text = el("div", "help-text");
      text.append(who, progress, time);
      li.append(text);
      // The button stays for every row, disabled when there is nothing for this player to do.
      if (r.mine || r.helped) li.append(el("span", "help-note", t(r.mine ? "help.yours" : "help.helped")));
      const give = el("button", "small-btn primary", t("help.give"));
      give.type = "button";
      give.dataset.testid = "help-give";
      give.disabled = !canHelp(r);
      give.addEventListener("click", () => {
        give.disabled = true;
        onError(null);
        void store.giveHelp(r.id).then(report);
      });
      li.append(give);
      list.append(li);
    }
  };

  return {
    root,
    update: (requests, now) => {
      const open = requests.filter((r) => r.endsAt > now);
      empty.hidden = open.length > 0;
      const k = `${currentLanguage()}|${open.map(rowKey).join(",")}`;
      if (k !== key) {
        key = k;
        rebuild(open);
      }
      for (const [id, c] of countdowns) {
        const r = open.find((x) => x.id === id);
        c.el.textContent = t("help.timeLeft", { time: formatDuration((r?.endsAt ?? c.endsAt) - now) });
      }
    },
  };
};
